import { substitute } from "../env/substitute";
import { applyQuery } from "../http/url";
import { ApiRequest } from "../models";

export function toCurl(
  request: ApiRequest,
  envValues: Record<string, string>
): string {
  const url = applyQuery(substitute(request.url.trim(), envValues), request.query, envValues);
  const parts = ["curl", "-sS", "-X", request.method, quote(url)];
  for (const header of request.headers) {
    if (!header.enabled || !header.key.trim()) {
      continue;
    }
    parts.push(
      "-H",
      quote(
        `${substitute(header.key, envValues)}: ${substitute(header.value, envValues)}`
      )
    );
  }
  if (
    request.body.mode !== "none" &&
    request.body.raw &&
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {
    parts.push("--data-raw", quote(substitute(request.body.raw, envValues)));
  }
  return parts.join(" ");
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
