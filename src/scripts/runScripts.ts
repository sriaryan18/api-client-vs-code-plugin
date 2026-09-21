import * as vm from "vm";
import { SendResult } from "../http/sendRequest";

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
  const setEnv = (key: string, value: unknown) => {
    env[String(key)] = value == null ? "" : String(value);
  };
  const globals: Record<string, unknown> = {
    env,
    setEnv,
    pm: {
      environment: {
        set: setEnv,
        get: (key: string) => env[String(key)],
      },
      variables: {
        set: setEnv,
        get: (key: string) => env[String(key)],
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

function fmt(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
