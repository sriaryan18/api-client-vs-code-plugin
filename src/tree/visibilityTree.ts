import * as vscode from "vscode";
import {
  isCollectionVisible,
  visibleCollectionNames,
} from "../storage/visibility";
import { getStore } from "../storage/workspaceStore";

export interface VisibilityNode {
  name: string;
  shown: boolean;
}

export class VisibilityTreeProvider
  implements vscode.TreeDataProvider<VisibilityNode>
{
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: VisibilityNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.name,
      vscode.TreeItemCollapsibleState.None
    );
    item.checkboxState = element.shown
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    item.description = element.shown ? "shown" : "hidden";
    item.iconPath = new vscode.ThemeIcon(element.shown ? "eye" : "eye-closed");
    item.contextValue = element.shown ? "visibilityOn" : "visibilityOff";
    item.tooltip = element.shown
      ? "On in this repo. Click the box to hide."
      : "Off in this repo. Click the box to show.";
    return item;
  }

  getChildren(): VisibilityNode[] {
    const store = getStore();
    if (!store) {
      return [];
    }
    return store.listCollections().map((entry) => ({
      name: entry.name,
      shown: isCollectionVisible(entry.name),
    }));
  }
}

export function visibilityHint(): string | undefined {
  const names = visibleCollectionNames();
  if (!names) {
    return undefined;
  }
  if (!names.length) {
    return "This repo hides every collection. Tick one below to show it.";
  }
  return `${names.length} collection${names.length === 1 ? "" : "s"} shown in this repo`;
}
