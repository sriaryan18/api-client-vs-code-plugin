# API Client

A local API client for VS Code and Cursor. Collections live in one folder you choose. That folder can be its own git repo.

Full lists:

- [All features](docs/features.md)
- [All commands and keys](docs/commands.md)

## Run from this repo (dev)

You need Node 18+ and Cursor or VS Code.

```bash
cd /path/to/api-client-plugin
npm install
npm run compile
```

Then press **F5** in this repo (launch config **Run Extension**). A new window opens with the extension loaded.

To watch files while you edit:

```bash
npm run watch
```

Keep that running, then press **F5** again after a compile.

## Install the packaged extension

```bash
npm install
npm run compile
npx @vscode/vsce package --allow-missing-repository --skip-license
cursor --install-extension api-client-0.6.13.vsix --force
```

Use `code` instead of `cursor` if you are in VS Code. Reload the window after install.

The version in the `.vsix` name matches `package.json`.

## First use

1. Open the **API Client** icon in the left bar.
2. Click **Set Collections Location** (or run that command from the palette).
3. Pick a folder, or create `~/api-collections`.
4. That folder holds every collection, env, and flow. Git belongs there, not in this plugin.

Then:

1. **New Collection**
2. **New Request**
3. Set a URL and press **Send** (`⌘↵` on Mac, `Ctrl+Enter` on Windows/Linux)

## Settings

| Setting | What it does |
| --- | --- |
| `apiClient.root` | Absolute folder for all collections. Empty means pick one on first use. |
| `apiClient.multipleTabs` | Open each request in its own tab. Default is on. |
| `apiClient.visibilityByRepo` | Which collections to show for each repo path. Missing path = show all. |

## MCP

1. Run **API Client: Connect MCP to Cursor**
2. Reload Cursor
3. Agents can search, send, edit env, and run flows

See [features](docs/features.md#mcp) for the tool list.
