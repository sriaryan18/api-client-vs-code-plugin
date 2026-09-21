import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { defaultNewRoot, resolveRoot } from "./paths";

export async function ensureRoot(): Promise<string | undefined> {
  const existing = resolveRoot();
  if (existing && fs.existsSync(existing)) {
    return existing;
  }
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: "Pick an existing folder",
        description: "Use a folder that can be its own git repo",
      },
      {
        label: "Create a new folder",
        description: defaultNewRoot(),
      },
    ],
    { placeHolder: "Where should all collections live?" }
  );
  if (!choice) {
    return undefined;
  }
  let root: string | undefined;
  if (choice.label === "Pick an existing folder") {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: "Collections base folder",
    });
    root = picked?.[0]?.fsPath;
  } else {
    const typed = await vscode.window.showInputBox({
      prompt: "New folder for all collections",
      value: defaultNewRoot(),
    });
    root = typed?.trim();
    if (root) {
      fs.mkdirSync(root, { recursive: true });
    }
  }
  if (!root) {
    return undefined;
  }
  const config = vscode.workspace.getConfiguration("apiClient");
  await config.update("root", undefined, vscode.ConfigurationTarget.Workspace);
  await config.update("root", root, vscode.ConfigurationTarget.Global);
  initGitRepo(root);
  return root;
}

function initGitRepo(root: string): void {
  if (fs.existsSync(path.join(root, ".git"))) {
    return;
  }
  try {
    execFileSync("git", ["init"], { cwd: root });
    const ignore = path.join(root, ".gitignore");
    if (!fs.existsSync(ignore)) {
      fs.writeFileSync(ignore, ".DS_Store\n");
    }
    const readme = path.join(root, "README.md");
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(
        readme,
        "# API collections\n\nLocal API Client data. This folder is the git repo for requests and env files.\n"
      );
    }
  } catch {
    // git may be missing; the folder still works
  }
}
