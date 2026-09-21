# API Client

A local API client for VS Code and Cursor. Collections live in one base folder you choose. That folder can be its own git repo.

## First run

1. Reload Cursor
2. Click **Set Collections Location** or create a collection
3. Pick an existing folder, or create `~/api-collections`
4. That folder is used for every collection. Git lives there, not in this plugin.

## Env

- **Global** — all collections
- **Profile** (`local`, and others) — selected in the request bar
- **Collection** — one collection only

Merge order: global, then profile, then collection.

Open the **Environments** view or press the **Env** button.

## Test runner

Run a collection or folder. You choose iterations and wait time. Results show avg / min / max and test counts.

## MCP for Cursor / Claude

Run **API Client: Connect MCP to Cursor**, then reload Cursor.

Tools: `search_requests`, `list_collections`, `get_request`, `add_request`, `send_request`.

## Keyboard

| Action | Mac |
| --- | --- |
| Send | ⌘↵ |
| Env | ⌘⌥E |
| Run collection | ⌘⌥R |
| New collection | ⌘⌥⇧N |
| Set location | ⌘⌥⇧L |
