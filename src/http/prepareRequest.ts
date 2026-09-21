import {
  ApiRequest,
  emptyAuth,
  HeaderPair,
  RequestAuth,
} from "../models";

export function prepareRequest(
  request: ApiRequest,
  extras: {
    defaultHeaders: HeaderPair[];
    collectionHeaders: HeaderPair[];
    collectionAuth: RequestAuth;
  }
): ApiRequest {
  const auth = resolveAuth(request.auth, extras.collectionAuth);
  const headers = [
    ...enabledPairs(extras.defaultHeaders),
    ...enabledPairs(extras.collectionHeaders),
    ...request.headers,
  ];
  const query = [...request.query];
  applyAuth(auth, headers, query);
  return { ...request, headers, query, auth };
}

function resolveAuth(requestAuth: RequestAuth, collectionAuth: RequestAuth): RequestAuth {
  if (!requestAuth || requestAuth.type === "inherit") {
    if (!collectionAuth || collectionAuth.type === "inherit") {
      return { ...emptyAuth(), type: "none" };
    }
    return collectionAuth;
  }
  return requestAuth;
}

function applyAuth(
  auth: RequestAuth,
  headers: HeaderPair[],
  query: HeaderPair[]
): void {
  switch (auth.type) {
    case "inherit":
    case "none":
      break;
    case "bearer":
      if (auth.token.trim()) {
        upsertHeader(headers, "Authorization", `Bearer ${auth.token}`);
      }
      break;
    case "basic": {
      const raw = `${auth.username}:${auth.password}`;
      upsertHeader(headers, "Authorization", `Basic ${Buffer.from(raw).toString("base64")}`);
      break;
    }
    case "apikey":
      if (!auth.key.trim()) {
        break;
      }
      if (auth.addTo === "query") {
        query.push({ key: auth.key, value: auth.value, enabled: true });
      } else {
        upsertHeader(headers, auth.key, auth.value);
      }
      break;
    default: {
      const _never: never = auth.type;
      void _never;
      break;
    }
  }
}

function enabledPairs(pairs: HeaderPair[]): HeaderPair[] {
  return pairs.filter((pair) => pair.enabled && pair.key.trim());
}

function upsertHeader(headers: HeaderPair[], key: string, value: string): void {
  const existing = headers.find(
    (header) => header.enabled && header.key.toLowerCase() === key.toLowerCase()
  );
  if (existing) {
    existing.value = value;
    return;
  }
  headers.push({ key, value, enabled: true });
}
