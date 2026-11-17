import { createRegistry } from "../core/registry.js";
import { metro } from "./metro/index.js";
import { skirmish } from "./skirmish/index.js";
export const problemRegistry = createRegistry([metro, skirmish], "problem");
export function problemMetadata(problem) {
  const {
    id,
    name,
    shortName,
    description,
    view,
    timeUnit,
    stepSize,
    defaultScenario,
    metrics,
    scenarios,
  } = problem;
  return {
    id,
    name,
    shortName,
    description,
    view,
    timeUnit,
    stepSize,
    defaultScenario,
    metrics,
    scenarios: scenarios.map((s) => ({
      ...s,
      capabilities: problem.capabilities(s.id),
      settings: problem.settings?.(s.id) ?? [],
    })),
  };
}
