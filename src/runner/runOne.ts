import * as path from "path";
import { prepareRequest } from "../http/prepareRequest";
import { sendRequest } from "../http/sendRequest";
import { runPostScript, runPreScript, TestResult } from "../scripts/runScripts";
import { FileStore } from "../storage/fileStore";
import { RequestRun } from "./runCollection";

export async function runOneRequest(
  store: FileStore,
  filePath: string,
  env: Record<string, string>,
  iteration = 1,
  options?: { runScripts?: boolean }
): Promise<RequestRun> {
  const request = store.readRequest(filePath);
  const fileName = path.basename(filePath);
  const collection = store.collectionName(store.requestFolder(filePath));
  const runScripts = options?.runScripts !== false;
  try {
    if (runScripts) {
      runPreScript(request.scripts.pre, env);
    }
  } catch (error) {
    return {
      name: request.name,
      fileName,
      iteration,
      result: {
        ok: false,
        timeMs: 0,
        sizeBytes: 0,
        headers: [],
        body: "",
        error: `Pre-script: ${error instanceof Error ? error.message : String(error)}`,
      },
      tests: [],
      scriptsRan: runScripts,
    };
  }
  const result = await sendRequest(
    prepareRequest(request, {
      defaultHeaders: store.readDefaultHeaders(),
      collectionHeaders: store.readCollectionHeaders(collection),
      collectionAuth: store.readCollectionAuth(collection),
    }),
    env
  );
  let tests: TestResult[] = [];
  try {
    if (runScripts) {
      tests = runPostScript(request.scripts.post, env, result);
    }
  } catch (error) {
    tests = [
      {
        name: "post-script",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  return { name: request.name, fileName, iteration, result, tests, scriptsRan: runScripts };
}
