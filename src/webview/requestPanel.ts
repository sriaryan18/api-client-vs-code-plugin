import * as path from "path";
import * as vscode from "vscode";
import { toCurl } from "../export/toCurl";
import { prepareRequest } from "../http/prepareRequest";
import { sendRequest } from "../http/sendRequest";
import { ApiRequest, HeaderPair } from "../models";
import { runPostScript, runPreScript } from "../scripts/runScripts";
import { getStore } from "../storage/workspaceStore";
import { RequestNode } from "../tree/collectionTree";

interface WebviewMessage {
  type:
    | "ready"
    | "save"
    | "send"
    | "setEnv"
    | "copyCurl"
    | "editEnv"
    | "saveDefaults"
    | "pickFile";
  request?: ApiRequest;
  envName?: string;
  defaultHeaders?: HeaderPair[];
  collectionHeaders?: HeaderPair[];
  partIndex?: number;
}

export function multipleTabsEnabled(): boolean {
  return vscode.workspace.getConfiguration("apiClient").get("multipleTabs", true);
}

export class RequestPanel {
  private readonly tabs = new Map<string, RequestTab>();
  private active: RequestTab | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  currentNode(): RequestNode | undefined {
    return this.active?.node;
  }

  activeEnvironment(): string {
    return this.active?.activeEnv ?? "local";
  }

  async show(
    node: RequestNode,
    options?: { newTab?: boolean }
  ): Promise<void> {
    const forceNew = options?.newTab === true;
    if (!forceNew) {
      const existing = [...this.tabs.values()].find(
        (tab) => tab.node.filePath === node.filePath
      );
      if (existing) {
        this.active = existing;
        existing.panel.reveal(existing.panel.viewColumn);
        await existing.pushState();
        return;
      }
    }
    if (!forceNew && !multipleTabsEnabled()) {
      const reuse = this.active ?? [...this.tabs.values()][0];
      if (reuse) {
        reuse.node = node;
        this.active = reuse;
        reuse.panel.reveal(reuse.panel.viewColumn);
        await reuse.pushState();
        return;
      }
    }
    const tab = new RequestTab(this.context, node, (id) => {
      this.tabs.delete(id);
      if (this.active?.id === id) {
        this.active = [...this.tabs.values()][0];
      }
    });
    this.tabs.set(tab.id, tab);
    this.active = tab;
    tab.panel.onDidChangeViewState(() => {
      if (tab.panel.active) {
        this.active = tab;
      }
    });
    await tab.start();
  }

  async sendActive(): Promise<void> {
    await this.active?.panel.webview.postMessage({ type: "pleaseSend" });
  }

  retargetUnder(oldDir: string, newDir: string): void {
    for (const tab of this.tabs.values()) {
      const filePath = tab.node.filePath;
      if (filePath !== oldDir && !filePath.startsWith(`${oldDir}${path.sep}`)) {
        continue;
      }
      const nextPath = `${newDir}${filePath.slice(oldDir.length)}`;
      const store = getStore();
      tab.node = {
        ...tab.node,
        filePath: nextPath,
        fileName: path.basename(nextPath),
        relDir: store?.requestFolder(nextPath) ?? tab.node.relDir,
        collection: store?.collectionName(store.requestFolder(nextPath)) || tab.node.collection,
      };
    }
  }

  async copyActiveCurl(): Promise<void> {
    await this.active?.panel.webview.postMessage({ type: "pleaseCopyCurl" });
  }
}

class RequestTab {
  readonly id: string;
  readonly panel: vscode.WebviewPanel;
  activeEnv = "local";

  constructor(
    private readonly context: vscode.ExtensionContext,
    public node: RequestNode,
    onDispose: (id: string) => void
  ) {
    this.id = `${node.filePath}::${Date.now()}`;
    this.panel = vscode.window.createWebviewPanel(
      "apiClient.request",
      "Request",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media"),
        ],
      }
    );
    this.panel.webview.html = requestHtml(this.panel.webview, this.context);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.onMessage(message),
      undefined,
      this.context.subscriptions
    );
    this.panel.onDidDispose(() => onDispose(this.id));
  }

  async start(): Promise<void> {
    await this.pushState();
  }

  private async onMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.pushState();
        break;
      case "save":
        if (message.request) {
          getStore()?.writeRequest(this.node.filePath, message.request);
          this.panel.title = message.request.name || "Request";
        }
        break;
      case "setEnv":
        this.activeEnv = message.envName || "local";
        await this.pushEnv();
        break;
      case "saveDefaults":
        this.saveDefaults(message.defaultHeaders, message.collectionHeaders);
        break;
      case "send":
        await this.handleSend(message.request);
        break;
      case "copyCurl":
        await this.handleCopyCurl(message.request);
        break;
      case "editEnv":
        await vscode.commands.executeCommand("apiClient.editEnv");
        break;
      case "pickFile": {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          title: "Pick a file to upload",
        });
        if (picked?.[0]) {
          await this.panel.webview.postMessage({
            type: "pickedFile",
            partIndex: message.partIndex ?? 0,
            path: picked[0].fsPath,
          });
        }
        break;
      }
      default: {
        const _never: never = message.type;
        void _never;
        break;
      }
    }
  }

  private envValues(): Record<string, string> {
    return getStore()?.mergedEnv(this.node.collection, this.activeEnv) ?? {};
  }

  private extras() {
    const store = getStore();
    const collection = this.node.collection;
    return {
      defaultHeaders: store?.readDefaultHeaders() ?? [],
      collectionHeaders: store?.readCollectionHeaders(collection) ?? [],
      collectionAuth: store?.readCollectionAuth(collection) ?? {
        type: "none" as const,
        token: "",
        username: "",
        password: "",
        key: "",
        value: "",
        addTo: "header" as const,
      },
    };
  }

  private saveDefaults(
    defaultHeaders?: HeaderPair[],
    collectionHeaders?: HeaderPair[]
  ): void {
    const store = getStore();
    if (!store) {
      return;
    }
    if (defaultHeaders) {
      store.writeDefaultHeaders(defaultHeaders);
    }
    if (collectionHeaders && this.node.collection) {
      store.writeCollectionHeaders(this.node.collection, collectionHeaders);
    }
  }

  private prepared(request: ApiRequest): ApiRequest {
    return prepareRequest(request, this.extras());
  }

  private async handleCopyCurl(request: ApiRequest | undefined): Promise<void> {
    if (!request) {
      return;
    }
    await vscode.env.clipboard.writeText(
      toCurl(this.prepared(request), this.envValues())
    );
    await vscode.window.showInformationMessage("Copied curl.");
  }

  private async handleSend(request: ApiRequest | undefined): Promise<void> {
    if (!request) {
      return;
    }
    const store = getStore();
    const collection = this.node.collection;
    const before = store?.mergedEnv(collection, this.activeEnv) ?? {};
    const env = { ...before };
    try {
      runPreScript(request.scripts.pre, env);
    } catch (error) {
      await this.panel.webview.postMessage({
        type: "result",
        result: {
          ok: false,
          timeMs: 0,
          sizeBytes: 0,
          headers: [],
          body: "",
          error: `Pre-script: ${error instanceof Error ? error.message : String(error)}`,
        },
        tests: [],
      });
      return;
    }
    const result = await sendRequest(this.prepared(request), env);
    let tests = [];
    try {
      tests = runPostScript(request.scripts.post, env, result);
    } catch (error) {
      tests = [
        {
          name: "post-script",
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        },
      ];
    }
    store?.persistScriptEnv(collection, this.activeEnv, before, env);
    await this.pushEnv();
    await this.panel.webview.postMessage({ type: "result", result, tests });
  }

  async pushState(): Promise<void> {
    const store = getStore();
    if (!store) {
      return;
    }
    const request = store.readRequest(this.node.filePath);
    const environments = store.listNamedEnvironments();
    if (!environments.some((item) => item.name === this.activeEnv)) {
      this.activeEnv = environments[0]?.name || "local";
    }
    this.panel.title = request.name || "Request";
    await this.panel.webview.postMessage({
      type: "load",
      request,
      environments: environments.map((item) => item.name),
      activeEnv: this.activeEnv,
      collection: this.node.collection,
      folder: this.node.relDir,
      filePath: this.node.filePath,
      envValues: store.mergedEnv(this.node.collection, this.activeEnv),
      defaultHeaders: store.readDefaultHeaders(),
      collectionHeaders: store.readCollectionHeaders(this.node.collection),
    });
  }

  private async pushEnv(): Promise<void> {
    await this.panel.webview.postMessage({
      type: "env",
      envValues: this.envValues(),
    });
  }
}

function requestHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext
): string {
  const css = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "request.css")
  );
  const js = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "media", "request.js")
  );
  const nonce = String(Date.now());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${css}" />
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="title-block">
        <input id="name" class="name" type="text" placeholder="Request name" />
        <input id="description" class="note" type="text" placeholder="Description" />
        <div class="crumb" id="crumb"></div>
      </div>
      <div class="toolbar">
        <label class="env-pick">
          <select id="env" title="Environment profile"></select>
        </label>
        <button type="button" id="edit-env" class="ghost">Edit</button>
        <button type="button" id="copy-curl" class="ghost">Curl</button>
      </div>
    </header>
    <div class="composer-wrap">
      <div class="composer">
        <select id="method" class="method"></select>
        <div class="hl-wrap" id="url-wrap">
          <div class="hl-mirror" id="url-mirror"></div>
          <input id="url" type="text" spellcheck="false" placeholder="{{baseUrl}}/path" />
        </div>
        <button id="send" type="button">Send</button>
      </div>
    </div>
    <div class="workspace">
    <section class="editor">
      <div class="tabs" id="req-tabs">
        <button type="button" data-tab="params" class="active">Params</button>
        <button type="button" data-tab="auth">Auth</button>
        <button type="button" data-tab="headers">Headers</button>
        <button type="button" data-tab="body">Body</button>
        <button type="button" data-tab="graphql">GraphQL</button>
        <button type="button" data-tab="scripts">Scripts</button>
      </div>
      <section id="tab-params" class="tab-page flat">
        <div class="section-head"><span>Query params</span><button type="button" id="add-query" class="link">Add</button></div>
        <div class="table-head"><span></span><span>Key</span><span>Value</span><span></span></div>
        <div id="query" class="pairs"></div>
      </section>
      <section id="tab-auth" class="tab-page hidden">
        <div class="auth-page">
          <label>Type
            <select id="auth-type">
              <option value="inherit">Inherit from collection</option>
              <option value="none">No Auth</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="apikey">API Key</option>
            </select>
          </label>
          <div id="auth-bearer" class="auth-fields hidden">
            <label>Token<input id="auth-token" class="suggest-field" spellcheck="false" placeholder="{{dealerToken}}" /></label>
          </div>
          <div id="auth-basic" class="auth-fields hidden">
            <label>Username<input id="auth-user" class="suggest-field" spellcheck="false" /></label>
            <label>Password<input id="auth-pass" class="suggest-field" spellcheck="false" /></label>
          </div>
          <div id="auth-apikey" class="auth-fields hidden">
            <label>Key<input id="auth-key" class="suggest-field" spellcheck="false" placeholder="X-API-Key" /></label>
            <label>Value<input id="auth-value" class="suggest-field" spellcheck="false" placeholder="{{apiKey}}" /></label>
            <label>Add to
              <select id="auth-addto">
                <option value="header">Header</option>
                <option value="query">Query params</option>
              </select>
            </label>
          </div>
        </div>
      </section>
      <section id="tab-headers" class="tab-page hidden flat">
        <div class="section-head"><span>Default headers</span><button type="button" id="add-default-header" class="link">Add</button></div>
        <div class="table-head"><span></span><span>Key</span><span>Value</span><span></span></div>
        <div id="default-headers" class="pairs"></div>
        <div class="section-head"><span>Collection headers</span><button type="button" id="add-collection-header" class="link">Add</button></div>
        <div class="table-head"><span></span><span>Key</span><span>Value</span><span></span></div>
        <div id="collection-headers" class="pairs"></div>
        <div class="section-head"><span>This request</span><button type="button" id="add-header" class="link">Add</button></div>
        <div class="table-head"><span></span><span>Key</span><span>Value</span><span></span></div>
        <div id="headers" class="pairs"></div>
      </section>
      <section id="tab-body" class="tab-page hidden">
        <div class="body-tools">
          <select id="body-mode">
            <option value="none">None</option>
            <option value="json">JSON</option>
            <option value="text">Text</option>
            <option value="form">Form</option>
            <option value="graphql">GraphQL</option>
            <option value="multipart">Multipart / file</option>
          </select>
          <button type="button" id="format-json" class="link">Beautify</button>
        </div>
        <div id="body-raw" class="hl-wrap hl-area">
          <div class="hl-mirror" id="body-mirror"></div>
          <textarea id="body" placeholder='{ "token": "{{dealerToken}}" }' spellcheck="false"></textarea>
        </div>
        <div id="body-graphql" class="hidden gql">
          <label>Query
            <div class="hl-wrap hl-area">
              <div class="hl-mirror" id="gql-query-mirror"></div>
              <textarea id="gql-query" placeholder="query { me { id } }" spellcheck="false"></textarea>
            </div>
          </label>
          <label>Variables (JSON)
            <div class="hl-wrap hl-area">
              <div class="hl-mirror" id="gql-vars-mirror"></div>
              <textarea id="gql-vars" placeholder='{ "id": "1" }' spellcheck="false"></textarea>
            </div>
          </label>
        </div>
        <div id="body-multipart" class="hidden">
          <div class="card">
            <div class="card-head"><h3>Form fields and files</h3><button type="button" id="add-part" class="link">Add</button></div>
            <div id="parts" class="pairs"></div>
          </div>
        </div>
      </section>
      <section id="tab-scripts" class="tab-page hidden scripts">
        <label>Pre-request
          <div class="hl-wrap hl-area">
            <div class="hl-mirror" id="pre-mirror"></div>
            <textarea id="pre" placeholder="setGlobal('ready', '1')" spellcheck="false"></textarea>
          </div>
        </label>
        <label>Tests
          <div class="hl-wrap hl-area">
            <div class="hl-mirror" id="post-mirror"></div>
            <textarea id="post" placeholder="setGlobal('dealerToken', response.json.access_token)" spellcheck="false"></textarea>
          </div>
        </label>
      </section>
    </section>
    <section class="response">
      <div class="response-bar">
        <div class="tabs" id="res-tabs">
          <button type="button" data-restab="body" class="active">Body</button>
          <button type="button" data-restab="headers">Headers</button>
          <button type="button" data-restab="tests">Tests</button>
        </div>
        <div class="res-meta">
          <span id="status-chip" class="chip idle"></span>
          <span id="meta"></span>
        </div>
      </div>
      <pre id="res-body" class="res-page code-view is-empty">Send to see the response</pre>
      <pre id="res-headers" class="res-page code-view hidden"></pre>
      <div id="res-tests" class="res-page tests-view hidden"></div>
    </section>
    </div>
    <div id="suggest" class="suggest hidden"></div>
    <div id="env-tip" class="env-tip hidden"></div>
  </div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
}
