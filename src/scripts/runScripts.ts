import * as vm from "vm";
import { SendResult } from "../http/sendRequest";
import { EnvScope } from "../models";

const writeMap = new WeakMap<object, Record<string, EnvScope>>();

export function scriptWrites(env: Record<string, string>): Record<string, EnvScope> {
  let writes = writeMap.get(env);
  if (!writes) {
    writes = {};
    writeMap.set(env, writes);
  }
  return writes;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export function runPreScript(script: string, env: Record<string, string>): void {
  if (!script.trim()) {
    return;
  }
  vm.runInNewContext(script, scriptGlobals(env), { timeout: 1500 });
}

export function runPostScript(
  script: string,
  env: Record<string, string>,
  result: SendResult
): TestResult[] {
  const tests: TestResult[] = [];
  if (!script.trim()) {
    return tests;
  }
  let json: unknown;
  try {
    json = JSON.parse(result.body);
  } catch {
    json = undefined;
  }
  const globals = scriptGlobals(env, {
    response: {
      status: result.status,
      statusText: result.statusText,
      body: result.body,
      headers: result.headers,
      json,
      data: json,
      ok: result.ok,
      timeMs: result.timeMs,
    },
    test(name: string, fn: () => void) {
      try {
        fn();
        tests.push({ name, passed: true });
      } catch (error) {
        tests.push({
          name,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    expect(actual: unknown) {
      return {
        toBe(expected: unknown) {
          if (actual !== expected) {
            throw new Error(`Expected ${fmt(expected)}, got ${fmt(actual)}`);
          }
        },
        toContain(part: string) {
          if (!String(actual).includes(part)) {
            throw new Error(`Expected ${fmt(actual)} to contain ${fmt(part)}`);
          }
        },
      };
    },
  });
  vm.runInNewContext(script, globals, { timeout: 2000 });
  return tests;
}

function scriptGlobals(
  env: Record<string, string>,
  extras?: Record<string, unknown>
): Record<string, unknown> {
  const writes = scriptWrites(env);
  const getEnv = (key: string) => env[String(key)];
  const setEnv = (key: string, value: unknown, scope?: unknown) => {
    const name = String(key);
    env[name] = value == null ? "" : String(value);
    if (scope != null && String(scope).trim()) {
      writes[name] = parseScriptScope(scope);
    }
  };
  const setGlobal = (key: string, value: unknown) => {
    setEnv(key, value, "global");
  };
  const globals: Record<string, unknown> = {
    env,
    getEnv,
    setEnv,
    setGlobal,
    pm: {
      environment: {
        set: setEnv,
        get: getEnv,
      },
      variables: {
        set: setEnv,
        get: getEnv,
      },
      globals: {
        set: setGlobal,
        get: getEnv,
      },
    },
    console: {
      log: (...args: unknown[]) => {
        console.log("[api-client script]", ...args);
      },
    },
  };
  if (extras) {
    Object.assign(globals, extras);
    const pm = globals.pm as {
      response?: unknown;
      test?: unknown;
      expect?: unknown;
    };
    pm.response = extras.response;
    pm.test = extras.test;
    pm.expect = extras.expect;
    return globals;
  }
  Object.defineProperty(globals, "response", {
    configurable: true,
    get() {
      throw new Error(
        "response is only in Tests, after you press Send. Move this line to the Tests box."
      );
    },
  });
  return globals;
}

function parseScriptScope(scope: unknown): EnvScope {
  const name = String(scope).trim().toLowerCase();
  switch (name) {
    case "global":
    case "globals":
      return "global";
    case "profile":
    case "environment":
    case "local":
      return "profile";
    case "collection":
      return "collection";
    case "secrets":
    case "secret":
      return "secrets";
    default:
      throw new Error(
        `Unknown env scope "${String(scope)}". Use global, collection, profile, or secrets.`
      );
  }
}

function fmt(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
