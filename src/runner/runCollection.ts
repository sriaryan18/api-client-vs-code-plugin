import { FileStore } from "../storage/fileStore";
import { SendResult } from "../http/sendRequest";
import { TestResult } from "../scripts/runScripts";
import { runOneRequest } from "./runOne";

export interface RequestRun {
  name: string;
  fileName: string;
  result: SendResult;
  tests: TestResult[];
  iteration: number;
  scriptsRan?: boolean;
}

export interface CollectionRun {
  collection: string;
  envName: string;
  iterations: number;
  runs: RequestRun[];
  totalMs: number;
  passed: number;
  failed: number;
  errors: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export async function runCollection(
  store: FileStore,
  relPath: string,
  envName: string,
  options?: { iterations?: number; delayMs?: number }
): Promise<CollectionRun> {
  const iterations = Math.max(1, options?.iterations ?? 1);
  const delayMs = Math.max(0, options?.delayMs ?? 0);
  const collection = store.collectionName(relPath);
  const files = store.listRequestPaths(relPath);
  const runs: RequestRun[] = [];
  const started = Date.now();

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const before = store.mergedEnv(collection, envName);
    const env = { ...before };
    for (const filePath of files) {
      runs.push(await runOneRequest(store, filePath, env, iteration));
    }
    store.persistScriptEnv(collection, envName, before, env);
    if (iteration < iterations && delayMs) {
      await wait(delayMs);
    }
  }

  return summarizeRun(relPath, envName, iterations, runs, Date.now() - started);
}

export function summarizeRun(
  collection: string,
  envName: string,
  iterations: number,
  runs: RequestRun[],
  totalMs: number
): CollectionRun {
  const times = runs.map((run) => run.result.timeMs);
  const failedTests = runs.reduce(
    (count, run) => count + run.tests.filter((test) => !test.passed).length,
    0
  );
  const passedTests = runs.reduce(
    (count, run) => count + run.tests.filter((test) => test.passed).length,
    0
  );
  return {
    collection,
    envName,
    iterations,
    runs,
    totalMs,
    passed: passedTests,
    failed: failedTests,
    errors: runs.filter((run) => Boolean(run.result.error)).length,
    avgMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
    minMs: times.length ? Math.min(...times) : 0,
    maxMs: times.length ? Math.max(...times) : 0,
  };
}

export function formatCollectionRun(run: CollectionRun): string {
  const lines = [
    `${run.collection} · env ${run.envName} · ${run.iterations} iteration${run.iterations === 1 ? "" : "s"}`,
    `${run.runs.length} calls · total ${run.totalMs} ms · avg ${run.avgMs} ms · min ${run.minMs} · max ${run.maxMs}`,
    `${run.passed} tests passed · ${run.failed} failed · ${run.errors} errors`,
    "",
  ];
  for (const item of run.runs) {
    const status = item.result.error ? "ERR" : String(item.result.status ?? "-");
    const testBit = item.tests.length
      ? ` · tests ${item.tests.filter((test) => test.passed).length}/${item.tests.length}`
      : item.scriptsRan === false
        ? " · scripts off"
        : " · scripts ran";
    lines.push(
      `#${item.iteration} ${status.padEnd(4)} ${item.result.timeMs}ms  ${item.name}${testBit}`
    );
    if (item.result.error) {
      lines.push(`     ${item.result.error}`);
    }
    for (const test of item.tests.filter((entry) => !entry.passed)) {
      lines.push(`     x ${test.name}: ${test.error}`);
    }
  }
  return lines.join("\n");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
