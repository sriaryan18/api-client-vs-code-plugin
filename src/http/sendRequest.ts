import * as fs from "fs";
import * as path from "path";
import { substitute } from "../env/substitute";
import { ApiRequest } from "../models";
import { applyQuery } from "./url";

export interface SendResult {
  ok: boolean;
  status?: number;
  statusText?: string;
  timeMs: number;
  sizeBytes: number;
  headers: Array<{ key: string; value: string }>;
  body: string;
  error?: string;
}

export async function sendRequest(
  request: ApiRequest,
  envValues: Record<string, string>
): Promise<SendResult> {
  const url = applyQuery(
    substitute(request.url.trim(), envValues),
    request.query,
    envValues
  );
  if (!url) {
    return fail(0, "URL is empty.");
  }

  const headers = new Headers();
  for (const header of request.headers) {
    if (!header.enabled || !header.key.trim()) {
      continue;
    }
    headers.set(
      substitute(header.key, envValues),
      substitute(header.value, envValues)
    );
  }

  let body: string | FormData | undefined;
  switch (request.body.mode) {
    case "none":
      body = undefined;
      break;
    case "json":
      body = substitute(request.body.raw, envValues);
      if (!headers.has("content-type")) {
        headers.set("Content-Type", "application/json");
      }
      break;
    case "text":
      body = substitute(request.body.raw, envValues);
      if (!headers.has("content-type")) {
        headers.set("Content-Type", "text/plain");
      }
      break;
    case "form":
      body = substitute(request.body.raw, envValues);
      if (!headers.has("content-type")) {
        headers.set("Content-Type", "application/x-www-form-urlencoded");
      }
      break;
    case "graphql": {
      const built = graphqlBody(request, envValues);
      if ("error" in built) {
        return fail(0, built.error);
      }
      body = built.body;
      if (!headers.has("content-type")) {
        headers.set("Content-Type", "application/json");
      }
      break;
    }
    case "multipart": {
      const built = multipartBody(request, envValues);
      if ("error" in built) {
        return fail(0, built.error);
      }
      body = built.body;
      headers.delete("content-type");
      break;
    }
    default: {
      const _never: never = request.body.mode;
      return fail(0, `Unknown body mode: ${String(_never)}`);
    }
  }

  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : body,
    });
    const text = await response.text();
    const timeMs = Date.now() - started;
    const responseHeaders: Array<{ key: string; value: string }> = [];
    response.headers.forEach((value, key) => {
      responseHeaders.push({ key, value });
    });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      timeMs,
      sizeBytes: Buffer.byteLength(text),
      headers: responseHeaders,
      body: prettyBody(text, response.headers.get("content-type")),
    };
  } catch (error) {
    return fail(
      Date.now() - started,
      error instanceof Error ? error.message : String(error)
    );
  }
}

function graphqlBody(
  request: ApiRequest,
  envValues: Record<string, string>
): { body: string } | { error: string } {
  const query = substitute(request.body.graphqlQuery || request.body.raw, envValues);
  if (!query.trim()) {
    return { error: "GraphQL query is empty." };
  }
  const rawVars = substitute(request.body.graphqlVariables || "{}", envValues).trim();
  let variables: unknown = {};
  if (rawVars) {
    try {
      variables = JSON.parse(rawVars);
    } catch {
      return { error: "GraphQL variables must be JSON." };
    }
  }
  return { body: JSON.stringify({ query, variables }) };
}

function multipartBody(
  request: ApiRequest,
  envValues: Record<string, string>
): { body: FormData } | { error: string } {
  const form = new FormData();
  for (const part of request.body.parts ?? []) {
    if (!part.enabled || !part.key.trim()) {
      continue;
    }
    const key = substitute(part.key, envValues);
    const value = substitute(part.value, envValues);
    if (part.kind === "file") {
      if (!value || !fs.existsSync(value)) {
        return { error: `File not found: ${value || part.key}` };
      }
      const bytes = fs.readFileSync(value);
      form.append(key, new Blob([bytes]), path.basename(value));
    } else {
      form.append(key, value);
    }
  }
  return { body: form };
}

function fail(timeMs: number, error: string): SendResult {
  return {
    ok: false,
    timeMs,
    sizeBytes: 0,
    headers: [],
    body: "",
    error,
  };
}

function prettyBody(text: string, contentType: string | null): string {
  if (!text) {
    return "";
  }
  if (contentType && contentType.includes("json")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}
