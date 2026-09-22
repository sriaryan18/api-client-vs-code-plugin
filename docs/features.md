# Features

How the client works. For command names and keys, see [commands](commands.md).

## Layout

The left **API Client** bar has four lists:

- **Collections** — folders and requests
- **Shown in this repo** — tick which collections this workspace should show
- **Environments** — global, local secrets, profiles, collection env
- **Flows** — requests that run in order

Click a request to open it. Cmd-click more than one request to open extra tabs. Right-click **Open in New Tab**.

## Collections and files

Everything is JSON on disk under your collections root:

```
collections/
  my-api/
    env.json
    headers.json
    auth.json
    login.json
    users/
      list.json
environments/
  global.json
  local.json
  secrets.local.json
flows/
  login-then-profile.json
.gitignore
```

`environments/secrets.local.json` is added to `.gitignore` so tokens stay off git.

## Requests

Each request can have:

- Name and optional description
- Method and URL (`{{baseUrl}}/path` works)
- Query params
- Auth: inherit, none, bearer, basic, API key
- Default headers, collection headers, and request headers
- Body: none, JSON, text, form, GraphQL, multipart / file
- Pre-request script and tests (after send)

The editor colors JSON, GraphQL, scripts, and the response.

Send with **Send** or `⌘↵` / `Ctrl+Enter`. Copy curl from the toolbar or the request menu.

### GraphQL

Open the **GraphQL** tab (or Body → GraphQL). Write a query and JSON variables. Send posts `{ "query", "variables" }`.

### File upload

Body → **Multipart / file**. Add text fields or files. **Browse** picks a path from disk.

## Environments

Values merge in this order (later wins):

1. Global
2. Profile (`local` and any other profile)
3. Collection
4. Local secrets

Use `{{name}}` in the URL, headers, body, GraphQL, and scripts. Known names highlight. Hover shows the value.

**Local secrets** win over everything and are not committed.

Scripts can set env values:

- `setGlobal('key', value)` — Global. Every collection can use `{{key}}`.
- `setEnv('key', value, 'global')` — same as `setGlobal`.
- `setEnv('key', value)` — updates the place that key already lives (secrets, collection, profile, or global). A new key is saved on the collection.

If a collection also has the same key, that collection value used to hide Global. Writing with `setGlobal` now removes that collection copy so Global can be read.

## Scripts

**Pre-request** runs before send. **Tests** run after send. You get:

- `setGlobal(key, value)` / `setEnv(key, value, scope)`
- `getEnv(key)`
- `response` (status, body, headers)
- `response.json` as an object when the body is JSON
- `test` / `expect`
- `pm.globals` / `pm.environment` / `pm.test` (Postman-style)

## Search

- Magnifying glass on Collections, or **Search Requests**
- Matches name, description, method, URL, folder
- The tree only shows matches
- **Quick Open Request** jumps to one request

## Shown in this repo

Open a code folder. In **Shown in this repo**, tick the collections you want here. Other collections stay saved, just hidden.

- Tick all (or **Show all**) to show every collection again, including new ones
- A different repo can have a different set
- Saved in `apiClient.visibilityByRepo`

## Move and rename

- **F2** or right-click **Rename** on a collection, folder, or request
- Right-click **Move** on a folder or request
- Drag a request or folder onto another folder

Flows that pointed at the old path are updated.

## Import and export

- **Import Curl** — paste a curl command
- **Import Postman Collection** — headers, scripts, auth, query, description, GraphQL, form files
- **Export Collection** — right-click a collection, save Postman JSON
- **Copy as Curl** — one request

## Runners

**Run Collection** (or a folder): pick how many times and how long to wait. Results show avg / min / max and test counts.

**Flow**: a named list of requests. Run them in order. You can stop on error, wait between steps, and turn scripts on or off per step or for the whole flow.

## MCP

After **Connect MCP to Cursor** and a reload, agents get:

| Tool | What it does |
| --- | --- |
| `search_requests` | Search by name, description, method, URL, folder |
| `list_collections` | List collections and folders |
| `get_request` | Read one saved request |
| `add_request` | Create or update a request |
| `send_request` | Send a saved request (scripts + merged env) |
| `list_flows` | List flows |
| `get_flow` | Read one flow |
| `create_flow` | Create or update a flow |
| `add_flow_step` | Add one request to a flow |
| `run_flow` | Run a flow |
| `list_env` | List env scopes and keys |
| `get_env` | Read env (`global`, `profile`, `collection`, `secrets`) |
| `set_env` | Add or edit one env value |
| `delete_env` | Remove one env value |

MCP sees every collection, even if the sidebar hides some for this repo.
