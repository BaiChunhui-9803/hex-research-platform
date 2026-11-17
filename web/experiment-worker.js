import { runExperiment } from "../core/experiment.js";
import { methodRegistry } from "../methods/index.js";
import { problemRegistry } from "../problems/index.js";

self.onmessage = ({ data: input }) => {
  try {
    const report = runExperiment(input, problemRegistry, methodRegistry, {
      progress: (progress) => self.postMessage({ type: "progress", progress }),
    });
    self.postMessage({ type: "done", report });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
