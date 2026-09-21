import * as path from "path";
import * as vscode from "vscode";

const SETTING = "visibilityByRepo";

export function currentRepoKey(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? path.resolve(folder.uri.fsPath) : "";
}

export function visibleCollectionNames(): string[] | undefined {
  const key = currentRepoKey();
  if (!key) {
    return undefined;
  }
  const map = readMap();
  const list = map[key];
  return Array.isArray(list) ? list.map(String) : undefined;
}

export function isCollectionVisible(name: string): boolean {
  const list = visibleCollectionNames();
  return !list || list.includes(name);
}

export async function setVisibleCollectionNames(
  names: string[] | undefined
): Promise<void> {
  const key = currentRepoKey();
  if (!key) {
    await vscode.window.showWarningMessage(
      "Open a folder first. Visibility is saved for that repo."
    );
    return;
  }
  const map = { ...readMap() };
  if (!names) {
    delete map[key];
  } else {
    map[key] = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }
  await vscode.workspace
    .getConfiguration("apiClient")
    .update(SETTING, map, vscode.ConfigurationTarget.Global);
}

export async function setCollectionShown(
  name: string,
  shown: boolean,
  allNames: string[]
): Promise<void> {
  const current = visibleCollectionNames();
  const list = new Set(current ?? allNames);
  if (shown) {
    list.add(name);
  } else {
    list.delete(name);
  }
  if (list.size === allNames.length && allNames.every((item) => list.has(item))) {
    await setVisibleCollectionNames(undefined);
    return;
  }
  await setVisibleCollectionNames([...list]);
}

export async function toggleCollectionVisibility(
  name: string,
  allNames: string[]
): Promise<void> {
  await setCollectionShown(name, !isCollectionVisible(name), allNames);
}

function readMap(): Record<string, string[]> {
  const raw = vscode.workspace
    .getConfiguration("apiClient")
    .get<Record<string, string[]>>(SETTING, {});
  return raw && typeof raw === "object" ? raw : {};
}
