import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { assessDifficulty } from "../core/difficulty.js";
import { addFrozenDifficulty } from "../core/frozen-difficulty.js";
import { methodRegistry } from "../methods/index.js";
import { problemRegistry } from "../problems/index.js";

try {
  const report = assessDifficulty(workerData, problemRegistry, methodRegistry);
  const catalog = await readFile(new URL("../core/frozen-difficulty-data.json", import.meta.url), "utf8")
    .then(JSON.parse).catch(() => null);
  parentPort.postMessage({ report: addFrozenDifficulty(report, catalog) });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
