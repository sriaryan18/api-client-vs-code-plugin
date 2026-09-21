import * as vscode from "vscode";
import { FileStore } from "./fileStore";
import { resolveRoot } from "./paths";

export class WorkspaceStore extends FileStore {}

export function getStore(): WorkspaceStore | undefined {
  const root = resolveRoot();
  if (!root) {
    return undefined;
  }
  return new WorkspaceStore(root);
}

export { FileStore } from "./fileStore";
export type { FolderEntry } from "./fileStore";
export { slugify } from "./pathUtils";
