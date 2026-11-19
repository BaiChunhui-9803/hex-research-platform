import { difficultySpace } from "../../core/difficulty-space.js";
import { assessDifficulty, prepareDifficultyEnvironment } from "../../core/difficulty.js";
import { addFrozenDifficulty } from "../../core/frozen-difficulty.js";
import { methodRegistry } from "../../methods/index.js";
import { problemRegistry } from "../../problems/index.js";
import { pressureCells } from "../../problems/fusion/spatial-rules.js";
import { distance, key } from "../../engines/skirmish/shared/hex.js";
import { configForScope } from "./data.js";

function metroMap(state) {
  return {
    map: state.scenario.map,
    stations: Object.values(state.stations).map(({ q, r, shape, active, name }) =>
      ({ q, r, shape, active, name })),
    tracks: Object.entries(state.network.paths).flatMap(([line, segments]) =>
      segments.map(({ cells }) => ({ line, cells }))),
    trackUsed: state.network.trackUsed,
    trackBudget: state.scenario.resources.trackBudget,
    demandMultiplier: state.scenario.demandMultiplier,
  };
}

function squadMap(state, team) {
  return {
    map: state.scenario.map,
    team,
    units: state.units.filter(({ hp }) => hp > 0).map(({ team, type, q, r }) =>
      ({ team, type, q, r })),
  };
}

function createPreview(problem, state, config) {
  if (problem.id === "metro") return { boards: [metroMap(state)] };
  if (problem.id === "skirmish") return { boards: [squadMap(state, config.team)] };
  const { components, links } = state;
  const rail = metroMap(components.metro.renderState);
  const squad = squadMap(components.skirmish.renderState, config.skirmishTeam);
  if (!links.spatial) return { boards: [rail, squad], links };

  const { stationRadius, pressureRadius } = links.spatial;
  const affected = links.holdsEnabled ? pressureCells(squad.units, squad.team, pressureRadius) : new Set();
  const stations = rail.stations.filter(({ active }) => active);
  return {
    links,
    boards: [{
      ...rail,
      ...squad,
      tracks: rail.tracks.map((track) => ({
        ...track, affected: track.cells.some((cell) => affected.has(key(cell))),
      })),
      units: squad.units.map((unit) => ({
        ...unit, inRange: links.supplyEnabled && unit.team === squad.team &&
          stations.some((station) => distance(unit, station) <= stationRadius),
      })),
    }],
  };
}

function describe(item, request, cache, selected) {
  const problem = problemRegistry.get(item.problemId);
  const env = prepareDifficultyEnvironment(problem, item.config, item.checkpoint);
  const space = difficultySpace(problem, env, request.gridLevels, cache, () => {});
  const task = env.done() || (item.config.ruleMode === "features" && !env.decisionDue("search", null))
    ? null : env.createVectorTask();
  const state = env.renderState();
  return {
    id: item.id, label: item.label, selected, finished: env.done(),
    space: { ...space, dimensions: task?.dimension ?? null, encoding: task?.encoding ?? null },
    checkpoint: env.tick(), time: env.time(), timeUnit: problem.timeUnit,
    preview: createPreview(problem, state, item.config),
  };
}

function originalProblems(fusion, config, checkpoint) {
  const children = fusion.components(config);
  const battleTick = Math.floor(Math.max(0, checkpoint - config.prepMinutes) *
    children.skirmish.horizon * 10 / (config.metroHorizon - config.prepMinutes));
  return [
    { id: "metro", problemId: "metro", label: "Metro input", config: children.metro, checkpoint },
    { id: "skirmish", problemId: "skirmish", label: "Squad input", config: children.skirmish, checkpoint: battleTick },
  ];
}

const control = (config) => ({ ...config, coupling: "none" });
const linked = (config) => ({ ...config, coupling: config.coupling === "none" ? "both" : config.coupling });

function displayCases(problem, config, checkpoint) {
  if (problem.id !== "fusion")
    return [{ id: problem.id, problemId: problem.id, label: problem.name, config, checkpoint }];
  return [
    ...originalProblems(problem, config, checkpoint),
    { id: "off", problemId: "fusion", label: "Same layout · uncoupled", config: control(config), checkpoint },
    { id: "on", problemId: "fusion", label: "Same layout · linked", config: linked(config), checkpoint },
  ];
}

async function probeCases(problem, config, seed, request) {
  const catalog = fetch(new URL("../../core/frozen-difficulty-data.json", import.meta.url))
    .then((res) => res.ok ? res.json() : null).catch(() => null);
  // Pilot candidates are resolved once at setup. The layout-adaptive mode resolves
  // against each run's seeded opening geometry.
  const cases = [
    ...(problem.id === "fusion" ? originalProblems(problem, config, request.checkpoint) : []),
    { problemId: problem.id, label: problem.name, config: problem.id === "fusion" ? linked(config) : config,
      checkpoint: request.checkpoint },
  ];
  const seeds = [...new Set([seed, 28, 30, 26])].slice(0, 3);
  const started = performance.now();
  const reports = cases.map((item, index) => ({
    label: item.label,
    report: assessDifficulty({ ...request, ...item, seeds }, problemRegistry, methodRegistry, {
      limitMs: 55000,
      check: () => {
        if (performance.now() - started > 55000)
          throw new Error("The assessment reached its time limit. Reduce evaluations per probe and try again.");
      },
      progress: ({ done }) => self.postMessage({ type: "progress", progress: {
        done: index * seeds.length + done, total: cases.length * seeds.length,
      } }),
    }),
  }));
  const frozen = await catalog;
  return reports.map(({ label, report }) => ({ label, report: addFrozenDifficulty(report, frozen) }));
}

self.onmessage = async ({ data: { scope, type, seed, request } }) => {
  try {
    const problem = problemRegistry.get(scope.problem);
    const config = problem.validateConfig(configForScope(scope, seed));
    if (type === "probes") {
      self.postMessage({ type: "probes", reports: await probeCases(problem, config, seed, request) });
      return;
    }
    const cache = new Map();
    const selected = config.coupling === "none" ? "off" : "on";
    const rows = displayCases(problem, config, request.checkpoint).map((item) =>
      describe(item, request, cache, item.id === selected || problem.id !== "fusion"));
    self.postMessage({ type: "structure", rows });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
