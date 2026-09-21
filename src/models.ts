export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type BodyMode = "none" | "json" | "text" | "form" | "graphql" | "multipart";

export type EnvScope = "global" | "profile" | "collection" | "secrets";

export interface HeaderPair {
  key: string;
  value: string;
  enabled: boolean;
}

export interface MultipartPart {
  key: string;
  kind: "text" | "file";
  value: string;
  enabled: boolean;
}

export interface RequestBody {
  mode: BodyMode;
  raw: string;
  graphqlQuery: string;
  graphqlVariables: string;
  parts: MultipartPart[];
}

export interface RequestScripts {
  pre: string;
  post: string;
}

export type AuthType = "inherit" | "none" | "bearer" | "basic" | "apikey";
export type AuthAddTo = "header" | "query";

export interface RequestAuth {
  type: AuthType;
  token: string;
  username: string;
  password: string;
  key: string;
  value: string;
  addTo: AuthAddTo;
}

export interface ApiRequest {
  name: string;
  description: string;
  method: HttpMethod;
  url: string;
  query: HeaderPair[];
  headers: HeaderPair[];
  body: RequestBody;
  scripts: RequestScripts;
  auth: RequestAuth;
}

export interface EnvironmentFile {
  name: string;
  values: Record<string, string>;
}

export interface FlowStep {
  folder: string;
  name: string;
  runScripts: boolean;
}

export interface ApiFlow {
  name: string;
  env: string;
  stopOnError: boolean;
  runScripts: boolean;
  delayMs: number;
  steps: FlowStep[];
}

export function emptyFlow(name: string): ApiFlow {
  return {
    name,
    env: "local",
    stopOnError: true,
    runScripts: true,
    delayMs: 0,
    steps: [],
  };
}

export function flowFromUnknown(raw: unknown, fallbackName: string): ApiFlow {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const steps = Array.isArray(data.steps)
    ? data.steps.map((item): FlowStep => {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          folder: String(row.folder ?? ""),
          name: String(row.name ?? ""),
          runScripts: row.runScripts !== false,
        };
      })
    : [];
  return {
    name: String(data.name || fallbackName),
    env: String(data.env || "local"),
    stopOnError: data.stopOnError !== false,
    runScripts: data.runScripts !== false,
    delayMs: Math.max(0, Number(data.delayMs) || 0),
    steps,
  };
}

export function emptyPair(): HeaderPair {
  return { key: "", value: "", enabled: true };
}

export function emptyPart(): MultipartPart {
  return { key: "", kind: "text", value: "", enabled: true };
}

export function emptyBody(): RequestBody {
  return {
    mode: "none",
    raw: "",
    graphqlQuery: "",
    graphqlVariables: "{}",
    parts: [emptyPart()],
  };
}

export function isBodyMode(value: string): value is BodyMode {
  switch (value) {
    case "none":
    case "json":
    case "text":
    case "form":
    case "graphql":
    case "multipart":
      return true;
    default:
      return false;
  }
}

export function partsFromUnknown(raw: unknown): MultipartPart[] {
  if (!Array.isArray(raw)) {
    return [emptyPart()];
  }
  const parts = raw.map((item): MultipartPart => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      key: String(row.key ?? ""),
      kind: row.kind === "file" ? "file" : "text",
      value: String(row.value ?? ""),
      enabled: row.enabled !== false,
    };
  });
  return parts.length ? parts : [emptyPart()];
}

export function emptyRequest(name: string): ApiRequest {
  return {
    name,
    description: "",
    method: "GET",
    url: "",
    query: [emptyPair()],
    headers: [emptyPair()],
    body: emptyBody(),
    scripts: { pre: "", post: "" },
    auth: emptyAuth(),
  };
}

export function emptyAuth(): RequestAuth {
  return {
    type: "inherit",
    token: "",
    username: "",
    password: "",
    key: "",
    value: "",
    addTo: "header",
  };
}

export function isAuthType(value: string): value is AuthType {
  switch (value) {
    case "inherit":
    case "none":
    case "bearer":
    case "basic":
    case "apikey":
      return true;
    default:
      return false;
  }
}

export function authFromUnknown(raw: unknown): RequestAuth {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const type = String(data.type || "inherit");
  const addTo = data.addTo === "query" ? "query" : "header";
  return {
    type: isAuthType(type) ? type : "inherit",
    token: String(data.token ?? ""),
    username: String(data.username ?? ""),
    password: String(data.password ?? ""),
    key: String(data.key ?? ""),
    value: String(data.value ?? ""),
    addTo,
  };
}

export function isHttpMethod(value: string): value is HttpMethod {
  switch (value) {
    case "GET":
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
    case "HEAD":
    case "OPTIONS":
      return true;
    default:
      return false;
  }
}

export function pairsFromUnknown(raw: unknown): HeaderPair[] {
  if (!Array.isArray(raw)) {
    return [emptyPair()];
  }
  const pairs = raw.map((item): HeaderPair => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      key: String(row.key ?? ""),
      value: String(row.value ?? ""),
      enabled: row.enabled !== false,
    };
  });
  return pairs.length ? pairs : [emptyPair()];
}
