import { assessDifficulty } from "../core/difficulty.js";
import { methodRegistry } from "../methods/index.js";
import { problemRegistry } from "../problems/index.js";
import { addFrozenDifficulty } from "../core/frozen-difficulty.js";

self.onmessage = async ({ data: input }) => {
  const catalog = fetch(new URL("../core/frozen-difficulty-data.json", import.meta.url))
    .then((res) => res.ok ? res.json() : null).catch(() => null);
  try {
    const report = assessDifficulty(input, problemRegistry, methodRegistry, {
      progress: (progress) => self.postMessage({ type: "progress", progress }),
    });
    self.postMessage({ type: "done", report: addFrozenDifficulty(report, await catalog) });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
