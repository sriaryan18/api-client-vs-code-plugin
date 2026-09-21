# Commands and keys

Open the command palette and type **API Client**. Keys below: Mac first, then Windows/Linux.

## Everyday

| Command | What it does | Key |
| --- | --- | --- |
| API Client: Send Request | Send the open request | `⌘↵` / `Ctrl+Enter` (request tab) |
| API Client: Edit Environment | Open env for the current profile or collection | `⌘⌥E` / `Ctrl+Alt+E` |
| API Client: Copy as Curl | Copy the open request (or the one you right-clicked) | `⌘⌥C` / `Ctrl+Alt+C` (request tab) |
| API Client: Quick Open Request | Jump to a request | `⌘⌥P` / `Ctrl+Alt+P` |
| API Client: Search Requests | Filter the tree by name, description, URL, folder | `⌘⌥F` / `Ctrl+Alt+F` |
| API Client: Clear Search | Show the full tree again | — |
| API Client: Refresh | Reload collections, env, and flows | — |

In a request tab you can also:

- `⌘⇧F` / `Ctrl+Shift+F` — beautify JSON body
- `⌘1`–`⌘5` / `Ctrl+1`–`5` — Params, Auth, Headers, Body, Scripts

## Collections

| Command | What it does | Key |
| --- | --- | --- |
| API Client: Set Collections Location | Pick the folder that holds every collection | `⌘⌥⇧L` / `Ctrl+Alt+Shift+L` |
| API Client: New Collection | Create a collection | `⌘⌥⇧N` / `Ctrl+Alt+Shift+N` |
| API Client: New Folder | Create a folder | `⌘⌥⇧F` / `Ctrl+Alt+Shift+F` |
| API Client: New Request | Create a request | `⌘⌥N` / `Ctrl+Alt+N` |
| API Client: Open Request | Open in the current tab (or a new one if multi-tab is on) | click the request |
| API Client: Open in New Tab | Always a new tab | right-click |
| API Client: Duplicate Request | Copy a request | `⌘⌥D` / `Ctrl+Alt+D` |
| API Client: Rename | Rename collection, folder, or request | `F2` on the tree item |
| API Client: Move | Move a folder or request | right-click |
| API Client: Delete Request | Delete one request | right-click |
| API Client: Delete Folder | Delete a folder | right-click |
| API Client: Delete Collection | Delete a collection | right-click |
| API Client: Run Collection | Run every request in a collection or folder | `⌘⌥R` / `Ctrl+Alt+R` |

Drag a request or folder onto another folder to move it.

## Import and export

| Command | What it does | Key |
| --- | --- | --- |
| API Client: Import Curl | Paste curl and save a request | `⌘⌥I` / `Ctrl+Alt+I` |
| API Client: Import Postman Collection | Import a Postman JSON file | — |
| API Client: Export Collection | Save a collection as Postman JSON | right-click a collection |

## Visibility (this repo)

| Command | What it does |
| --- | --- |
| API Client: Choose Collections for This Repo | Checklist of what this workspace shows |
| API Client: Show All Collections | Clear the filter for this repo |
| API Client: Show or Hide Collection in This Repo | Toggle one collection |

Or tick boxes in the **Shown in this repo** view.

## Environments

| Command | What it does |
| --- | --- |
| API Client: Edit Environment | Open the env editor |
| API Client: Open Environment | Open a row from the Environments list |

Rows: **Global**, **Local secrets**, each profile, each collection.

## Flows

| Command | What it does | Key |
| --- | --- | --- |
| API Client: New Flow | Create a flow | `⌘⌥⇧W` / `Ctrl+Alt+Shift+W` |
| API Client: Open Flow | Open a flow | click it |
| API Client: Run Flow | Run a flow | `⌘⌥⇧R` / `Ctrl+Alt+Shift+R` |
| API Client: Add to Flow | Add the selected request to a flow | right-click a request |
| API Client: Delete Flow | Delete a flow | right-click |

## MCP

| Command | What it does |
| --- | --- |
| API Client: Connect MCP to Cursor | Write `~/.cursor/mcp.json` and copy the server files |

Reload Cursor after this. Tool names are in [features](features.md#mcp).

## Internal / palette-only

These also exist in the palette. You rarely type them yourself:

| Command | Used when |
| --- | --- |
| API Client: Open Request | Tree click |
| API Client: Open Environment | Env tree click |
| API Client: Open Flow | Flow tree click |
