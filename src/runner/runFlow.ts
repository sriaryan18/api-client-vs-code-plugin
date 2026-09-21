import { ApiFlow } from "../models";
import { FileStore } from "../storage/fileStore";
import {
  CollectionRun,
  formatCollectionRun,
  RequestRun,
  summarizeRun,
} from "./runCollection";
import { runOneRequest } from "./runOne";

export async function runFlow(
  store: FileStore,
  flow: ApiFlow
): Promise<CollectionRun> {
  const envName = flow.env || "local";
  const started = Date.now();
  const startShared = {
    ...store.readGlobalEnv().values,
    ...store.readNamedEnv(envName).values,
  };
  const shared = { ...startShared };
  const runs: RequestRun[] = [];

  for (const [index, step] of flow.steps.entries()) {
    const filePath = store.findRequestPath(step.folder, step.name);
    if (!filePath) {
      runs.push({
        name: step.name || "(missing)",
        fileName: "",
        iteration: index + 1,
        result: {
          ok: false,
          timeMs: 0,
          sizeBytes: 0,
          headers: [],
          body: "",
          error: `Request not found: ${step.folder}/${step.name}`,
        },
        tests: [],
      });
      if (flow.stopOnError) {
        break;
      }
      continue;
    }
    const collection = store.collectionName(step.folder);
    const working = {
      ...store.readCollectionEnv(collection).values,
      ...shared,
    };
    const runScripts = flow.runScripts !== false && step.runScripts !== false;
    const run = await runOneRequest(store, filePath, working, index + 1, {
      runScripts,
    });
    Object.assign(shared, working);
    store.persistScriptEnv(collection, envName, startShared, working);
    runs.push(run);
    const failed =
      Boolean(run.result.error) ||
      run.result.ok === false ||
      run.tests.some((test) => !test.passed);
    if (flow.stopOnError && failed) {
      break;
    }
    if (flow.delayMs && index < flow.steps.length - 1) {
      await wait(flow.delayMs);
    }
  }

  persistShared(store, envName, startShared, shared);
  return summarizeRun(flow.name, envName, 1, runs, Date.now() - started);
}

export function formatFlowRun(run: CollectionRun): string {
  return formatCollectionRun(run);
}

function persistShared(
  store: FileStore,
  envName: string,
  before: Record<string, string>,
  after: Record<string, string>
): void {
  const changed: Record<string, string> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) {
      changed[key] = value;
    }
  }
  if (!Object.keys(changed).length) {
    return;
  }
  const current = store.readNamedEnv(envName);
  store.writeNamedEnv({
    name: envName,
    values: { ...current.values, ...changed },
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
