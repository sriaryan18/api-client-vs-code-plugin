import * as vscode from "vscode";
import { getStore } from "../storage/workspaceStore";
import { EnvTarget } from "../webview/envPanel";

export interface EnvNode {
  label: string;
  target: EnvTarget;
}

export class EnvTreeProvider implements vscode.TreeDataProvider<EnvNode> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: EnvNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "environment";
    item.iconPath = new vscode.ThemeIcon(
      element.target.kind === "collection" ? "folder" : "symbol-variable"
    );
    item.command = {
      command: "apiClient.openEnv",
      title: "Open Environment",
      arguments: [element.target],
    };
    switch (element.target.kind) {
      case "global":
        item.description = "all collections";
        break;
      case "named":
        item.description = "profile";
        break;
      case "collection":
        item.description = "collection";
        break;
      default: {
        const _never: never = element.target;
        void _never;
        break;
      }
    }
    return item;
  }

  getChildren(): EnvNode[] {
    const store = getStore();
    if (!store) {
      return [];
    }
    store.ensureLayout();
    const nodes: EnvNode[] = [
      { label: "Global", target: { kind: "global" } },
      ...store.listNamedEnvironments().map((env) => ({
        label: env.name,
        target: { kind: "named" as const, name: env.name },
      })),
      ...store.listCollections().map((entry) => ({
        label: entry.name,
        target: { kind: "collection" as const, name: entry.name },
      })),
    ];
    return nodes;
  }
}
