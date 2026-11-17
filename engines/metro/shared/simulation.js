import { compilePlan, buildRouting } from "./network.js";
import { random, pick } from "./rng.js";
import { SHAPES, scenarioAt } from "./scenarios.js";
import {
  canonicalStops,
  planChange,
  emptyEditStats,
  totalEditStats,
} from "./edit-cost.js";

export function demandSchedule(scenario, horizon = 1440, seed = scenario.seed) {
  const rng = random(seed ^ 0xbad5eed),
    events = [];
  for (let t = 1; t <= horizon; t++) {
    const rate = 0.045 * scenario.demandMultiplier * (t % 180 > 110 ? 1.35 : 1);
    for (const s of scenario.stations)
      if (rng() < rate * s.demand && t >= (s.opensAt ?? 0))
        events.push({
          t,
          source: s.id,
          shape: pick(
            SHAPES.filter((x) => x !== s.shape),
            rng,
          ),
        });
  }
  return events;
}
export function createState(scenario, plan, options = {}) {
  const schedule =
    options.schedule ??
    demandSchedule(
      scenario,
      options.horizon ?? scenario.horizon ?? 1440,
      options.seed ?? scenario.seed,
    );
  const state = {
    scenario,
    time: 0,
    plan: null,
    network: null,
    routing: null,
    stations: Object.fromEntries(
      scenario.stations.map((s) => [
        s.id,
        { ...s, active: (s.opensAt ?? 0) <= 0, queue: [] },
      ]),
    ),
    trains: [],
    schedule,
    eventIndex: 0,
    nextPassengerId: 1,
    delivered: 0,
    spawned: 0,
    totalJourney: 0,
    queueExposure: 0,
    overflowExposure: 0,
    peakQueue: 0,
    score: 0,
    failed: false,
    finished: false,
    warning: null,
    editStats: emptyEditStats(),
    editBudget: options.editBudget ?? scenario.editBudget ?? null,
    editHistory: [],
    firstOverload: null,
    horizon: options.horizon ?? scenario.horizon ?? 1440,
  };
  applyPlan(state, plan);
  return state;
}
/** Live edits retain every passenger and its original spawn time. */
export function applyPlan(
  state,
  plan,
  { charge = state.time > 0, reason = "Network edit" } = {},
) {
  const available = scenarioAt(state.scenario, state.time);
  const network = compilePlan(available, plan);
  if (!network.valid) throw new Error(network.errors.join("; "));
  const change = state.plan ? planChange(state.plan, plan) : emptyEditStats();
  if (state.plan && change.editUnits === 0) return state;
  if (
    charge &&
    state.editBudget !== null &&
    state.editStats.editUnits + change.editUnits > state.editBudget
  )
    throw new Error(
      `Edit budget exceeded: ${state.editStats.editUnits + change.editUnits}/${state.editBudget} units`,
    );
  const changed = new Set(
    plan.lines
      .filter(
        (line) =>
          !state.plan ||
          canonicalStops(line.stops) !==
            canonicalStops(
              state.plan.lines.find((x) => x.id === line.id)?.stops ?? [],
            ),
      )
      .map((line) => line.id),
  );
  const kept = state.trains.filter((train) => !changed.has(train.line));
  for (const train of state.trains.filter((train) => changed.has(train.line)))
    for (const p of train.passengers) state.stations[train.from].queue.push(p);
  // Preserve the orientation and exact vehicle state of unmodified lines.
  const nextPlan = structuredClone(plan);
  if (state.plan)
    for (const line of nextPlan.lines)
      if (!changed.has(line.id))
        line.stops = [...state.plan.lines.find((x) => x.id === line.id).stops];
  state.plan = nextPlan;
  state.network = network;
  // Recompile in the preserved orientation, so paths match retained vehicles.
  state.network = compilePlan(available, nextPlan);
  state.routing = buildRouting(available, state.network);
  state.trains = [
    ...kept,
    ...nextPlan.lines
      .filter((l) => changed.has(l.id) && l.stops.length >= 2)
      .map((l) => ({
        line: l.id,
        index: 0,
        direction: 1,
        from: l.stops[0],
        to: l.stops[1],
        progress: 0,
        dwell: 1,
        passengers: [],
      })),
  ].sort((a, b) => a.line.localeCompare(b.line));
  if (charge && change.editUnits > 0) {
    state.editStats = totalEditStats(state.editStats, change);
    state.editHistory.push({
      time: state.time,
      reason,
      change,
      plan: structuredClone(state.plan),
    });
  }
  return state;
}
function serve(state, train) {
  const station = state.stations[train.from],
    onboard = [];
  for (const p of train.passengers) {
    if (p.shape === station.shape) {
      state.delivered++;
      state.totalJourney += state.time - p.created;
      state.score += 10;
      continue;
    }
    const route = state.routing[`${station.id}/${p.shape}`];
    if (route && route.line === train.line && route.to === train.to)
      onboard.push(p);
    else station.queue.push(p);
  }
  train.passengers = onboard;
  const waiting = [];
  for (const p of station.queue) {
    const route = state.routing[`${station.id}/${p.shape}`];
    if (
      train.passengers.length < state.scenario.resources.trainCapacity &&
      route?.line === train.line &&
      route.to === train.to
    )
      train.passengers.push(p);
    else waiting.push(p);
  }
  station.queue = waiting;
}
export function step(state, minutes = 1, { stopOnFailure = true } = {}) {
  for (let tick = 0; tick < minutes; tick++) {
    if (state.finished || (stopOnFailure && state.failed)) break;
    state.time++;
    let opened = false;
    for (const s of Object.values(state.stations)) {
      if (!s.active && state.time >= (s.opensAt ?? 0)) {
        s.active = true;
        opened = true;
      }
    }
    if (opened) {
      const available = scenarioAt(state.scenario, state.time);
      state.network = compilePlan(available, state.plan);
      state.routing = buildRouting(available, state.network);
    }
    while (
      state.eventIndex < state.schedule.length &&
      state.schedule[state.eventIndex].t <= state.time
    ) {
      const e = state.schedule[state.eventIndex++];
      state.stations[e.source].queue.push({
        id: state.nextPassengerId++,
        shape: e.shape,
        created: e.t,
      });
      state.spawned++;
    }
    for (const train of state.trains) {
      const line = state.plan.lines.find((l) => l.id === train.line),
        segments = state.network.paths[train.line];
      if (train.dwell > 0) {
        serve(state, train);
        train.dwell--;
        continue;
      }
      const segment =
        segments[train.direction === 1 ? train.index : train.index - 1];
      train.progress += 1 / Math.max(1, segment.duration);
      if (train.progress < 1) continue;
      train.index += train.direction;
      train.from = line.stops[train.index];
      if (train.index === line.stops.length - 1 || train.index === 0)
        train.direction *= -1;
      train.to = line.stops[train.index + train.direction];
      train.progress = 0;
      train.dwell = state.scenario.resources.dwellMinutes;
      serve(state, train);
    }
    let largest = null;
    for (const s of Object.values(state.stations)) {
      state.queueExposure += s.queue.length;
      state.overflowExposure += Math.max(
        0,
        s.queue.length - state.scenario.resources.platformCapacity,
      );
      if (!largest || s.queue.length > largest.queue.length) largest = s;
    }
    state.peakQueue = Math.max(state.peakQueue, largest?.queue.length ?? 0);
    state.warning = largest?.queue.length >= 14 ? largest.id : null;
    if (
      largest?.queue.length >=
      state.scenario.resources.platformCapacity + 8
    ) {
      state.failed = true;
      state.firstOverload ??= state.time;
    }
    if (state.time >= state.horizon) state.finished = true;
  }
  return state;
}
export function metrics(state) {
  const waiting = Object.values(state.stations).reduce(
      (n, s) => n + s.queue.length,
      0,
    ),
    riding = state.trains.reduce((n, t) => n + t.passengers.length, 0);
  return {
    delivered: state.delivered,
    spawned: state.spawned,
    waiting,
    riding,
    completion: state.spawned ? state.delivered / state.spawned : 0,
    meanJourney: state.delivered ? state.totalJourney / state.delivered : 0,
    averageQueue: state.time ? state.queueExposure / state.time : 0,
    overflow: state.overflowExposure,
    track: state.network.trackUsed,
    peakQueue: state.peakQueue,
    remaining: waiting + riding,
    activeStations: Object.values(state.stations).filter((s) => s.active)
      .length,
    connectedStations: new Set(
      state.plan.lines
        .filter((line) => line.stops.length >= 2)
        .flatMap((line) => line.stops),
    ).size,
    firstOverload: state.firstOverload,
    ...state.editStats,
  };
}
