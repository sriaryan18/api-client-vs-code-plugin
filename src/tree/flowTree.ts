import * as vscode from "vscode";
import { getStore } from "../storage/workspaceStore";

export interface FlowNode {
  kind: "flow";
  name: string;
  filePath: string;
}

export class FlowTreeProvider implements vscode.TreeDataProvider<FlowNode> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: FlowNode): vscode.TreeItem {
    const store = getStore();
    const flow = store?.readFlow(element.filePath);
    const item = new vscode.TreeItem(
      flow?.name || element.name,
      vscode.TreeItemCollapsibleState.None
    );
    item.contextValue = "flow";
    item.iconPath = new vscode.ThemeIcon("type-hierarchy");
    item.description = `${flow?.steps.length ?? 0} steps`;
    item.command = {
      command: "apiClient.openFlow",
      title: "Open Flow",
      arguments: [element],
    };
    return item;
  }

  getChildren(): FlowNode[] {
    const store = getStore();
    if (!store) {
      return [];
    }
    return store.listFlows().map((entry) => ({
      kind: "flow" as const,
      name: entry.flow.name,
      filePath: entry.filePath,
    }));
  }
}
