import { createRegistry } from "../core/registry.js";
import { metro } from "./metro/index.js";
import { skirmish } from "./skirmish/index.js";
import { fusion } from "./fusion/index.js";
export const problemRegistry = createRegistry([metro, skirmish, fusion], "problem");
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
    sourceProblems,
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
    ...(sourceProblems ? { sourceProblems } : {}),
    scenarios: scenarios.map((s) => ({
      ...s,
      capabilities: problem.capabilities(s.id),
      settings: problem.settings?.(s.id) ?? [],
      ...(problem.featureTable ? { featureTable: problem.featureTable(problem.validateConfig({ scenarioId: s.id })) } : {}),
    })),
  };
}
