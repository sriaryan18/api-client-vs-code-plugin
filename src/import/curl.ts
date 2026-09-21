import {
  ApiRequest,
  emptyAuth,
  emptyPair,
  HeaderPair,
  HttpMethod,
  isHttpMethod,
} from "../models";

export function parseCurl(input: string): ApiRequest {
  const tokens = tokenize(stripPrefix(input.trim()));
  if (tokens.length === 0 || tokens[0].toLowerCase() !== "curl") {
    throw new Error("Paste a curl command that starts with curl.");
  }

  let method: HttpMethod = "GET";
  let url = "";
  const headers: HeaderPair[] = [];
  let rawBody = "";
  let bodySet = false;

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = (): string => {
      i += 1;
      if (i >= tokens.length) {
        throw new Error(`Missing value after ${token}`);
      }
      return tokens[i];
    };

    switch (token) {
      case "-X":
      case "--request": {
        const value = next().toUpperCase();
        if (!isHttpMethod(value)) {
          throw new Error(`Unsupported method: ${value}`);
        }
        method = value;
        break;
      }
      case "-H":
      case "--header": {
        const header = next();
        const split = header.indexOf(":");
        if (split === -1) {
          headers.push({ key: header, value: "", enabled: true });
        } else {
          headers.push({
            key: header.slice(0, split).trim(),
            value: header.slice(split + 1).trim(),
            enabled: true,
          });
        }
        break;
      }
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
      case "--data-ascii":
        rawBody = next();
        bodySet = true;
        if (method === "GET") {
          method = "POST";
        }
        break;
      case "-u":
      case "--user": {
        const creds = next();
        headers.push({
          key: "Authorization",
          value: `Basic ${Buffer.from(creds).toString("base64")}`,
          enabled: true,
        });
        break;
      }
      case "-G":
      case "--get":
        method = "GET";
        break;
      case "-I":
      case "--head":
        method = "HEAD";
        break;
      case "-A":
      case "--user-agent":
        headers.push({ key: "User-Agent", value: next(), enabled: true });
        break;
      case "--url":
        url = next();
        break;
      default:
        if (token.startsWith("-")) {
          if (token.includes("=")) {
            break;
          }
          if (looksLikeFlagWithValue(token)) {
            next();
          }
          break;
        }
        if (!url) {
          url = token;
        }
        break;
    }
  }

  if (!url) {
    throw new Error("Could not find a URL in the curl command.");
  }

  const bodyMode = bodySet ? guessBodyMode(rawBody, headers) : "none";
  return {
    name: guessName(url),
    description: "",
    method,
    url,
    query: [emptyPair()],
    headers: headers.length ? headers : [emptyPair()],
    body: { mode: bodyMode, raw: rawBody },
    scripts: { pre: "", post: "" },
    auth: emptyAuth(),
  };
}

function stripPrefix(input: string): string {
  return input.replace(/^\$\s*/, "").replace(/\\\n/g, " ");
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === "\\" && quote === '"' && i + 1 < input.length) {
        current += input[i + 1];
        i += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function looksLikeFlagWithValue(flag: string): boolean {
  return (
    flag === "-o" ||
    flag === "--output" ||
    flag === "-m" ||
    flag === "--max-time" ||
    flag === "--connect-timeout" ||
    flag === "-w" ||
    flag === "--write-out"
  );
}

function guessBodyMode(
  raw: string,
  headers: HeaderPair[]
): "json" | "text" | "form" {
  const contentType = headers.find(
    (header) => header.key.toLowerCase() === "content-type"
  )?.value.toLowerCase();
  if (contentType?.includes("application/json")) {
    return "json";
  }
  if (contentType?.includes("application/x-www-form-urlencoded")) {
    return "form";
  }
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return "json";
  }
  if (raw.includes("=") && !raw.includes("\n")) {
    return "form";
  }
  return "text";
}

function guessName(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last || parsed.hostname || "Imported request";
  } catch {
    return "Imported request";
  }
}
