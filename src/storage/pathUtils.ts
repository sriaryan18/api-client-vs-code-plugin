import * as os from "os";
import * as path from "path";

export const COLLECTIONS_DIR = "collections";
export const FLOWS_DIR = "flows";
export const ENV_DIR = "environments";
export const COLLECTION_ENV_FILE = "env.json";
export const COLLECTION_HEADERS_FILE = "headers.json";
export const COLLECTION_AUTH_FILE = "auth.json";
export const DEFAULTS_FILE = "defaults.json";
export const GLOBAL_ENV_NAME = "global";
export const SECRETS_FILE = "secrets.local.json";
export const SECRETS_GITIGNORE = "environments/secrets.local.json";

export const META_JSON_FILES = new Set([
  COLLECTION_ENV_FILE,
  COLLECTION_HEADERS_FILE,
  COLLECTION_AUTH_FILE,
]);

export function defaultNewRoot(): string {
  return path.join(os.homedir(), "api-collections");
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "untitled";
}

export function joinRel(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

