import * as fs from "fs";
import * as path from "path";
import {
  ApiFlow,
  ApiRequest,
  authFromUnknown,
  emptyFlow,
  emptyRequest,
  EnvironmentFile,
  flowFromUnknown,
  HeaderPair,
  isHttpMethod,
  pairsFromUnknown,
  RequestAuth,
} from "../models";
import {
  COLLECTION_AUTH_FILE,
  COLLECTION_ENV_FILE,
  COLLECTION_HEADERS_FILE,
  COLLECTIONS_DIR,
  DEFAULTS_FILE,
  ENV_DIR,
  FLOWS_DIR,
  GLOBAL_ENV_NAME,
  joinRel,
  META_JSON_FILES,
  slugify,
} from "./pathUtils";

export interface FolderEntry {
  name: string;
  relPath: string;
}

export class FileStore {
  constructor(private readonly root: string) {}

  rootPath(): string {
    return this.root;
  }

  collectionsPath(): string {
    return path.join(this.root, COLLECTIONS_DIR);
  }

  environmentsPath(): string {
    return path.join(this.root, ENV_DIR);
  }

  resolve(relPath: string): string {
    return path.join(this.collectionsPath(), ...relPath.split("/").filter(Boolean));
  }

  flowsPath(): string {
    return path.join(this.root, FLOWS_DIR);
  }

  ensureLayout(): void {
    fs.mkdirSync(this.collectionsPath(), { recursive: true });
    fs.mkdirSync(this.environmentsPath(), { recursive: true });
    fs.mkdirSync(this.flowsPath(), { recursive: true });
    this.ensureEnvFile(this.globalEnvPath(), GLOBAL_ENV_NAME, {
      baseUrl: "http://localhost:3000",
    });
    this.ensureEnvFile(this.namedEnvPath("local"), "local", {});
    if (!fs.existsSync(this.defaultsPath())) {
      this.writeDefaultHeaders([
        { key: "Accept", value: "application/json", enabled: true },
      ]);
    }
  }

  listCollections(): FolderEntry[] {
    this.ensureLayout();
    return this.listFolders("");
  }

  listFolders(relPath: string): FolderEntry[] {
    const dir = this.resolve(relPath);
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        relPath: joinRel(relPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  listRequestFiles(relPath: string): string[] {
    const dir = this.resolve(relPath);
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".json") && !META_JSON_FILES.has(file))
      .sort((a, b) => a.localeCompare(b));
  }

  listRequestPaths(relPath: string): string[] {
    const files = this.listRequestFiles(relPath).map((file) =>
      path.join(this.resolve(relPath), file)
    );
    const nested = this.listFolders(relPath).flatMap((folder) =>
      this.listRequestPaths(folder.relPath)
    );
    return [...files, ...nested];
  }

  createCollection(name: string): string {
    const relPath = this.createFolder("", name);
    this.writeCollectionEnv(this.collectionName(relPath), { name: relPath, values: {} });
    return relPath;
  }

  createFolder(parentRel: string, name: string): string {
    this.ensureLayout();
    const relPath = joinRel(parentRel, slugify(name));
    fs.mkdirSync(this.resolve(relPath), { recursive: true });
    return relPath;
  }

  createRequest(relDir: string, name: string): string {
    this.ensureLayout();
    const dir = this.resolve(relDir);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${slugify(name)}.json`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(emptyRequest(name), null, 2));
    }
    return filePath;
  }

  readRequest(filePath: string): ApiRequest {
    const raw = fs.readFileSync(filePath, "utf8");
    return normalizeRequest(JSON.parse(raw), path.basename(filePath, ".json"));
  }

  writeRequest(filePath: string, request: ApiRequest): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(request, null, 2));
  }

  deleteRequest(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  deleteFolder(relPath: string): void {
    const target = this.resolve(relPath);
    const root = this.collectionsPath();
    if (!relPath || target === root || !target.startsWith(root + path.sep)) {
      throw new Error("Cannot delete that folder.");
    }
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }

  duplicateRequest(filePath: string): string {
    const request = this.readRequest(filePath);
    request.name = `${request.name} copy`;
    const target = path.join(path.dirname(filePath), `${slugify(request.name)}.json`);
    this.writeRequest(target, request);
    return target;
  }

  collectionName(relPath: string): string {
    return relPath.split("/").filter(Boolean)[0] || relPath;
  }

  globalEnvPath(): string {
    return path.join(this.environmentsPath(), `${GLOBAL_ENV_NAME}.json`);
  }

  namedEnvPath(name: string): string {
    return path.join(this.environmentsPath(), `${slugify(name)}.json`);
  }

  collectionEnvPath(collection: string): string {
    return path.join(this.resolve(this.collectionName(collection)), COLLECTION_ENV_FILE);
  }

  readEnvFile(filePath: string, fallbackName: string): EnvironmentFile {
    if (!fs.existsSync(filePath)) {
      return { name: fallbackName, values: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<EnvironmentFile>;
    return {
      name: parsed.name || fallbackName,
      values: parsed.values ?? {},
    };
  }

  writeEnvFile(filePath: string, env: EnvironmentFile): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(env, null, 2));
  }

  readGlobalEnv(): EnvironmentFile {
    this.ensureLayout();
    return this.readEnvFile(this.globalEnvPath(), GLOBAL_ENV_NAME);
  }

  writeGlobalEnv(env: EnvironmentFile): void {
    this.writeEnvFile(this.globalEnvPath(), { ...env, name: GLOBAL_ENV_NAME });
  }

  readNamedEnv(name: string): EnvironmentFile {
    this.ensureLayout();
    return this.readEnvFile(this.namedEnvPath(name), name);
  }

  writeNamedEnv(env: EnvironmentFile): void {
    this.writeEnvFile(this.namedEnvPath(env.name), env);
  }

  readCollectionEnv(collection: string): EnvironmentFile {
    if (!collection) {
      return { name: "", values: {} };
    }
    return this.readEnvFile(this.collectionEnvPath(collection), collection);
  }

  writeCollectionEnv(collection: string, env: EnvironmentFile): void {
    this.writeEnvFile(this.collectionEnvPath(collection), {
      name: collection,
      values: env.values,
    });
  }

  listNamedEnvironments(): EnvironmentFile[] {
    this.ensureLayout();
    return fs
      .readdirSync(this.environmentsPath())
      .filter((file) => file.endsWith(".json") && file !== `${GLOBAL_ENV_NAME}.json`)
      .map((file) =>
        this.readEnvFile(
          path.join(this.environmentsPath(), file),
          path.basename(file, ".json")
        )
      );
  }

  envScopeValues(
    scope: "global" | "profile" | "collection",
    name = ""
  ): Record<string, string> {
    switch (scope) {
      case "global":
        return this.readGlobalEnv().values;
      case "profile":
        return this.readNamedEnv(name || "local").values;
      case "collection":
        return this.readCollectionEnv(name).values;
      default: {
        const _never: never = scope;
        throw new Error(`Unknown env scope: ${String(_never)}`);
      }
    }
  }

  writeEnvScope(
    scope: "global" | "profile" | "collection",
    name: string,
    values: Record<string, string>
  ): void {
    switch (scope) {
      case "global":
        this.writeGlobalEnv({ name: "global", values });
        return;
      case "profile":
        this.writeNamedEnv({ name: name || "local", values });
        return;
      case "collection":
        if (!name) {
          throw new Error("Collection name is required.");
        }
        this.writeCollectionEnv(name, { name, values });
        return;
      default: {
        const _never: never = scope;
        throw new Error(`Unknown env scope: ${String(_never)}`);
      }
    }
  }

  setEnvValue(
    scope: "global" | "profile" | "collection",
    name: string,
    key: string,
    value: string
  ): Record<string, string> {
    const trimmed = key.trim();
    if (!trimmed) {
      throw new Error("Env key is required.");
    }
    const values = {
      ...this.envScopeValues(scope, name),
      [trimmed]: String(value),
    };
    this.writeEnvScope(scope, name, values);
    return values;
  }

  deleteEnvValue(
    scope: "global" | "profile" | "collection",
    name: string,
    key: string
  ): Record<string, string> {
    const values = { ...this.envScopeValues(scope, name) };
    delete values[key];
    this.writeEnvScope(scope, name, values);
    return values;
  }

  findFlow(query: string): { name: string; filePath: string; flow: ApiFlow } {
    const needle = query.trim().toLowerCase();
    const flows = this.listFlows();
    if (!flows.length) {
      throw new Error("No flows saved yet.");
    }
    if (!needle && flows.length === 1) {
      return flows[0];
    }
    const exact = flows.find(
      (entry) =>
        entry.flow.name.toLowerCase() === needle ||
        entry.name.toLowerCase() === needle
    );
    if (exact) {
      return exact;
    }
    const hits = flows.filter(
      (entry) =>
        entry.flow.name.toLowerCase().includes(needle) ||
        entry.name.toLowerCase().includes(needle)
    );
    if (hits.length === 1) {
      return hits[0];
    }
    if (hits.length > 1) {
      throw new Error(
        `Several flows match "${query}": ${hits.map((item) => item.flow.name).join(", ")}`
      );
    }
    throw new Error(
      `No flow matches "${query}". Saved flows: ${flows.map((item) => item.flow.name).join(", ")}`
    );
  }

  mergedEnv(collection: string, named: string): Record<string, string> {
    return {
      ...this.readGlobalEnv().values,
      ...this.readNamedEnv(named).values,
      ...this.readCollectionEnv(collection).values,
    };
  }

  persistScriptEnv(
    collection: string,
    named: string,
    before: Record<string, string>,
    after: Record<string, string>
  ): void {
    const changed: Record<string, string> = {};
    for (const [key, value] of Object.entries(after)) {
      if (before[key] !== value) {
        changed[key] = value;
      }
    }
    if (!Object.keys(changed).length) {
      return;
    }
    if (collection) {
      const current = this.readCollectionEnv(collection);
      this.writeCollectionEnv(collection, {
        name: collection,
        values: { ...current.values, ...changed },
      });
      return;
    }
    const current = this.readNamedEnv(named);
    this.writeNamedEnv({ name: named, values: { ...current.values, ...changed } });
  }

  listFlows(): Array<{ name: string; filePath: string; flow: ApiFlow }> {
    this.ensureLayout();
    return fs
      .readdirSync(this.flowsPath())
      .filter((file) => file.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b))
      .map((file) => {
        const filePath = path.join(this.flowsPath(), file);
        return {
          name: path.basename(file, ".json"),
          filePath,
          flow: this.readFlow(filePath),
        };
      });
  }

  createFlow(name: string): string {
    this.ensureLayout();
    const filePath = path.join(this.flowsPath(), `${slugify(name)}.json`);
    if (!fs.existsSync(filePath)) {
      this.writeFlow(filePath, emptyFlow(name));
    }
    return filePath;
  }

  readFlow(filePath: string): ApiFlow {
    if (!fs.existsSync(filePath)) {
      return emptyFlow(path.basename(filePath, ".json"));
    }
    return flowFromUnknown(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
      path.basename(filePath, ".json")
    );
  }

  writeFlow(filePath: string, flow: ApiFlow): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(flow, null, 2));
  }

  deleteFlow(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  findRequestPath(folder: string, name: string): string | undefined {
    const exact = this.searchRequests(name).find(
      (item) => item.folder === folder && item.request.name === name
    );
    if (exact) {
      return exact.path;
    }
    const filePath = path.join(this.resolve(folder), `${slugify(name)}.json`);
    return fs.existsSync(filePath) ? filePath : undefined;
  }

  requestFolder(filePath: string): string {
    return path
      .relative(this.collectionsPath(), path.dirname(filePath))
      .split(path.sep)
      .join("/");
  }

  searchRequests(query: string): Array<{ path: string; request: ApiRequest; folder: string }> {
    const needle = query.trim().toLowerCase();
    return this.listRequestPaths("").flatMap((filePath) => {
      const request = this.readRequest(filePath);
      const folder = path
        .relative(this.collectionsPath(), path.dirname(filePath))
        .split(path.sep)
        .join("/");
      const hay =
        `${request.name} ${request.description} ${request.method} ${request.url} ${folder}`.toLowerCase();
      if (!needle || hay.includes(needle)) {
        return [{ path: filePath, request, folder }];
      }
      return [];
    });
  }

  defaultsPath(): string {
    return path.join(this.root, DEFAULTS_FILE);
  }

  readDefaultHeaders(): HeaderPair[] {
    return this.readHeaderFile(this.defaultsPath());
  }

  writeDefaultHeaders(headers: HeaderPair[]): void {
    this.writeHeaderFile(this.defaultsPath(), headers);
  }

  readCollectionHeaders(collection: string): HeaderPair[] {
    if (!collection) {
      return [];
    }
    return this.readHeaderFile(
      path.join(this.resolve(this.collectionName(collection)), COLLECTION_HEADERS_FILE)
    );
  }

  writeCollectionHeaders(collection: string, headers: HeaderPair[]): void {
    this.writeHeaderFile(
      path.join(this.resolve(this.collectionName(collection)), COLLECTION_HEADERS_FILE),
      headers
    );
  }

  readCollectionAuth(collection: string): RequestAuth {
    if (!collection) {
      return authFromUnknown(undefined);
    }
    const filePath = path.join(
      this.resolve(this.collectionName(collection)),
      COLLECTION_AUTH_FILE
    );
    if (!fs.existsSync(filePath)) {
      return authFromUnknown(undefined);
    }
    return authFromUnknown(JSON.parse(fs.readFileSync(filePath, "utf8")));
  }

  writeCollectionAuth(collection: string, auth: RequestAuth): void {
    const filePath = path.join(
      this.resolve(this.collectionName(collection)),
      COLLECTION_AUTH_FILE
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(auth, null, 2));
  }

  private readHeaderFile(filePath: string): HeaderPair[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      headers?: unknown;
    };
    return pairsFromUnknown(parsed.headers).filter((pair) => pair.key.trim());
  }

  private writeHeaderFile(filePath: string, headers: HeaderPair[]): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ headers }, null, 2));
  }

  private ensureEnvFile(
    filePath: string,
    name: string,
    values: Record<string, string>
  ): void {
    if (!fs.existsSync(filePath)) {
      this.writeEnvFile(filePath, { name, values });
    }
  }
}

function normalizeRequest(raw: unknown, fallbackName: string): ApiRequest {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const methodRaw = String(data.method || "GET").toUpperCase();
  const bodyRaw =
    data.body && typeof data.body === "object"
      ? (data.body as Record<string, unknown>)
      : {};
  const scriptsRaw =
    data.scripts && typeof data.scripts === "object"
      ? (data.scripts as Record<string, unknown>)
      : {};
  const mode = bodyRaw.mode;
  return {
    name: String(data.name || fallbackName),
    description: String(data.description ?? ""),
    method: isHttpMethod(methodRaw) ? methodRaw : "GET",
    url: String(data.url || ""),
    query: pairsFromUnknown(data.query),
    headers: pairsFromUnknown(data.headers),
    body: {
      mode:
        mode === "json" || mode === "text" || mode === "form" || mode === "none"
          ? mode
          : "none",
      raw: String(bodyRaw.raw ?? ""),
    },
    scripts: {
      pre: String(scriptsRaw.pre ?? ""),
      post: String(scriptsRaw.post ?? ""),
    },
    auth: authFromUnknown(data.auth),
  };
}
