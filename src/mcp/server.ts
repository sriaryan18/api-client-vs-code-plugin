#!/usr/bin/env node
import * as fs from "fs";
import { emptyRequest, FlowStep, isHttpMethod } from "../models";
import { formatFlowRun, runFlow } from "../runner/runFlow";
import { runOneRequest } from "../runner/runOne";
import { FileStore } from "../storage/fileStore";

interface RpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

const store = new FileStore(requiredRoot());
store.ensureLayout();

let buffer = Buffer.alloc(0);
let replyMode: "lsp" | "ndjson" = "lsp";
process.stdin.resume();
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});
process.stdin.on("end", () => process.exit(0));

function requiredRoot(): string {
  const root = process.env.API_CLIENT_ROOT;
  if (!root) {
    process.stderr.write("API_CLIENT_ROOT is required.\n");
    process.exit(1);
  }
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

function drain(): void {
  while (readContentLength() || readNdjson()) {
    // keep reading
  }
}

function readContentLength(): boolean {
  const crlf = buffer.indexOf("\r\n\r\n");
  const lf = buffer.indexOf("\n\n");
  const headerEnd = firstHeaderEnd(crlf, lf);
  if (headerEnd === -1) {
    return false;
  }
  const sep = crlf === headerEnd ? 4 : 2;
  const header = buffer.slice(0, headerEnd).toString("utf8");
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) {
    return false;
  }
  const length = Number(match[1]);
  const start = headerEnd + sep;
  if (buffer.length < start + length) {
    return false;
  }
  const body = buffer.slice(start, start + length).toString("utf8");
  buffer = buffer.slice(start + length);
  replyMode = "lsp";
  void handle(JSON.parse(body) as RpcRequest);
  return true;
}

function firstHeaderEnd(crlf: number, lf: number): number {
  if (crlf === -1) {
    return lf;
  }
  if (lf === -1) {
    return crlf;
  }
  return Math.min(crlf, lf);
}

function readNdjson(): boolean {
  if (buffer.length === 0 || buffer[0] !== 123) {
    return false;
  }
  const newline = buffer.indexOf("\n");
  if (newline === -1) {
    return false;
  }
  const line = buffer.slice(0, newline).toString("utf8").trim();
  buffer = buffer.slice(newline + 1);
  if (!line) {
    return true;
  }
  replyMode = "ndjson";
  void handle(JSON.parse(line) as RpcRequest);
  return true;
}

function write(message: unknown): void {
  const json = JSON.stringify(message);
  if (replyMode === "ndjson") {
    process.stdout.write(`${json}\n`);
    return;
  }
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`
  );
}

async function handle(message: RpcRequest): Promise<void> {
  if (!message.method) {
    return;
  }
  const hasId = message.id !== undefined && message.id !== null;
  if (!hasId) {
    return;
  }
  try {
    const result = await dispatch(message.method, message.params ?? {});
    write({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    write({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function dispatch(
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  switch (method) {
    case "initialize": {
      const requested = String(
        (params.protocolVersion as string | undefined) || "2024-11-05"
      );
      return {
        protocolVersion: requested,
        capabilities: { tools: {} },
        serverInfo: { name: "api-client", version: "0.5.6" },
      };
    }
    case "ping":
      return {};
    case "notifications/initialized":
    case "initialized":
      return {};
    case "tools/list":
      return { tools: toolList() };
    case "tools/call":
      return callTool(
        String(params.name ?? ""),
        (params.arguments ?? {}) as Record<string, unknown>
      );
    default:
      throw new Error(`Unsupported method: ${method}`);
  }
}

function toolList() {
  return [
    {
      name: "search_requests",
      description:
        "Search saved API requests across all collections by name, description, method, URL, or folder.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Text to match against name, description, method, URL, or folder. Empty lists all requests.",
          },
        },
      },
    },
    {
      name: "list_collections",
      description: "List collections and their folders.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_request",
      description: "Read one saved request by collection/folder path and name.",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string" },
          name: { type: "string" },
        },
        required: ["folder", "name"],
      },
    },
    {
      name: "add_request",
      description: "Create or update a request in a collection folder.",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string" },
          name: { type: "string" },
          method: { type: "string" },
          url: { type: "string" },
          body: { type: "string" },
          description: { type: "string" },
        },
        required: ["folder", "name", "url"],
      },
    },
    {
      name: "send_request",
      description:
        "Send a saved request using merged global + profile + collection env. Runs pre/test scripts.",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string" },
          name: { type: "string" },
          env: { type: "string" },
        },
        required: ["folder", "name"],
      },
    },
    {
      name: "list_flows",
      description: "List saved API flows (ordered groups of requests).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_flow",
      description: "Read one saved flow and its steps.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    {
      name: "create_flow",
      description:
        "Create or update a flow. Pass steps as [{folder, name}] or 'folder/request, folder/request'.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          env: { type: "string" },
          stopOnError: { type: "boolean" },
          runScripts: { type: "boolean" },
          steps: {
            description:
              "Requests in order. Array of {folder, name} or a comma list like collection/Login.",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "add_flow_step",
      description: "Add one saved request to a flow.",
      inputSchema: {
        type: "object",
        properties: {
          flow: { type: "string" },
          folder: { type: "string" },
          name: { type: "string" },
          runScripts: { type: "boolean" },
        },
        required: ["flow", "folder", "name"],
      },
    },
    {
      name: "run_flow",
      description:
        "Run a saved flow by name, like 'login'. Steps run in order. Scripts run unless runScripts is false.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Flow name or part of the name" },
          env: { type: "string", description: "Optional profile, like local" },
          runScripts: { type: "boolean" },
        },
        required: ["name"],
      },
    },
    {
      name: "list_env",
      description:
        "List environment scopes and their keys: global, profiles, and collections.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_env",
      description:
        "Read env values. scope is global, profile, or collection. name is the profile or collection.",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string" },
          name: { type: "string" },
          key: { type: "string" },
        },
      },
    },
    {
      name: "set_env",
      description:
        "Add or edit one env variable. scope is global, profile, or collection.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "string" },
          scope: { type: "string" },
          name: { type: "string" },
        },
        required: ["key", "value"],
      },
    },
    {
      name: "delete_env",
      description: "Remove one env variable from a scope.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          scope: { type: "string" },
          name: { type: "string" },
        },
        required: ["key"],
      },
    },
  ];
}

async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const text = JSON.stringify(await runTool(name, args), null, 2);
  return { content: [{ type: "text", text }] };
}

async function runTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "search_requests":
      return store.searchRequests(String(args.query ?? "")).map((item) => ({
        folder: item.folder,
        name: item.request.name,
        description: item.request.description || undefined,
        method: item.request.method,
        url: item.request.url,
      }));
    case "list_collections":
      return store.listCollections().map((entry) => ({
        name: entry.name,
        folders: store.listFolders(entry.relPath).map((folder) => folder.relPath),
        requests: store.listRequestPaths(entry.relPath).length,
      }));
    case "get_request":
      return store.readRequest(
        resolveNamed(String(args.folder), String(args.name))
      );
    case "add_request": {
      const folder = String(args.folder);
      const requestName = String(args.name);
      const filePath = store.createRequest(folder, requestName);
      const request = store.readRequest(filePath);
      request.name = requestName;
      const method = String(args.method || request.method).toUpperCase();
      request.method = isHttpMethod(method) ? method : "GET";
      request.url = String(args.url || request.url);
      if (args.description !== undefined) {
        request.description = String(args.description);
      }
      if (args.body) {
        request.body = { mode: "json", raw: String(args.body) };
      }
      if (!request.name) {
        Object.assign(request, emptyRequest(requestName));
      }
      store.writeRequest(filePath, request);
      return { folder, filePath, request };
    }
    case "send_request": {
      const folder = String(args.folder);
      const filePath = resolveNamed(folder, String(args.name));
      const envName = String(args.env || "local");
      const collection = store.collectionName(folder);
      const before = store.mergedEnv(collection, envName);
      const env = { ...before };
      const run = await runOneRequest(store, filePath, env);
      store.persistScriptEnv(collection, envName, before, env);
      return run;
    }
    case "list_flows":
      return store.listFlows().map((entry) => ({
        name: entry.flow.name,
        env: entry.flow.env,
        steps: entry.flow.steps.length,
        runScripts: entry.flow.runScripts,
      }));
    case "get_flow": {
      const found = store.findFlow(String(args.name ?? ""));
      return found.flow;
    }
    case "create_flow": {
      const flowName = String(args.name ?? "").trim();
      if (!flowName) {
        throw new Error("Flow name is required.");
      }
      const filePath = store.createFlow(flowName);
      const flow = store.readFlow(filePath);
      flow.name = flowName;
      if (args.env) {
        flow.env = String(args.env);
      }
      if (args.stopOnError !== undefined) {
        flow.stopOnError = Boolean(args.stopOnError);
      }
      if (args.runScripts !== undefined) {
        flow.runScripts = Boolean(args.runScripts);
      }
      if (args.steps !== undefined) {
        flow.steps = parseSteps(args.steps);
      }
      store.writeFlow(filePath, flow);
      return { filePath, flow };
    }
    case "add_flow_step": {
      const found = store.findFlow(String(args.flow ?? ""));
      const step = resolveStep(
        String(args.folder ?? ""),
        String(args.name ?? ""),
        args.runScripts === undefined ? true : Boolean(args.runScripts)
      );
      found.flow.steps.push(step);
      store.writeFlow(found.filePath, found.flow);
      return found.flow;
    }
    case "run_flow": {
      const found = store.findFlow(String(args.name ?? ""));
      const flow = {
        ...found.flow,
        env: String(args.env || found.flow.env || "local"),
        runScripts:
          args.runScripts === undefined
            ? found.flow.runScripts
            : Boolean(args.runScripts),
      };
      const result = await runFlow(store, flow);
      return { summary: formatFlowRun(result), result };
    }
    case "list_env":
      return {
        global: Object.keys(store.readGlobalEnv().values),
        profiles: store.listNamedEnvironments().map((env) => ({
          name: env.name,
          keys: Object.keys(env.values),
        })),
        collections: store.listCollections().map((entry) => ({
          name: entry.name,
          keys: Object.keys(store.readCollectionEnv(entry.name).values),
        })),
      };
    case "get_env": {
      const scope = parseScope(args.scope);
      const envName = String(args.name || (scope === "profile" ? "local" : ""));
      const values = store.envScopeValues(scope, envName);
      const key = String(args.key ?? "").trim();
      if (key) {
        return {
          scope,
          name: envName,
          key,
          value: values[key],
          found: Object.prototype.hasOwnProperty.call(values, key),
        };
      }
      return { scope, name: envName, values };
    }
    case "set_env": {
      const scope = parseScope(args.scope);
      const envName = String(args.name || (scope === "profile" ? "local" : ""));
      const values = store.setEnvValue(
        scope,
        envName,
        String(args.key ?? ""),
        String(args.value ?? "")
      );
      return { scope, name: envName, key: String(args.key), values };
    }
    case "delete_env": {
      const scope = parseScope(args.scope);
      const envName = String(args.name || (scope === "profile" ? "local" : ""));
      const values = store.deleteEnvValue(
        scope,
        envName,
        String(args.key ?? "")
      );
      return { scope, name: envName, key: String(args.key), values };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function parseScope(raw: unknown): "global" | "profile" | "collection" {
  const value = String(raw || "profile").toLowerCase();
  switch (value) {
    case "global":
      return "global";
    case "collection":
      return "collection";
    case "profile":
    case "named":
    case "env":
      return "profile";
    default:
      throw new Error("scope must be global, profile, or collection");
  }
}

function parseSteps(raw: unknown): FlowStep[] {
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) {
      return [];
    }
    if (text.startsWith("[")) {
      return parseSteps(JSON.parse(text) as unknown);
    }
    return text.split(",").map((part) => {
      const item = part.trim();
      const slash = item.lastIndexOf("/");
      if (slash === -1) {
        throw new Error(`Step "${item}" needs folder/request.`);
      }
      return resolveStep(item.slice(0, slash), item.slice(slash + 1), true);
    });
  }
  if (!Array.isArray(raw)) {
    throw new Error("steps must be an array or a comma-separated list.");
  }
  return raw.map((item) => {
    if (typeof item === "string") {
      return parseSteps(item)[0];
    }
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return resolveStep(
      String(row.folder ?? ""),
      String(row.name ?? row.request ?? ""),
      row.runScripts === undefined ? true : Boolean(row.runScripts)
    );
  });
}

function resolveStep(
  folder: string,
  name: string,
  runScripts: boolean
): FlowStep {
  const filePath =
    store.findRequestPath(folder, name) ||
    store.searchRequests(name).find((item) => item.folder === folder)?.path;
  if (!filePath) {
    throw new Error(`Request not found: ${folder}/${name}`);
  }
  const request = store.readRequest(filePath);
  return {
    folder: store.requestFolder(filePath),
    name: request.name,
    runScripts,
  };
}

function resolveNamed(folder: string, name: string): string {
  const matches = store
    .searchRequests(name)
    .filter((item) => item.folder === folder);
  if (matches[0]) {
    return matches[0].path;
  }
  return store.createRequest(folder, name);
}
