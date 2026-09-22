import * as vscode from "vscode";
import { ApiFlow, FlowStep } from "../models";
import { formatFlowRun, runFlow } from "../runner/runFlow";
import { getStore } from "../storage/workspaceStore";

interface FlowMessage {
  type: "ready" | "save" | "run" | "addStep";
  flow?: ApiFlow;
}

export class FlowPanel {
  private panel: vscode.WebviewPanel | undefined;
  private filePath = "";

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {}

  async show(filePath: string): Promise<void> {
    this.filePath = filePath;
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "apiClient.flow",
        "Flow",
        vscode.ViewColumn.One,
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
        (message: FlowMessage) => this.onMessage(message),
        undefined,
        this.context.subscriptions
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.filePath = "";
      });
    } else {
      this.panel.reveal(vscode.ViewColumn.One);
    }
    await this.pushState();
  }

  currentPath(): string {
    return this.filePath;
  }

  private async onMessage(message: FlowMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.pushState();
        break;
      case "save":
        if (message.flow) {
          getStore()?.writeFlow(this.filePath, message.flow);
          if (this.panel) {
            this.panel.title = message.flow.name || "Flow";
          }
        }
        break;
      case "addStep":
        await this.addStep();
        break;
      case "run":
        if (message.flow) {
          getStore()?.writeFlow(this.filePath, message.flow);
        }
        await this.run();
        break;
      default: {
        const _never: never = message.type;
        void _never;
        break;
      }
    }
  }

  private async addStep(): Promise<void> {
    const store = getStore();
    if (!store || !this.filePath) {
      return;
    }
    const picked = await pickRequestStep();
    if (!picked) {
      return;
    }
    const flow = store.readFlow(this.filePath);
    flow.steps.push(picked);
    store.writeFlow(this.filePath, flow);
    await this.pushState();
  }

  private async run(): Promise<void> {
    const store = getStore();
    if (!store || !this.panel || !this.filePath) {
      return;
    }
    const flow = store.readFlow(this.filePath);
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Running ${flow.name}`,
      },
      async () => runFlow(store, flow)
    );
    this.output.clear();
    this.output.appendLine(formatFlowRun(result));
    this.output.show(true);
    await this.panel.webview.postMessage({
      type: "result",
      summary: `${result.runs.length} calls · ${result.errors} errors · ${result.passed} tests passed`,
      lines: formatFlowRun(result),
    });
  }

  private async pushState(): Promise<void> {
    if (!this.panel || !this.filePath) {
      return;
    }
    const store = getStore();
    if (!store) {
      return;
    }
    const flow = store.readFlow(this.filePath);
    this.panel.title = flow.name || "Flow";
    const steps = flow.steps.map((step) => {
      const filePath = store.findRequestPath(step.folder, step.name);
      const request = filePath ? store.readRequest(filePath) : undefined;
      return {
        folder: step.folder,
        name: step.name,
        method: request?.method || "?",
        missing: !filePath,
        runScripts: step.runScripts !== false,
        hasScripts: Boolean(
          request?.scripts.pre.trim() || request?.scripts.post.trim()
        ),
      };
    });
    await this.panel.webview.postMessage({
      type: "load",
      flow,
      steps,
      environments: store.listNamedEnvironments().map((item) => item.name),
    });
  }

  private html(webview: vscode.Webview): string {
    const css = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "request.css")
    );
    const js = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "flow.js")
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
        <input id="name" class="name" type="text" placeholder="Flow name" />
        <div class="crumb">Steps run in order. Test env changes pass to the next step.</div>
      </div>
      <div class="toolbar">
        <label class="env-pick">Env
          <select id="env"></select>
        </label>
        <button type="button" id="run" class="primary">Run</button>
      </div>
    </header>
    <section class="page-body flow-layout">
      <div class="flow-opts">
        <label><input id="scripts" type="checkbox" /> Run scripts</label>
        <label><input id="stop" type="checkbox" /> Stop on fail</label>
        <label>Wait (ms) <input id="delay" type="number" min="0" value="0" /></label>
        <button type="button" id="add" class="link">Add request</button>
      </div>
      <div id="steps" class="flow-steps"></div>
      <pre id="result" class="flow-result"></pre>
    </section>
  </div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}

export async function pickRequestStep(): Promise<FlowStep | undefined> {
  const store = getStore();
  if (!store) {
    return undefined;
  }
  const items = store.listRequestPaths("").map((filePath) => {
    const request = store.readRequest(filePath);
    const folder = store.requestFolder(filePath);
    return {
      label: request.name,
      description: `${request.method}  ${folder}`,
      detail: request.url,
      step: { folder, name: request.name, runScripts: true },
    };
  });
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Add a request to this flow",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return picked?.step;
}
