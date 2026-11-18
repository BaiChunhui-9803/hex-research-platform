import { parentPort, workerData } from "node:worker_threads";
import { assessDifficulty } from "../core/difficulty.js";
import { methodRegistry } from "../methods/index.js";
import { problemRegistry } from "../problems/index.js";

try {
  const report = assessDifficulty(workerData, problemRegistry, methodRegistry);
  parentPort.postMessage({ report });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
