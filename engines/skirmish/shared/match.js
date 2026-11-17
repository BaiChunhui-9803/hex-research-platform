import {
  createBattle,
  stepBattle,
  issueCommand,
  living,
  battleMetrics,
} from "./battle.js";
import { observe } from "./observation.js";
import { teamRandom } from "./rng.js";
import { policyById } from "../policies/registry.js";

export const DECISION_TICKS = 5;
export function stepMatch(state, steps = 1) {
  if (!Number.isInteger(steps) || steps < 0)
    throw new Error("Steps must be a non-negative integer");
  for (let i = 0; i < steps && state.phase !== "finished"; i++) {
    for (const team of state.scenario.teams) {
      const id = state.controllers[team.id];
      if (
        id === "human" ||
        !living(state, team.id).length ||
        state.tick < state.nextDecision[team.id]
      )
        continue;
      const policy = policyById(id);
      if (!policy) throw new Error(`Unknown policy: ${id}`);
      state.nextDecision[team.id] = state.tick + DECISION_TICKS;
      const observation = observe(state, team.id),
        commands = policy.decide(observation, {
          random: () => teamRandom(state, team.id),
        });
      for (const command of commands)
        issueCommand(state, { ...command, team: team.id }, { source: "ai" });
    }
    stepBattle(state);
  }
  return state;
}
export function evaluateMatch(
  scenario,
  { policy = "focus", opponent = "focus", record = false } = {},
) {
  const controllers = Object.fromEntries(
    scenario.teams.map((team) => [
      team.id,
      team.id === "blue" ? policy : opponent,
    ]),
  );
  const state = createBattle(scenario, { record, controllers }),
    start = performance.now();
  while (state.phase !== "finished") stepMatch(state);
  return {
    policy,
    opponent,
    seed: scenario.seed,
    metrics: battleMetrics(state, "blue"),
    elapsedMs: Math.round(performance.now() - start),
    finalUnits: state.units.map(({ id, team, type, q, r, hp, kills }) => ({
      id,
      team,
      type,
      q,
      r,
      hp,
      kills,
    })),
    ...(record ? { commands: state.commandLog, events: state.events } : {}),
  };
}
