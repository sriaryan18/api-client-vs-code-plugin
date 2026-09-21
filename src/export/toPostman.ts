import * as path from "path";
import { ApiRequest, RequestAuth } from "../models";
import { FileStore } from "../storage/fileStore";

export function toPostmanCollection(
  store: FileStore,
  collection: string
): Record<string, unknown> {
  const env = store.readCollectionEnv(collection);
  const auth = store.readCollectionAuth(collection);
  const postmanAuth = authToPostman(auth);
  return {
    info: {
      name: collection,
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: Object.entries(env.values).map(([key, value]) => ({
      key,
      value,
    })),
    ...(postmanAuth ? { auth: postmanAuth } : {}),
    item: itemsAt(store, collection),
  };
}

function itemsAt(store: FileStore, relPath: string): unknown[] {
  const folders = store.listFolders(relPath).map((folder) => ({
    name: folder.name,
    item: itemsAt(store, folder.relPath),
  }));
  const requests = store.listRequestFiles(relPath).map((fileName) => {
    const request = store.readRequest(
      path.join(store.resolve(relPath), fileName)
    );
    return requestToItem(request);
  });
  return [...folders, ...requests];
}

function requestToItem(request: ApiRequest): Record<string, unknown> {
  const query = request.query.filter((pair) => pair.key.trim());
  const headers = request.headers.filter((pair) => pair.key.trim());
  const auth = authToPostman(request.auth);
  const events = eventsFrom(request);
  const item: Record<string, unknown> = {
    name: request.name,
    request: {
      method: request.method,
      header: headers.map((pair) => ({
        key: pair.key,
        value: pair.value,
        disabled: !pair.enabled,
      })),
      url: {
        raw: request.url,
        query: query.map((pair) => ({
          key: pair.key,
          value: pair.value,
          disabled: !pair.enabled,
        })),
      },
      ...(request.description ? { description: request.description } : {}),
      ...(auth ? { auth } : {}),
      ...bodyFrom(request),
    },
  };
  if (events.length) {
    item.event = events;
  }
  return item;
}

function bodyFrom(request: ApiRequest): { body?: Record<string, unknown> } {
  switch (request.body.mode) {
    case "none":
      return {};
    case "form":
      if (!request.body.raw) {
        return {};
      }
      return {
        body: {
          mode: "urlencoded",
          urlencoded: request.body.raw.split("&").map((part) => {
            const split = part.indexOf("=");
            return {
              key: split === -1 ? part : part.slice(0, split),
              value: split === -1 ? "" : part.slice(split + 1),
            };
          }),
        },
      };
    case "graphql":
      return {
        body: {
          mode: "graphql",
          graphql: {
            query: request.body.graphqlQuery,
            variables: request.body.graphqlVariables,
          },
        },
      };
    case "multipart":
      return {
        body: {
          mode: "formdata",
          formdata: request.body.parts
            .filter((part) => part.key.trim())
            .map((part) => ({
              key: part.key,
              value: part.kind === "file" ? undefined : part.value,
              src: part.kind === "file" ? part.value : undefined,
              type: part.kind === "file" ? "file" : "text",
              disabled: !part.enabled,
            })),
        },
      };
    case "json":
    case "text":
      if (!request.body.raw) {
        return {};
      }
      return {
        body: {
          mode: "raw",
          raw: request.body.raw,
          options:
            request.body.mode === "json"
              ? { raw: { language: "json" } }
              : undefined,
        },
      };
    default: {
      const _never: never = request.body.mode;
      return _never;
    }
  }
}

function eventsFrom(request: ApiRequest): unknown[] {
  const events: unknown[] = [];
  if (request.scripts.pre.trim()) {
    events.push({
      listen: "prerequest",
      script: {
        type: "text/javascript",
        exec: request.scripts.pre.split("\n"),
      },
    });
  }
  if (request.scripts.post.trim()) {
    events.push({
      listen: "test",
      script: {
        type: "text/javascript",
        exec: request.scripts.post.split("\n"),
      },
    });
  }
  return events;
}

function authToPostman(auth: RequestAuth): Record<string, unknown> | undefined {
  switch (auth.type) {
    case "inherit":
      return undefined;
    case "none":
      return { type: "noauth" };
    case "bearer":
      return {
        type: "bearer",
        bearer: [{ key: "token", value: auth.token, type: "string" }],
      };
    case "basic":
      return {
        type: "basic",
        basic: [
          { key: "username", value: auth.username, type: "string" },
          { key: "password", value: auth.password, type: "string" },
        ],
      };
    case "apikey":
      return {
        type: "apikey",
        apikey: [
          { key: "key", value: auth.key, type: "string" },
          { key: "value", value: auth.value, type: "string" },
          {
            key: "in",
            value: auth.addTo === "query" ? "query" : "header",
            type: "string",
          },
        ],
      };
    default: {
      const _never: never = auth.type;
      return _never;
    }
  }
}
