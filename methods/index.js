import { createRegistry } from "../core/registry.js";
import { searchMethods } from "./search.js";
import { nativeMethods } from "./native.js";
import { baselineMethods } from "./baselines.js";
export const methodRegistry = createRegistry(
  [...searchMethods, ...baselineMethods, ...nativeMethods],
  "method",
);
