import {
  ApiRequest,
  emptyAuth,
  emptyPair,
  HeaderPair,
  HttpMethod,
  isHttpMethod,
  RequestAuth,
} from "../models";
import { joinRel, slugify } from "../storage/pathUtils";

interface PostmanCollection {
  info?: { name?: string };
  item?: PostmanItem[];
  event?: PostmanEvent[];
  auth?: PostmanAuth;
  variable?: Array<{ key?: string; value?: string }>;
}

interface PostmanItem {
  name?: string;
  description?: string | { content?: string };
  item?: PostmanItem[];
  request?: PostmanRequest | string;
  event?: PostmanEvent[];
  auth?: PostmanAuth;
}

interface PostmanEvent {
  listen?: string;
  script?: { exec?: string | string[] };
}

interface PostmanAuth {
  type?: string;
  bearer?: PostmanAuthPair[] | { token?: string };
  basic?: PostmanAuthPair[] | { username?: string; password?: string };
  apikey?: PostmanAuthPair[] | { key?: string; value?: string; in?: string };
}

interface PostmanAuthPair {
  key?: string;
  value?: string;
}

interface PostmanRequest {
  method?: string;
  description?: string | { content?: string };
  header?: unknown;
  headers?: unknown;
  url?:
    | string
    | {
        raw?: string;
        query?: Array<{ key?: string; value?: string; disabled?: boolean }>;
      };
  body?: {
    mode?: string;
    raw?: string;
    urlencoded?: Array<{ key?: string; value?: string }>;
  };
  auth?: PostmanAuth;
}

export interface ImportedRequest {
  collection: string;
  folder: string;
  request: ApiRequest;
}

export function parsePostmanCollection(raw: string): {
  collectionName: string;
  requests: ImportedRequest[];
  variables: Record<string, string>;
  collectionAuth: RequestAuth;
} {
  const parsed = JSON.parse(raw) as PostmanCollection;
  const collectionName = parsed.info?.name || "Imported";
  const requests: ImportedRequest[] = [];
  const collectionScripts = scriptsFromEvents(parsed.event);
  walk(
    parsed.item ?? [],
    collectionName,
    "",
    collectionScripts,
    parsed.auth,
    requests
  );
  if (requests.length === 0) {
    throw new Error("No requests found in that Postman collection.");
  }
  return {
    collectionName,
    requests,
    variables: Object.fromEntries(
      (parsed.variable ?? [])
        .filter((item) => item.key?.trim())
        .map((item) => [String(item.key), String(item.value ?? "")])
    ),
    collectionAuth: authFromPostman(parsed.auth, emptyAuth()),
  };
}

function walk(
  items: PostmanItem[],
  collection: string,
  folder: string,
  inheritedScripts: { pre: string; post: string },
  inheritedAuth: PostmanAuth | undefined,
  out: ImportedRequest[]
): void {
  for (const item of items) {
    const scripts = {
      pre: joinScripts(inheritedScripts.pre, scriptsFromEvents(item.event).pre),
      post: joinScripts(scriptsFromEvents(item.event).post, inheritedScripts.post),
    };
    const auth = item.auth ?? inheritedAuth;
    if (item.item && item.item.length) {
      walk(
        item.item,
        collection,
        joinRel(folder, slugify(item.name || "folder")),
        scripts,
        auth,
        out
      );
      continue;
    }
    const name = item.name || "Request";
    if (typeof item.request === "string") {
      out.push({
        collection,
        folder,
        request: {
          name,
          description: textFromPostman(item.description),
          method: "GET",
          url: item.request,
          query: [emptyPair()],
          headers: [emptyPair()],
          body: { mode: "none", raw: "" },
          scripts,
          auth: authFromPostman(auth, emptyAuth()),
        },
      });
      continue;
    }
    if (!item.request) {
      continue;
    }
    out.push({
      collection,
      folder,
      request: toApiRequest(
        name,
        item.request,
        scripts,
        auth,
        textFromPostman(item.description)
      ),
    });
  }
}

function toApiRequest(
  name: string,
  request: PostmanRequest,
  scripts: { pre: string; post: string },
  inheritedAuth: PostmanAuth | undefined,
  itemDescription: string
): ApiRequest {
  const methodRaw = String(request.method || "GET").toUpperCase();
  const method: HttpMethod = isHttpMethod(methodRaw) ? methodRaw : "GET";
  const urlObject = typeof request.url === "object" ? request.url : undefined;
  const url =
    typeof request.url === "string" ? request.url : urlObject?.raw || "";
  const headers = parseHeaders(request.header ?? request.headers);
  const query = (urlObject?.query ?? []).map((item) => ({
    key: item.key ?? "",
    value: item.value ?? "",
    enabled: item.disabled !== true,
  }));

  let mode: ApiRequest["body"]["mode"] = "none";
  let raw = "";
  const bodyMode = request.body?.mode;
  switch (bodyMode) {
    case undefined:
    case "raw":
      raw = request.body?.raw ?? "";
      mode = raw ? guessRawMode(raw, headers) : "none";
      break;
    case "urlencoded":
      mode = "form";
      raw = (request.body?.urlencoded ?? [])
        .map((pair) => `${pair.key ?? ""}=${pair.value ?? ""}`)
        .join("&");
      break;
    case "formdata":
    case "file":
    case "graphql":
      raw = request.body?.raw ?? "";
      mode = raw ? "text" : "none";
      break;
    default:
      raw = request.body?.raw ?? "";
      mode = raw ? "text" : "none";
      break;
  }

  return {
    name,
    description: itemDescription || textFromPostman(request.description),
    method,
    url,
    query: query.length ? query : [emptyPair()],
    headers: headers.length ? headers : [emptyPair()],
    body: { mode, raw },
    scripts,
    auth: authFromPostman(request.auth ?? inheritedAuth, emptyAuth()),
  };
}

function parseHeaders(raw: unknown): HeaderPair[] {
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const split = line.indexOf(":");
        return {
          key: split === -1 ? line : line.slice(0, split).trim(),
          value: split === -1 ? "" : line.slice(split + 1).trim(),
          enabled: true,
        };
      });
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => {
    const header = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      key: String(header.key ?? header.name ?? ""),
      value: String(header.value ?? ""),
      enabled: header.disabled !== true,
    };
  });
}

function scriptsFromEvents(events?: PostmanEvent[]): { pre: string; post: string } {
  let pre = "";
  let post = "";
  for (const event of events ?? []) {
    const text = scriptText(event.script?.exec);
    if (!text) {
      continue;
    }
    if (event.listen === "prerequest") {
      pre = joinScripts(pre, text);
    } else if (event.listen === "test") {
      post = joinScripts(post, text);
    }
  }
  return { pre, post };
}

function scriptText(exec?: string | string[]): string {
  if (!exec) {
    return "";
  }
  return Array.isArray(exec) ? exec.join("\n") : String(exec);
}

function joinScripts(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

function authFromPostman(
  auth: PostmanAuth | undefined,
  fallback: RequestAuth
): RequestAuth {
  if (!auth?.type || auth.type === "noauth") {
    return { ...fallback, type: fallback.type === "inherit" ? "none" : fallback.type };
  }
  if (auth.type === "inherit") {
    return fallback;
  }
  switch (auth.type) {
    case "bearer":
      return {
        ...emptyAuth(),
        type: "bearer",
        token: authPair(auth.bearer, "token"),
      };
    case "basic":
      return {
        ...emptyAuth(),
        type: "basic",
        username: authPair(auth.basic, "username"),
        password: authPair(auth.basic, "password"),
      };
    case "apikey":
      return {
        ...emptyAuth(),
        type: "apikey",
        key: authPair(auth.apikey, "key") || "X-API-Key",
        value: authPair(auth.apikey, "value"),
        addTo: authPair(auth.apikey, "in") === "query" ? "query" : "header",
      };
    default:
      return fallback;
  }
}

function authPair(
  raw: PostmanAuthPair[] | { [key: string]: string | undefined } | undefined,
  key: string
): string {
  if (!raw) {
    return "";
  }
  if (Array.isArray(raw)) {
    return String(raw.find((item) => item.key === key)?.value ?? "");
  }
  return String(raw[key] ?? "");
}

function guessRawMode(raw: string, headers: HeaderPair[]): "json" | "text" {
  const contentType = headers
    .find((header) => header.key.toLowerCase() === "content-type")
    ?.value.toLowerCase();
  if (contentType?.includes("json")) {
    return "json";
  }
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return "json";
  }
  return "text";
}

function textFromPostman(raw: string | { content?: string } | undefined): string {
  if (typeof raw === "string") {
    return raw;
  }
  return String(raw?.content ?? "");
}
