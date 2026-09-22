import * as vscode from "vscode";
import { getStore } from "../storage/workspaceStore";

export type EnvTarget =
  | { kind: "global" }
  | { kind: "named"; name: string }
  | { kind: "collection"; name: string }
  | { kind: "secrets" };

interface EnvMessage {
  type: "ready" | "save";
  values?: Record<string, string>;
}

export class EnvPanel {
  private panel: vscode.WebviewPanel | undefined;
  private target: EnvTarget = { kind: "global" };

  constructor(private readonly context: vscode.ExtensionContext) {}

  async show(target: EnvTarget): Promise<void> {
    this.target = target;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "apiClient.env",
        "Environment",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.context.extensionUri, "media"),
          ],
        }
      );
      this.panel.webview.html = this.html(this.panel.webview);
      this.panel.webview.onDidReceiveMessage(
        (message: EnvMessage) => this.onMessage(message),
        undefined,
        this.context.subscriptions
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    } else {
      this.panel.reveal(vscode.ViewColumn.Beside);
    }
    await this.pushState();
  }

  private async onMessage(message: EnvMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.pushState();
        break;
      case "save":
        this.save(message.values ?? {});
        break;
      default: {
        const _never: never = message.type;
        void _never;
        break;
      }
    }
  }

  private save(values: Record<string, string>): void {
    const store = getStore();
    if (!store) {
      return;
    }
    switch (this.target.kind) {
      case "global":
        store.writeGlobalEnv({ name: "global", values });
        break;
      case "named":
        store.writeNamedEnv({ name: this.target.name, values });
        break;
      case "collection":
        store.writeCollectionEnv(this.target.name, {
          name: this.target.name,
          values,
        });
        break;
      case "secrets":
        store.writeSecrets({ name: "secrets", values });
        break;
      default: {
        const _never: never = this.target;
        void _never;
        break;
      }
    }
  }

  private async pushState(): Promise<void> {
    if (!this.panel) {
      return;
    }
    const store = getStore();
    if (!store) {
      return;
    }
    let title = "Environment";
    let values: Record<string, string> = {};
    switch (this.target.kind) {
      case "global":
        title = "Global environment";
        values = store.readGlobalEnv().values;
        break;
      case "named":
        title = `Profile · ${this.target.name}`;
        values = store.readNamedEnv(this.target.name).values;
        break;
      case "collection":
        title = `Collection · ${this.target.name}`;
        values = store.readCollectionEnv(this.target.name).values;
        break;
      case "secrets":
        title = "Local secrets";
        values = store.readSecrets().values;
        break;
      default: {
        const _never: never = this.target;
        void _never;
        break;
      }
    }
    this.panel.title = title;
    const hint =
      this.target.kind === "secrets"
        ? "These win over every other env. This file is git-ignored."
        : "Secrets win over collection. Collection wins over profile. Profile wins over global.";
    await this.panel.webview.postMessage({ type: "load", title, values, hint });
  }

  private html(webview: vscode.Webview): string {
    const css = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "request.css")
    );
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${css}" />
</head>
<body>
  <div class="app env-app">
    <header class="topbar">
      <div class="title-block">
        <strong id="title" class="page-title">Environment</strong>
      </div>
      <div class="spacer"></div>
      <div class="toolbar">
        <button type="button" id="add" class="link">Add variable</button>
        <button type="button" id="save" class="primary">Save</button>
      </div>
    </header>
    <section class="page-body">
      <p class="crumb" id="hint">Secrets win over collection. Collection wins over profile.</p>
      <div class="card">
        <div class="table-head env-row"><span>Key</span><span>Value</span><span></span></div>
        <div id="rows" class="pairs"></div>
      </div>
    </section>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const rows = document.getElementById("rows");
    function addRow(key, value) {
      const row = document.createElement("div");
      row.className = "pair-row env-row";
      row.innerHTML = '<input class="k" placeholder="Key" /><input class="v" placeholder="Value" /><button type="button" class="icon-btn" title="Remove">×</button>';
      row.querySelector(".k").value = key || "";
      row.querySelector(".v").value = value || "";
      row.querySelector("button").onclick = () => row.remove();
      rows.appendChild(row);
    }
    function values() {
      const out = {};
      rows.querySelectorAll(".pair-row").forEach((row) => {
        const key = row.querySelector(".k").value.trim();
        if (key) out[key] = row.querySelector(".v").value;
      });
      return out;
    }
    document.getElementById("add").onclick = () => addRow("", "");
    document.getElementById("save").onclick = () => vscode.postMessage({ type: "save", values: values() });
    window.addEventListener("message", (event) => {
      if (event.data.type !== "load") return;
      document.getElementById("title").textContent = event.data.title;
      if (event.data.hint) document.getElementById("hint").textContent = event.data.hint;
      rows.innerHTML = "";
      const entries = Object.entries(event.data.values || {});
      (entries.length ? entries : [["", ""]]).forEach(([key, value]) => addRow(key, value));
    });
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
  }
}
