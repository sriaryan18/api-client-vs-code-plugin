import * as path from "path";
import * as vscode from "vscode";

export {
  COLLECTION_ENV_FILE,
  COLLECTIONS_DIR,
  defaultNewRoot,
  ENV_DIR,
  GLOBAL_ENV_NAME,
  joinRel,
  slugify,
} from "./pathUtils";

export function rootSetting(): string {
  const inspected = vscode.workspace
    .getConfiguration("apiClient")
    .inspect<string>("root");
  const global = inspected?.globalValue?.trim() || "";
  const workspace = inspected?.workspaceValue?.trim() || "";
  return global || workspace || "";
}

export function resolveRoot(): string | undefined {
  const inspected = vscode.workspace
    .getConfiguration("apiClient")
    .inspect<string>("root");
  const global = inspected?.globalValue?.trim();
  if (global) {
    return path.isAbsolute(global) ? global : undefined;
  }
  const workspace = inspected?.workspaceValue?.trim();
  if (!workspace) {
    return undefined;
  }
  if (path.isAbsolute(workspace)) {
    return workspace;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  return path.join(folder.uri.fsPath, workspace);
}
