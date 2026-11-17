import { scenarioAt } from "../shared/scenarios.js";
import {
  createState,
  demandSchedule,
  step,
  metrics,
  applyPlan,
} from "../shared/simulation.js";
import { planChange } from "../shared/edit-cost.js";
import { compilePlan } from "../shared/network.js";
import { OBJECTIVES, serviceScore } from "../shared/problem.js";
import { distance } from "../shared/hex.js";
import { random } from "../shared/rng.js";
import { greedyPlan } from "./greedy.js";
import { mutate } from "./operators.js";

export const policies = [
  {
    id: "fixed",
    name: "Keep initial network",
    description:
      "Build the common initial network and never edit it. A zero-edit reference.",
    decide: (observation) => observation.plan,
  },
  {
    id: "growth-greedy",
    name: "Greedy extensions",
    description:
      "When stations open, insert unconnected stops with the smallest extra route length.",
    decide: (observation, options) =>
      options.opened ? extensionPlan(observation) : observation.plan,
  },
  {
    id: "replan",
    name: "Rebuild and search",
    description:
      "Rebuild from a greedy plan every 30 minutes or when stations open, then search using a short demand forecast.",
    decide: (observation, options, context) =>
      searchDecision(observation, { ...options, rebuild: true }, context),
  },
  {
    id: "repair",
    name: "Budgeted local repair",
    description:
      "Keep the current plan as a warm start. Test small repairs, with at most 12 edit units per decision.",
    maxChange: 12,
    decide: (observation, options, context) =>
      searchDecision(observation, options, context),
  },
];
export const policyById = (id) => policies.find((p) => p.id === id);
export const policyMetadata = () =>
  policies.map(({ id, name, description }) => ({ id, name, description }));

function searchDecision(observation, options, context) {
  let best = observation.plan,
    score = context.evaluate(best).score;
  const start = options.rebuild
    ? greedyPlan({ scenario: observation.scenario })
    : extensionPlan(observation, options.maxChange);
  const startScore = context.evaluate(start);
  if (startScore.valid && startScore.score > score) {
    best = start;
    score = startScore.score;
  }
  let current = options.rebuild && startScore.valid ? start : best;
  for (let i = 0; i < options.iterations && !context.shouldStop(); i++) {
    const proposal = mutate(
      current,
      { scenario: observation.scenario },
      context.random,
    );
    const result = context.evaluate(proposal);
    if (result.valid && result.score > score) {
      best = proposal;
      score = result.score;
      current = proposal;
    }
  }
  return best;
}

/** The policy sees no future stations, future events or evaluation demand seed. */
export function observeState(state) {
  const scenario = structuredClone(scenarioAt(state.scenario, state.time));
  delete scenario.seed;
  return {
    time: state.time,
    scenario,
    plan: structuredClone(state.plan),
    queues: Object.values(state.stations)
      .filter((s) => s.active)
      .map((s) => ({ id: s.id, passengers: structuredClone(s.queue) })),
    metrics: metrics(state),
    remainingEditBudget:
      state.editBudget === null
        ? Infinity
        : state.editBudget - state.editStats.editUnits,
  };
}

export function extensionPlan(observation, maxUnits = Infinity) {
  const { scenario } = observation;
  const byId = Object.fromEntries(scenario.stations.map((s) => [s.id, s]));
  let plan = structuredClone(observation.plan);
  const connected = new Set(
    plan.lines.filter((l) => l.stops.length >= 2).flatMap((l) => l.stops),
  );
  const remaining = scenario.stations.filter((s) => !connected.has(s.id));
  for (const station of remaining) {
    let best = null;
    for (let li = 0; li < plan.lines.length; li++) {
      const stops = plan.lines[li].stops;
      if (stops.length >= scenario.resources.maxStopsPerLine) continue;
      for (let at = 0; at <= stops.length; at++) {
        const before = byId[stops[at - 1]],
          after = byId[stops[at]];
        const length =
          (before ? distance(before, station) : 0) +
          (after ? distance(station, after) : 0) -
          (before && after ? distance(before, after) : 0);
        const candidate = structuredClone(plan);
        candidate.lines[li].stops.splice(at, 0, station.id);
        const effort = planChange(observation.plan, candidate).editUnits;
        if (effort > Math.min(maxUnits, observation.remainingEditBudget))
          continue;
        if (
          (!best || length < best.length) &&
          compilePlan(scenario, candidate).valid
        )
          best = { plan: candidate, length };
      }
    }
    if (best) plan = best.plan;
  }
  return plan;
}

/** A forecast uses only currently open stations and a separate random stream. */
function forecastEvaluator(state, observation, options, onEvaluation) {
  const cache = new Map();
  const lookahead = Math.min(30, options.horizon - state.time);
  const forecastSchedule = demandSchedule(
    observation.scenario,
    lookahead,
    (options.seed ^ state.time ^ 0x6fe21d) >>> 0,
  ).map((event) => ({ ...event, t: event.t + state.time }));
  return (plan) => {
    const key = JSON.stringify(plan);
    if (cache.has(key)) return cache.get(key);
    const change = planChange(observation.plan, plan);
    if (
      change.editUnits > observation.remainingEditBudget ||
      change.editUnits > (options.maxChange ?? Infinity)
    )
      return { valid: false, score: -Infinity };
    if (!compilePlan(observation.scenario, plan).valid)
      return { valid: false, score: -Infinity };
    const simulated = structuredClone(state);
    simulated.scenario = observation.scenario;
    simulated.stations = Object.fromEntries(
      Object.entries(simulated.stations).filter(([, s]) => s.active),
    );
    simulated.schedule = forecastSchedule;
    simulated.eventIndex = 0;
    simulated.horizon = state.time + lookahead;
    simulated.finished = false;
    applyPlan(simulated, plan, { charge: true, reason: "Forecast candidate" });
    step(simulated, lookahead, { stopOnFailure: false });
    const projected = metrics(simulated);
    projected.delivered -= state.delivered;
    projected.averageQueue =
      (simulated.queueExposure - state.queueExposure) / Math.max(1, lookahead);
    projected.overflow -= state.overflowExposure;
    const result = {
      valid: true,
      score:
        serviceScore(projected) -
        OBJECTIVES[options.objective].editWeight * change.editUnits,
    };
    cache.set(key, result);
    onEvaluation();
    return result;
  };
}

export function runAdaptive(scenario, config, hooks = {}) {
  const options = {
    seed: scenario.seed,
    horizon: 180,
    iterations: 100,
    editBudget: 60,
    objective: "balanced",
    ...config,
  };
  const policy = policyById(options.policyId);
  if (!policy || !Object.hasOwn(OBJECTIVES, options.objective))
    throw new Error("Unknown adaptive policy or objective");
  const started = performance.now();
  const initialPlan = greedyPlan({ scenario: scenarioAt(scenario, 0) });
  const state = createState(scenario, initialPlan, {
    horizon: options.horizon,
    seed: options.seed,
    editBudget: options.editBudget,
  });
  const rng = random(
    options.seed ^ [...policy.id].reduce((n, c) => n + c.charCodeAt(0), 0),
  );
  const timeline = [{ time: 0, ...metrics(state) }];
  let activeCount = metrics(state).activeStations,
    evaluations = 0,
    stoppedEarly = false;
  while (state.time < options.horizon) {
    step(state, 1, { stopOnFailure: false });
    const count = metrics(state).activeStations;
    const opened = count > activeCount;
    activeCount = count;
    const decisionTime =
      state.time < options.horizon && (opened || state.time % 30 === 0);
    if (decisionTime) {
      const observation = observeState(state);
      const maxChange = policy.maxChange ?? Infinity;
      const evaluate = forecastEvaluator(
        state,
        observation,
        { ...options, maxChange },
        () => evaluations++,
      );
      const shouldStop = () => {
        const stop = Boolean(hooks.shouldStop?.());
        if (stop) stoppedEarly = true;
        return stop;
      };
      const candidate = shouldStop()
        ? observation.plan
        : policy.decide(
            observation,
            {
              iterations: options.iterations,
              objective: options.objective,
              horizon: options.horizon,
              opened,
              maxChange,
            },
            { evaluate, random: rng, shouldStop },
          );
      if (planChange(state.plan, candidate).editUnits > maxChange)
        throw new Error("Policy exceeded its per-decision edit limit");
      if (planChange(state.plan, candidate).editUnits > 0)
        applyPlan(state, candidate, {
          charge: true,
          reason: opened ? "New stations opened" : "Scheduled review",
        });
    }
    if (state.time % 30 === 0 || opened || state.time === options.horizon) {
      timeline.push({ time: state.time, ...metrics(state) });
      hooks.progress?.(
        state.time / options.horizon,
        `${policy.name} · minute ${state.time}/${options.horizon}`,
      );
    }
  }
  const m = metrics(state);
  m.serviceScore = Math.round(serviceScore(m) * 100) / 100;
  m.score =
    Math.round(
      (m.serviceScore -
        OBJECTIVES[options.objective].editWeight * m.editUnits) *
        100,
    ) / 100;
  m.valid = true;
  return {
    id: policy.id,
    name: policy.name,
    kind: "adaptive",
    initialPlan,
    plan: structuredClone(state.plan),
    changes: state.editHistory,
    timeline,
    metrics: m,
    evaluations,
    elapsedMs: Math.round(performance.now() - started),
    stoppedEarly,
  };
}
