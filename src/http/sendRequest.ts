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
    return {
      ok: false,
      timeMs: 0,
      sizeBytes: 0,
      headers: [],
      body: "",
      error: "URL is empty.",
    };
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

  let body: string | undefined;
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
    default: {
      const _never: never = request.body.mode;
      return {
        ok: false,
        timeMs: 0,
        sizeBytes: 0,
        headers: [],
        body: "",
        error: `Unknown body mode: ${String(_never)}`,
      };
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
    return {
      ok: false,
      timeMs: Date.now() - started,
      sizeBytes: 0,
      headers: [],
      body: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
