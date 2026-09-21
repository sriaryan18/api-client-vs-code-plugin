import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { ensureRoot } from "../storage/ensureRoot";
import { resolveRoot } from "../storage/paths";

const STABLE_DIR = path.join(os.homedir(), ".cursor", "api-client-mcp");

export function stableServerPath(): string {
  return path.join(STABLE_DIR, "out", "mcp", "server.js");
}

export function syncMcpFiles(extensionPath: string): string {
  const destOut = path.join(STABLE_DIR, "out");
  fs.mkdirSync(STABLE_DIR, { recursive: true });
  fs.rmSync(destOut, { recursive: true, force: true });
  fs.cpSync(path.join(extensionPath, "out"), destOut, { recursive: true });
  return stableServerPath();
}

export function writeMcpConfig(serverPath: string, root: string): void {
  const mcpPath = path.join(os.homedir(), ".cursor", "mcp.json");
  let current: { mcpServers?: Record<string, unknown> } = {};
  if (fs.existsSync(mcpPath)) {
    current = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };
  }
  current.mcpServers = {
    ...(current.mcpServers ?? {}),
    "api-client": {
      command: "node",
      args: [serverPath],
      env: { API_CLIENT_ROOT: root },
    },
  };
  fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
  fs.writeFileSync(mcpPath, `${JSON.stringify(current, null, 2)}\n`);
}

export function refreshMcpRegistration(extensionPath: string): void {
  const root = resolveRoot();
  if (!root) {
    return;
  }
  const serverPath = syncMcpFiles(extensionPath);
  writeMcpConfig(serverPath, root);
}

export async function connectCursorMcp(
  context: vscode.ExtensionContext
): Promise<void> {
  const root = await ensureRoot();
  if (!root) {
    return;
  }
  const serverPath = syncMcpFiles(context.extensionPath);
  writeMcpConfig(serverPath, root);
  await vscode.window.showInformationMessage(
    "API Client MCP is ready. Reload Cursor, then you should see 5 tools."
  );
}
