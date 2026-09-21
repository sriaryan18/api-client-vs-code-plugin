import * as path from "path";
import * as vscode from "vscode";
import { isCollectionVisible } from "../storage/visibility";
import { getStore, WorkspaceStore } from "../storage/workspaceStore";

export type TreeNode = CollectionNode | FolderNode | RequestNode;

export interface CollectionNode {
  kind: "collection";
  name: string;
  relPath: string;
}

export interface FolderNode {
  kind: "folder";
  collection: string;
  name: string;
  relPath: string;
}

export interface RequestNode {
  kind: "request";
  collection: string;
  relDir: string;
  fileName: string;
  filePath: string;
}

export function nodeDir(node?: TreeNode): string | undefined {
  if (!node) {
    return undefined;
  }
  switch (node.kind) {
    case "collection":
    case "folder":
      return node.relPath;
    case "request":
      return node.relDir;
    default: {
      const _never: never = node;
      return _never;
    }
  }
}

export class CollectionTreeProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly labelCache = new Map<
    string,
    { name: string; method: string; note: string }
  >();
  private searchQuery = "";

  getSearch(): string {
    return this.searchQuery;
  }

  setSearch(query: string): void {
    this.searchQuery = query.trim();
    this.refresh();
  }

  refresh(): void {
    this.labelCache.clear();
    this.emitter.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    switch (element.kind) {
      case "collection": {
        const item = new vscode.TreeItem(
          element.name,
          vscode.TreeItemCollapsibleState.Expanded
        );
        item.contextValue = "collection";
        item.iconPath = new vscode.ThemeIcon("library");
        return item;
      }
      case "folder": {
        const item = new vscode.TreeItem(
          element.name,
          this.searchQuery
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed
        );
        item.contextValue = "folder";
        item.iconPath = new vscode.ThemeIcon("folder");
        return item;
      }
      case "request": {
        let info = this.labelCache.get(element.filePath);
        if (!info) {
          const request = getStore()?.readRequest(element.filePath);
          info = {
            name: request?.name || element.fileName.replace(/\.json$/, ""),
            method: request?.method || "GET",
            note: request?.description || "",
          };
          this.labelCache.set(element.filePath, info);
        }
        const item = new vscode.TreeItem(
          info.name,
          vscode.TreeItemCollapsibleState.None
        );
        item.contextValue = "request";
        item.description = info.method;
        item.tooltip = info.note
          ? `${info.method}  ${info.note}`
          : info.method;
        item.iconPath = new vscode.ThemeIcon("symbol-method");
        item.id = element.filePath;
        return item;
      }
      default: {
        const _never: never = element;
        throw new Error(`Unknown tree node: ${JSON.stringify(_never)}`);
      }
    }
  }

  getChildren(element?: TreeNode): TreeNode[] {
    const store = getStore();
    if (!store) {
      return [];
    }
    const matchPaths = this.matchPaths(store);
    if (!element) {
      return store.listCollections()
        .filter((entry) => isCollectionVisible(entry.name))
        .filter((entry) => this.folderVisible(store, entry.relPath, matchPaths))
        .map((entry) => ({
          kind: "collection" as const,
          name: entry.name,
          relPath: entry.relPath,
        }));
    }
    if (element.kind === "request") {
      return [];
    }
    return this.childrenAt(
      store,
      element.relPath,
      store.collectionName(element.relPath),
      matchPaths
    );
  }

  private childrenAt(
    store: WorkspaceStore,
    relPath: string,
    collection: string,
    matchPaths: Set<string> | undefined
  ): TreeNode[] {
    const folders: TreeNode[] = store
      .listFolders(relPath)
      .filter((entry) => this.folderVisible(store, entry.relPath, matchPaths))
      .map((entry) => ({
        kind: "folder" as const,
        collection,
        name: entry.name,
        relPath: entry.relPath,
      }));
    const requests: TreeNode[] = store
      .listRequestFiles(relPath)
      .map((fileName) => ({
        kind: "request" as const,
        collection,
        relDir: relPath,
        fileName,
        filePath: path.join(store.resolve(relPath), fileName),
      }))
      .filter((node) => !matchPaths || matchPaths.has(node.filePath));
    return [...folders, ...requests];
  }

  private matchPaths(store: WorkspaceStore): Set<string> | undefined {
    if (!this.searchQuery) {
      return undefined;
    }
    return new Set(
      store.searchRequests(this.searchQuery).map((item) => item.path)
    );
  }

  private folderVisible(
    store: WorkspaceStore,
    relPath: string,
    matchPaths: Set<string> | undefined
  ): boolean {
    if (!matchPaths) {
      return true;
    }
    const dir = store.resolve(relPath);
    for (const filePath of matchPaths) {
      if (filePath === dir || filePath.startsWith(`${dir}${path.sep}`)) {
        return true;
      }
    }
    return false;
  }
}
