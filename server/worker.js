import { parentPort, workerData } from "node:worker_threads";
import { runExperiment } from "../core/experiment.js";
import { problemRegistry } from "../problems/index.js";
import { methodRegistry } from "../methods/index.js";
try {
  const report = runExperiment(workerData, problemRegistry, methodRegistry, {
    progress: (progress) =>
      parentPort.postMessage({ type: "progress", ...progress }),
  });
  parentPort.postMessage({ type: "done", report });
} catch (error) {
  parentPort.postMessage({ type: "error", message: error.message });
}
