import { createState, step, metrics, demandSchedule } from "./simulation.js";
import { compilePlan } from "./network.js";
export const OBJECTIVE = {
  delivered: 10,
  averageQueue: -1.2,
  overflow: -2,
  track: -0.12,
};
export function serviceScore(m, weights = OBJECTIVE) {
  return (
    m.delivered * weights.delivered +
    m.averageQueue * weights.averageQueue +
    m.overflow * weights.overflow +
    m.track * weights.track
  );
}
export const OBJECTIVES = {
  service: { name: "Service first", editWeight: 0 },
  balanced: { name: "Balanced", editWeight: 3 },
  effort: { name: "Low disruption", editWeight: 12 },
};
export function isPareto(result, results) {
  return !results.some(
    (other) =>
      other !== result &&
      other.metrics.delivered >= result.metrics.delivered &&
      other.metrics.editUnits <= result.metrics.editUnits &&
      (other.metrics.delivered > result.metrics.delivered ||
        other.metrics.editUnits < result.metrics.editUnits),
  );
}
export function createProblem(
  scenario,
  { seed = scenario.seed, horizon = 180 } = {},
) {
  return {
    version: "transit-planning-v2",
    scenario: structuredClone(scenario),
    seed,
    horizon,
    weights: { ...OBJECTIVE },
    schedule: demandSchedule(scenario, horizon, seed),
  };
}
export function evaluatePlan(problem, plan) {
  const valid = compilePlan(problem.scenario, plan);
  if (!valid.valid)
    return { valid: false, score: -Infinity, errors: valid.errors };
  const state = createState(problem.scenario, plan, {
    schedule: problem.schedule,
    horizon: problem.horizon,
    seed: problem.seed,
  });
  step(state, problem.horizon, { stopOnFailure: false });
  const m = metrics(state),
    w = problem.weights;
  const score = serviceScore(m, w);
  return { valid: true, score: Math.round(score * 100) / 100, ...m };
}
