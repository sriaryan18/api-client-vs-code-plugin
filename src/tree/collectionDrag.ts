import * as path from "path";
import * as vscode from "vscode";
import { getStore } from "../storage/workspaceStore";
import { RequestPanel } from "../webview/requestPanel";
import { CollectionTreeProvider, RequestNode, TreeNode, nodeDir } from "./collectionTree";

const MIME = "application/vnd.code.tree.apiclient.collections";

export function createCollectionDrag(
  tree: CollectionTreeProvider,
  panel: RequestPanel
): vscode.TreeDragAndDropController<TreeNode> {
  return {
    dragMimeTypes: [MIME],
    dropMimeTypes: [MIME],
    handleDrag(source, dataTransfer): void {
      dataTransfer.set(MIME, new vscode.DataTransferItem(JSON.stringify(source)));
    },
    async handleDrop(target, dataTransfer): Promise<void> {
      const store = getStore();
      const raw = await dataTransfer.get(MIME)?.asString();
      if (!store || !raw) {
        return;
      }
      const dest = dropDir(target);
      if (!dest) {
        return;
      }
      const sources = JSON.parse(raw) as TreeNode[];
      for (const source of sources) {
        moveNode(store, panel, source, dest);
      }
      tree.refresh();
    },
  };
}

function dropDir(target?: TreeNode): string | undefined {
  if (!target) {
    return undefined;
  }
  return nodeDir(target);
}

function moveNode(
  store: NonNullable<ReturnType<typeof getStore>>,
  panel: RequestPanel,
  source: TreeNode,
  dest: string
): void {
  switch (source.kind) {
    case "collection":
      return;
    case "folder": {
      if (dest === source.relPath || dest.startsWith(`${source.relPath}/`)) {
        return;
      }
      const oldDir = store.resolve(source.relPath);
      const next = store.moveFolder(source.relPath, dest);
      panel.retargetUnder(oldDir, store.resolve(next));
      return;
    }
    case "request": {
      if (source.relDir === dest) {
        return;
      }
      const oldPath = source.filePath;
      const filePath = store.moveRequest(source.filePath, dest);
      panel.retargetUnder(oldPath, filePath);
      return;
    }
    default: {
      const _never: never = source;
      void _never;
    }
  }
}

export function requestNodeFromPath(
  store: NonNullable<ReturnType<typeof getStore>>,
  filePath: string
): RequestNode {
  const relDir = store.requestFolder(filePath);
  return {
    kind: "request",
    collection: store.collectionName(relDir),
    relDir,
    fileName: path.basename(filePath),
    filePath,
  };
}
