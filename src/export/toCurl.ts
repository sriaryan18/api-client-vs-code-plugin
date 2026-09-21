import { substitute } from "../env/substitute";
import { applyQuery } from "../http/url";
import { ApiRequest } from "../models";

export function toCurl(
  request: ApiRequest,
  envValues: Record<string, string>
): string {
  const url = applyQuery(substitute(request.url.trim(), envValues), request.query, envValues);
  const parts = ["curl", "-sS", "-X", request.method, quote(url)];
  const skipContentType = request.body.mode === "multipart";
  for (const header of request.headers) {
    if (!header.enabled || !header.key.trim()) {
      continue;
    }
    if (skipContentType && header.key.toLowerCase() === "content-type") {
      continue;
    }
    parts.push(
      "-H",
      quote(
        `${substitute(header.key, envValues)}: ${substitute(header.value, envValues)}`
      )
    );
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    appendBody(parts, request, envValues);
  }
  return parts.join(" ");
}

function appendBody(
  parts: string[],
  request: ApiRequest,
  envValues: Record<string, string>
): void {
  switch (request.body.mode) {
    case "none":
      return;
    case "json":
    case "text":
    case "form":
      if (request.body.raw) {
        parts.push("--data-raw", quote(substitute(request.body.raw, envValues)));
      }
      return;
    case "graphql": {
      const query = substitute(request.body.graphqlQuery || request.body.raw, envValues);
      let variables: unknown = {};
      try {
        variables = JSON.parse(
          substitute(request.body.graphqlVariables || "{}", envValues) || "{}"
        );
      } catch {
        variables = {};
      }
      parts.push("--data-raw", quote(JSON.stringify({ query, variables })));
      return;
    }
    case "multipart":
      for (const part of request.body.parts ?? []) {
        if (!part.enabled || !part.key.trim()) {
          continue;
        }
        const key = substitute(part.key, envValues);
        const value = substitute(part.value, envValues);
        parts.push(
          "-F",
          quote(part.kind === "file" ? `${key}=@${value}` : `${key}=${value}`)
        );
      }
      return;
    default: {
      const _never: never = request.body.mode;
      void _never;
    }
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
