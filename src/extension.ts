import * as path from "path";
import * as vscode from "vscode";
import { toPostmanCollection } from "./export/toPostman";
import { parseCurl } from "./import/curl";
import { parsePostmanCollection } from "./import/postman";
import { formatCollectionRun, runCollection } from "./runner/runCollection";
import { formatFlowRun, runFlow } from "./runner/runFlow";
import { connectCursorMcp, refreshMcpRegistration } from "./mcp/connectCursor";
import { ensureRoot } from "./storage/ensureRoot";
import { joinRel } from "./storage/paths";
import {
  currentRepoKey,
  isCollectionVisible,
  setCollectionShown,
  setVisibleCollectionNames,
  renameVisibleCollection,
  toggleCollectionVisibility,
  visibleCollectionNames,
} from "./storage/visibility";
import { getStore, WorkspaceStore } from "./storage/workspaceStore";
import {
  CollectionTreeProvider,
  nodeDir,
  RequestNode,
  TreeNode,
} from "./tree/collectionTree";
import { createCollectionDrag } from "./tree/collectionDrag";
import { FlowNode, FlowTreeProvider } from "./tree/flowTree";
import { EnvTreeProvider } from "./tree/envTree";
import {
  VisibilityNode,
  VisibilityTreeProvider,
  visibilityHint,
} from "./tree/visibilityTree";
import { EnvPanel, EnvTarget } from "./webview/envPanel";
import { FlowPanel } from "./webview/flowPanel";
import { RequestPanel } from "./webview/requestPanel";

export function activate(context: vscode.ExtensionContext): void {
  const tree = new CollectionTreeProvider();
  const envTree = new EnvTreeProvider();
  const flowTree = new FlowTreeProvider();
  const visTree = new VisibilityTreeProvider();
  const panel = new RequestPanel(context);
  const envPanel = new EnvPanel(context);
  const output = vscode.window.createOutputChannel("API Client");
  const flowPanel = new FlowPanel(context, output);

  context.subscriptions.push(
    output,
    vscode.window.registerTreeDataProvider("apiClient.environments", envTree),
    vscode.window.registerTreeDataProvider("apiClient.flows", flowTree),
    vscode.commands.registerCommand("apiClient.refresh", () => {
      tree.refresh();
      envTree.refresh();
      flowTree.refresh();
      visTree.refresh();
    }),
    vscode.commands.registerCommand("apiClient.newCollection", () =>
      newCollection(tree)
    ),
    vscode.commands.registerCommand(
      "apiClient.newFolder",
      (node?: TreeNode) => newFolder(tree, node)
    ),
    vscode.commands.registerCommand(
      "apiClient.newRequest",
      (node?: TreeNode) => newRequest(tree, panel, node)
    ),
    vscode.commands.registerCommand("apiClient.importCurl", () =>
      importCurl(tree, panel)
    ),
    vscode.commands.registerCommand("apiClient.importPostman", () =>
      importPostman(tree)
    ),
    vscode.commands.registerCommand(
      "apiClient.exportCollection",
      (node?: TreeNode) => exportCollection(node)
    ),
    vscode.commands.registerCommand(
      "apiClient.openRequest",
      (node: RequestNode) => panel.show(node)
    ),
    vscode.commands.registerCommand(
      "apiClient.openRequestInNewTab",
      (node: RequestNode) => panel.show(node, { newTab: true })
    ),
    vscode.commands.registerCommand("apiClient.sendActive", () =>
      panel.sendActive()
    ),
    vscode.commands.registerCommand("apiClient.copyCurl", (node?: RequestNode) =>
      copyCurl(panel, node)
    ),
    vscode.commands.registerCommand(
      "apiClient.duplicateRequest",
      (node?: RequestNode) => duplicateRequest(tree, panel, node)
    ),
    vscode.commands.registerCommand(
      "apiClient.deleteRequest",
      (node?: RequestNode) => deleteRequest(tree, node)
    ),
    vscode.commands.registerCommand(
      "apiClient.deleteCollection",
      (node?: TreeNode) => deleteCollectionOrFolder(tree, node)
    ),
    vscode.commands.registerCommand(
      "apiClient.deleteFolder",
      (node?: TreeNode) => deleteCollectionOrFolder(tree, node)
    ),
    vscode.commands.registerCommand(
      "apiClient.rename",
      (node?: TreeNode) => renameNode(tree, panel, node)
    ),
    vscode.commands.registerCommand(
      "apiClient.move",
      (node?: TreeNode) => moveNode(tree, panel, node)
    ),
    vscode.commands.registerCommand(
      "apiClient.runCollection",
      (node?: TreeNode) => runCollectionCommand(tree, panel, output, node)
    ),
    vscode.commands.registerCommand("apiClient.editEnv", () =>
      editEnv(panel, envPanel)
    ),
    vscode.commands.registerCommand("apiClient.openEnv", (target: EnvTarget) =>
      envPanel.show(target)
    ),
    vscode.commands.registerCommand("apiClient.quickOpen", () =>
      quickOpen(panel)
    ),
    vscode.commands.registerCommand("apiClient.setRoot", () =>
      setRoot(tree, envTree, flowTree, visTree)
    ),
    vscode.commands.registerCommand("apiClient.connectMcp", () =>
      connectCursorMcp(context)
    ),
    vscode.commands.registerCommand("apiClient.newFlow", () =>
      newFlow(flowTree, flowPanel)
    ),
    vscode.commands.registerCommand("apiClient.openFlow", (node: FlowNode) =>
      flowPanel.show(node.filePath)
    ),
    vscode.commands.registerCommand(
      "apiClient.runFlow",
      (node?: FlowNode) => runFlowCommand(flowTree, flowPanel, output, node)
    ),
    vscode.commands.registerCommand(
      "apiClient.deleteFlow",
      (node?: FlowNode) => deleteFlow(flowTree, node)
    ),
    vscode.commands.registerCommand(
      "apiClient.addToFlow",
      (node?: RequestNode) => addToFlow(flowTree, panel, node)
    )
  );

  const collectionView = vscode.window.createTreeView("apiClient.collections", {
    treeDataProvider: tree,
    showCollapseAll: true,
    canSelectMany: true,
    dragAndDropController: createCollectionDrag(tree, panel),
  });
  const visView = vscode.window.createTreeView("apiClient.visibility", {
    treeDataProvider: visTree,
    showCollapseAll: false,
    manageCheckboxStateManually: true,
  });
  applyVisibilityMessage(visView);
  context.subscriptions.push(
    vscode.commands.registerCommand("apiClient.searchRequests", () =>
      searchRequests(tree, collectionView, panel)
    ),
    vscode.commands.registerCommand("apiClient.clearSearch", () =>
      applySearch(tree, collectionView, "")
    ),
    vscode.commands.registerCommand(
      "apiClient.toggleCollectionVisibility",
      (node?: VisibilityNode | TreeNode) =>
        toggleVisibility(tree, visTree, visView, node)
    ),
    vscode.commands.registerCommand("apiClient.chooseVisibleCollections", () =>
      chooseVisibleCollections(tree, visTree, visView)
    ),
    vscode.commands.registerCommand("apiClient.showAllCollections", () =>
      showAllCollections(tree, visTree, visView)
    ),
    visView,
    visView.onDidChangeCheckboxState(async (event) => {
      const store = getStore();
      if (!store) {
        return;
      }
      const allNames = store.listCollections().map((entry) => entry.name);
      for (const [item, state] of event.items) {
        await setCollectionShown(
          item.name,
          state === vscode.TreeItemCheckboxState.Checked,
          allNames
        );
      }
      refreshVisibility(tree, visTree, visView);
    }),
    collectionView,
    collectionView.onDidChangeSelection(async (event) => {
      const requests = event.selection.filter(
        (item): item is RequestNode => item.kind === "request"
      );
      if (!requests.length) {
        return;
      }
      await panel.show(requests[requests.length - 1], {
        newTab: requests.length > 1,
      });
    })
  );
  watchStorage(context, tree, envTree, flowTree, visTree, visView);
  try {
    refreshMcpRegistration(context.extensionPath);
  } catch {
    // MCP config is optional; the connect command can retry.
  }
}

export function deactivate(): void {}

function watchStorage(
  context: vscode.ExtensionContext,
  tree: CollectionTreeProvider,
  envTree: EnvTreeProvider,
  flowTree: FlowTreeProvider,
  visTree: VisibilityTreeProvider,
  visView: vscode.TreeView<VisibilityNode>
): void {
  let watcher: vscode.FileSystemWatcher | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const refreshAll = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      tree.refresh();
      envTree.refresh();
      flowTree.refresh();
      visTree.refresh();
      applyVisibilityMessage(visView);
    }, 400);
  };
  const start = () => {
    watcher?.dispose();
    const store = getStore();
    if (!store) {
      return;
    }
    watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(store.rootPath()), "**")
    );
    watcher.onDidCreate(refreshAll);
    watcher.onDidDelete(refreshAll);
    watcher.onDidChange(refreshAll);
    context.subscriptions.push(watcher);
  };
  start();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("apiClient.root")) {
        start();
        refreshAll();
      }
      if (event.affectsConfiguration("apiClient.visibilityByRepo")) {
        refreshAll();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => refreshAll())
  );
}

async function requireStore(): Promise<WorkspaceStore | undefined> {
  const root = await ensureRoot();
  if (!root) {
    return undefined;
  }
  const store = new WorkspaceStore(root);
  store.ensureLayout();
  return store;
}

async function pickCollection(
  store: NonNullable<ReturnType<typeof getStore>>,
  preferred?: string
): Promise<string | undefined> {
  if (preferred) {
    return preferred;
  }
  const collections = store.listCollections().map((entry) => entry.relPath);
  const picked = collections.length
    ? await vscode.window.showQuickPick(["+ New collection", ...collections], {
        placeHolder: "Choose a collection",
      })
    : "+ New collection";
  if (!picked) {
    return undefined;
  }
  if (picked === "+ New collection") {
    const name = await vscode.window.showInputBox({
      prompt: "Collection name",
      placeHolder: "users",
    });
    if (!name) {
      return undefined;
    }
    return store.createCollection(name);
  }
  return picked;
}

async function newCollection(tree: CollectionTreeProvider): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: "Collection name",
    placeHolder: "users",
  });
  if (!name) {
    return;
  }
  store.createCollection(name);
  tree.refresh();
}

async function newFlow(
  flowTree: FlowTreeProvider,
  flowPanel: FlowPanel
): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: "Flow name",
    placeHolder: "Login then get profile",
  });
  if (!name) {
    return;
  }
  const filePath = store.createFlow(name);
  flowTree.refresh();
  await flowPanel.show(filePath);
}

async function deleteFlow(
  flowTree: FlowTreeProvider,
  node?: FlowNode
): Promise<void> {
  const store = await requireStore();
  if (!store || !node) {
    return;
  }
  const ok = await vscode.window.showWarningMessage(
    `Delete flow ${node.name}?`,
    { modal: true },
    "Delete"
  );
  if (ok !== "Delete") {
    return;
  }
  store.deleteFlow(node.filePath);
  flowTree.refresh();
}

async function addToFlow(
  flowTree: FlowTreeProvider,
  panel: RequestPanel,
  node?: RequestNode
): Promise<void> {
  const store = await requireStore();
  const target = node || panel.currentNode();
  if (!store || !target) {
    return;
  }
  const flows = store.listFlows();
  const picked = await vscode.window.showQuickPick(
    [
      { label: "+ New flow", filePath: "" },
      ...flows.map((entry) => ({
        label: entry.flow.name,
        description: `${entry.flow.steps.length} steps`,
        filePath: entry.filePath,
      })),
    ],
    { placeHolder: "Add this request to a flow" }
  );
  if (!picked) {
    return;
  }
  const request = store.readRequest(target.filePath);
  const filePath = picked.filePath || store.createFlow(`${request.name} flow`);
  const flow = store.readFlow(filePath);
  const folder = store.requestFolder(target.filePath);
  flow.steps.push({ folder, name: request.name, runScripts: true });
  store.writeFlow(filePath, flow);
  flowTree.refresh();
  await vscode.window.showInformationMessage(`Added ${request.name} to ${flow.name}`);
}

async function runFlowCommand(
  flowTree: FlowTreeProvider,
  flowPanel: FlowPanel,
  output: vscode.OutputChannel,
  node?: FlowNode
): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const filePath =
    node?.filePath ||
    flowPanel.currentPath() ||
    (
      await vscode.window.showQuickPick(
        store.listFlows().map((entry) => ({
          label: entry.flow.name,
          filePath: entry.filePath,
        })),
        { placeHolder: "Run a flow" }
      )
    )?.filePath;
  if (!filePath) {
    return;
  }
  const flow = store.readFlow(filePath);
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Running ${flow.name}`,
    },
    async () => {
      const result = await runFlow(store, flow);
      output.clear();
      output.appendLine(formatFlowRun(result));
      output.show(true);
      flowTree.refresh();
      await vscode.window.showInformationMessage(
        `${flow.name}: ${result.runs.length} calls · ${result.errors} errors · ${result.passed} tests passed`
      );
    }
  );
}

async function newFolder(
  tree: CollectionTreeProvider,
  node?: TreeNode
): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const parent = nodeDir(node) || (await pickCollection(store));
  if (!parent) {
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: "Folder name",
    placeHolder: "auth",
  });
  if (!name) {
    return;
  }
  store.createFolder(parent, name);
  tree.refresh();
}

async function newRequest(
  tree: CollectionTreeProvider,
  panel: RequestPanel,
  node?: TreeNode
): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const relDir = nodeDir(node) || (await pickCollection(store));
  if (!relDir) {
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: "Request name",
    placeHolder: "Get users",
  });
  if (!name) {
    return;
  }
  const filePath = store.createRequest(relDir, name);
  tree.refresh();
  await panel.show({
    kind: "request",
    collection: store.collectionName(relDir),
    relDir,
    fileName: path.basename(filePath),
    filePath,
  });
}

async function importCurl(
  tree: CollectionTreeProvider,
  panel: RequestPanel
): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const pasted = await vscode.window.showInputBox({
    prompt: "Paste a curl command",
    placeHolder:
      'curl -X POST https://api.example.com/users -H "Content-Type: application/json" -d \'{"name":"Ada"}\'',
    ignoreFocusOut: true,
  });
  if (!pasted) {
    return;
  }
  let request;
  try {
    request = parseCurl(pasted);
  } catch (error) {
    await vscode.window.showErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
    return;
  }
  const relDir = await pickCollection(store);
  if (!relDir) {
    return;
  }
  const filePath = store.createRequest(relDir, request.name);
  store.writeRequest(filePath, request);
  tree.refresh();
  await panel.show({
    kind: "request",
    collection: store.collectionName(relDir),
    relDir,
    fileName: path.basename(filePath),
    filePath,
  });
}

async function importPostman(tree: CollectionTreeProvider): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { JSON: ["json"] },
    title: "Import Postman collection",
  });
  if (!picked?.[0]) {
    return;
  }
  const raw = await vscode.workspace.fs.readFile(picked[0]);
  try {
    const imported = parsePostmanCollection(Buffer.from(raw).toString("utf8"));
    const collection = store.createCollection(imported.collectionName);
    if (Object.keys(imported.variables).length) {
      store.writeCollectionEnv(collection, {
        name: collection,
        values: imported.variables,
      });
    }
    if (imported.collectionAuth.type !== "none") {
      store.writeCollectionAuth(collection, imported.collectionAuth);
    }
    for (const item of imported.requests) {
      const relDir = joinRel(collection, item.folder);
      const filePath = store.createRequest(relDir, item.request.name);
      store.writeRequest(filePath, item.request);
    }
    tree.refresh();
    await vscode.window.showInformationMessage(
      `Imported ${imported.requests.length} requests.`
    );
  } catch (error) {
    await vscode.window.showErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function copyCurl(
  panel: RequestPanel,
  node?: RequestNode
): Promise<void> {
  if (node) {
    await panel.show(node);
  }
  await panel.copyActiveCurl();
}

async function duplicateRequest(
  tree: CollectionTreeProvider,
  panel: RequestPanel,
  node?: RequestNode
): Promise<void> {
  const store = await requireStore();
  const target = node || panel.currentNode();
  if (!store || !target) {
    return;
  }
  const filePath = store.duplicateRequest(target.filePath);
  tree.refresh();
  await panel.show({
    kind: "request",
    collection: target.collection,
    relDir: target.relDir,
    fileName: path.basename(filePath),
    filePath,
  });
}

async function renameNode(
  tree: CollectionTreeProvider,
  panel: RequestPanel,
  node?: TreeNode
): Promise<void> {
  const store = await requireStore();
  if (!store || !node) {
    return;
  }
  const current =
    node.kind === "request" ? store.readRequest(node.filePath).name : node.name;
  const name = await vscode.window.showInputBox({
    prompt: "New name",
    value: current,
  });
  if (!name || name === current) {
    return;
  }
  try {
    switch (node.kind) {
      case "collection": {
        const oldDir = store.resolve(node.relPath);
        const next = store.renameFolder(node.relPath, name);
        await renameVisibleCollection(node.name, path.basename(next));
        panel.retargetUnder(oldDir, store.resolve(next));
        break;
      }
      case "folder": {
        const oldDir = store.resolve(node.relPath);
        const next = store.renameFolder(node.relPath, name);
        panel.retargetUnder(oldDir, store.resolve(next));
        break;
      }
      case "request": {
        const oldPath = node.filePath;
        const filePath = store.renameRequest(node.filePath, name);
        panel.retargetUnder(oldPath, filePath);
        break;
      }
      default: {
        const _never: never = node;
        void _never;
      }
    }
  } catch (error) {
    await vscode.window.showErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
  }
  tree.refresh();
}

async function moveNode(
  tree: CollectionTreeProvider,
  panel: RequestPanel,
  node?: TreeNode
): Promise<void> {
  const store = await requireStore();
  if (!store || !node || node.kind === "collection") {
    return;
  }
  const current = node.kind === "request" ? node.relDir : node.relPath;
  const picked = await vscode.window.showQuickPick(
    store
      .listMoveTargets()
      .filter((entry) => entry.relPath !== current && !entry.relPath.startsWith(`${current}/`))
      .map((entry) => ({
        label: entry.relPath,
        relPath: entry.relPath,
      })),
    { placeHolder: "Move into which folder?" }
  );
  if (!picked) {
    return;
  }
  try {
    if (node.kind === "folder") {
      const oldDir = store.resolve(node.relPath);
      const next = store.moveFolder(node.relPath, picked.relPath);
      panel.retargetUnder(oldDir, store.resolve(next));
    } else {
      const oldPath = node.filePath;
      const filePath = store.moveRequest(node.filePath, picked.relPath);
      panel.retargetUnder(oldPath, filePath);
    }
  } catch (error) {
    await vscode.window.showErrorMessage(
      error instanceof Error ? error.message : String(error)
    );
  }
  tree.refresh();
}

async function deleteRequest(
  tree: CollectionTreeProvider,
  node?: RequestNode
): Promise<void> {
  const store = await requireStore();
  if (!store || !node) {
    return;
  }
  const ok = await vscode.window.showWarningMessage(
    `Delete ${node.fileName}?`,
    { modal: true },
    "Delete"
  );
  if (ok !== "Delete") {
    return;
  }
  store.deleteRequest(node.filePath);
  tree.refresh();
}

async function deleteCollectionOrFolder(
  tree: CollectionTreeProvider,
  node?: TreeNode
): Promise<void> {
  const store = await requireStore();
  if (!store || !node || node.kind === "request") {
    return;
  }
  const label = node.kind === "collection" ? "collection" : "folder";
  const ok = await vscode.window.showWarningMessage(
    `Delete ${label} "${node.name}" and everything inside it?`,
    { modal: true },
    "Delete"
  );
  if (ok !== "Delete") {
    return;
  }
  store.deleteFolder(node.relPath);
  tree.refresh();
}

async function runCollectionCommand(
  tree: CollectionTreeProvider,
  panel: RequestPanel,
  output: vscode.OutputChannel,
  node?: TreeNode
): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const relPath =
    nodeDir(node) ||
    panel.currentNode()?.collection ||
    (await pickCollection(store));
  if (!relPath) {
    return;
  }
  const iterationsRaw = await vscode.window.showInputBox({
    prompt: "How many times should this run?",
    value: "1",
    validateInput: (value) =>
      Number(value) >= 1 ? undefined : "Enter a number of 1 or more",
  });
  if (!iterationsRaw) {
    return;
  }
  const delayRaw = await vscode.window.showInputBox({
    prompt: "Wait between iterations, in milliseconds",
    value: "0",
    validateInput: (value) =>
      Number(value) >= 0 ? undefined : "Enter 0 or more",
  });
  if (delayRaw === undefined) {
    return;
  }
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Running ${relPath}`,
    },
    async () => {
      const result = await runCollection(
        store,
        relPath,
        panel.activeEnvironment(),
        {
          iterations: Number(iterationsRaw),
          delayMs: Number(delayRaw),
        }
      );
      output.clear();
      output.appendLine(formatCollectionRun(result));
      output.show(true);
      tree.refresh();
      await vscode.window.showInformationMessage(
        `${relPath}: ${result.iterations}x · avg ${result.avgMs} ms · ${result.passed} tests passed · ${result.failed} failed`
      );
    }
  );
}

async function editEnv(panel: RequestPanel, envPanel: EnvPanel): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const collection = panel.currentNode()?.collection;
  await envPanel.show(
    collection
      ? { kind: "collection", name: collection }
      : { kind: "named", name: panel.activeEnvironment() }
  );
}

async function searchRequests(
  tree: CollectionTreeProvider,
  view: vscode.TreeView<TreeNode>,
  panel: RequestPanel
): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const query = await vscode.window.showInputBox({
    title: "Search requests",
    prompt: "Match name, description, method, URL, or folder",
    value: tree.getSearch(),
    placeHolder: "login token /users",
  });
  if (query === undefined) {
    return;
  }
  applySearch(tree, view, query);
  const matches = visibleHits(store, query);
  if (query.trim() && matches.length === 1) {
    const filePath = matches[0].path;
    const relDir = matches[0].folder;
    await panel.show({
      kind: "request",
      collection: store.collectionName(relDir),
      relDir,
      fileName: path.basename(filePath),
      filePath,
    });
  }
}

function applySearch(
  tree: CollectionTreeProvider,
  view: vscode.TreeView<TreeNode>,
  query: string
): void {
  tree.setSearch(query);
  const trimmed = query.trim();
  view.message = trimmed ? `Search: ${trimmed}` : undefined;
  void vscode.commands.executeCommand(
    "setContext",
    "apiClient.hasSearch",
    Boolean(trimmed)
  );
}

async function quickOpen(panel: RequestPanel): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const items = visibleHits(store, "").map((item) => {
    const request = item.request;
    const relDir = item.folder;
    return {
      label: request.name,
      description: `${request.method}  ${relDir}`,
      detail: [request.description, request.url].filter(Boolean).join("  ·  "),
      node: {
        kind: "request" as const,
        collection: store.collectionName(relDir),
        relDir,
        fileName: path.basename(item.path),
        filePath: item.path,
      },
    };
  });
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Search name, description, method, URL, or folder",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (picked) {
    await panel.show(picked.node);
  }
}

function visibleHits(store: WorkspaceStore, query: string) {
  return store
    .searchRequests(query)
    .filter((item) =>
      isCollectionVisible(store.collectionName(item.folder))
    );
}

function applyVisibilityMessage(view: vscode.TreeView<VisibilityNode>): void {
  view.message = visibilityHint();
  const repo = currentRepoKey();
  view.description = repo ? path.basename(repo) : "no folder open";
}

function refreshVisibility(
  tree: CollectionTreeProvider,
  visTree: VisibilityTreeProvider,
  visView: vscode.TreeView<VisibilityNode>
): void {
  tree.refresh();
  visTree.refresh();
  applyVisibilityMessage(visView);
}

function visibilityName(node?: VisibilityNode | TreeNode): string | undefined {
  if (!node) {
    return undefined;
  }
  if ("shown" in node) {
    return node.name;
  }
  switch (node.kind) {
    case "collection":
      return node.name;
    case "folder":
      return node.collection;
    case "request":
      return node.collection;
    default: {
      const _never: never = node;
      return _never;
    }
  }
}

async function toggleVisibility(
  tree: CollectionTreeProvider,
  visTree: VisibilityTreeProvider,
  visView: vscode.TreeView<VisibilityNode>,
  node?: VisibilityNode | TreeNode
): Promise<void> {
  const store = await requireStore();
  const name = visibilityName(node);
  if (!store || !name) {
    return;
  }
  await toggleCollectionVisibility(
    name,
    store.listCollections().map((entry) => entry.name)
  );
  refreshVisibility(tree, visTree, visView);
}

async function chooseVisibleCollections(
  tree: CollectionTreeProvider,
  visTree: VisibilityTreeProvider,
  visView: vscode.TreeView<VisibilityNode>
): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  if (!currentRepoKey()) {
    await vscode.window.showWarningMessage(
      "Open a folder first. Visibility is saved for that repo."
    );
    return;
  }
  const all = store.listCollections();
  if (!all.length) {
    await vscode.window.showInformationMessage("There are no collections yet.");
    return;
  }
  const selected = new Set(visibleCollectionNames() ?? all.map((entry) => entry.name));
  const picked = await vscode.window.showQuickPick(
    all.map((entry) => ({
      label: entry.name,
      picked: selected.has(entry.name),
    })),
    {
      canPickMany: true,
      title: "Collections to show in this repo",
      placeHolder: "Tick the ones you want. Leave all ticked to show everything.",
    }
  );
  if (!picked) {
    return;
  }
  if (picked.length === all.length) {
    await setVisibleCollectionNames(undefined);
  } else {
    await setVisibleCollectionNames(picked.map((item) => item.label));
  }
  refreshVisibility(tree, visTree, visView);
}

async function showAllCollections(
  tree: CollectionTreeProvider,
  visTree: VisibilityTreeProvider,
  visView: vscode.TreeView<VisibilityNode>
): Promise<void> {
  await setVisibleCollectionNames(undefined);
  refreshVisibility(tree, visTree, visView);
}

async function exportCollection(node?: TreeNode): Promise<void> {
  const store = await requireStore();
  if (!store) {
    return;
  }
  const preferred =
    node?.kind === "collection"
      ? node.name
      : node?.kind === "folder" || node?.kind === "request"
        ? node.collection
        : undefined;
  const collections = store.listCollections().map((entry) => entry.name);
  const name =
    preferred && collections.includes(preferred)
      ? preferred
      : (
          await vscode.window.showQuickPick(collections, {
            placeHolder: "Export which collection?",
          })
        );
  if (!name) {
    return;
  }
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(
      path.join(store.rootPath(), `${name}.postman_collection.json`)
    ),
    filters: { JSON: ["json"] },
    saveLabel: "Export",
    title: `Export ${name}`,
  });
  if (!uri) {
    return;
  }
  const payload = JSON.stringify(toPostmanCollection(store, name), null, 2);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(payload, "utf8"));
  await vscode.window.showInformationMessage(`Exported ${name}`);
}

async function setRoot(
  tree: CollectionTreeProvider,
  envTree: EnvTreeProvider,
  flowTree: FlowTreeProvider,
  visTree: VisibilityTreeProvider
): Promise<void> {
  await vscode.workspace
    .getConfiguration("apiClient")
    .update("root", undefined, vscode.ConfigurationTarget.Global);
  const root = await ensureRoot();
  if (!root) {
    return;
  }
  new WorkspaceStore(root).ensureLayout();
  tree.refresh();
  envTree.refresh();
  flowTree.refresh();
  visTree.refresh();
  await vscode.window.showInformationMessage(
    `All collections now live in ${root}`
  );
}
