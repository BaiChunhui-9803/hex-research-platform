import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { runExperiment } from "../core/experiment.js";
import { problemRegistry } from "../problems/index.js";
import { methodRegistry } from "../methods/index.js";

const root = new URL("../", import.meta.url);
const output = new URL("web/archive/", root);
const legacy = new URL("../hex-skirmish-lab/experiments/2026-11-15-validation/", root);
const load = async (url) => JSON.parse(await readFile(url, "utf8"));
const save = (name, data) => writeFile(new URL(name, output), JSON.stringify(data) + "\n", "utf8");
const sources = {
  evolutionary: { name: "Evolutionary baseline", source: "Held-out platform experiments", budgetUnit: "candidate evaluations per plan" },
  fusion: { name: "Dual-map fusion validation", source: "Recorded platform runs", budgetUnit: "candidate evaluations per plan" },
  shared: { name: "Paired layout archive", source: "Matched seed and horizon across layouts", budgetUnit: "candidate evaluations per plan" },
  "simple-metro": { name: "Simple-track metro benchmark", source: "Matched seeds and planning budget", budgetUnit: "candidate evaluations per plan" },
  "simple-fusion": { name: "Simple-track fusion pairs", source: "Matched seed and horizon across layouts", budgetUnit: "candidate evaluations per plan" },
  legacy: { name: "Squad validation · 2026-11-15", source: "Archived faction perspectives", budgetUnit: "native decisions" },
};

function metricsFor(problemId, m) {
  if (problemId === "metro") return {
    completion: m.completion, delivered: m.delivered, track: m.track, score: m.score,
  };
  if (problemId === "skirmish") return {
    win: m.win, draw: Number(m.draw), survival: m.hpRatio, hpMargin: m.hpMargin,
    time: m.time, score: m.score, orders: m.orders,
  };
  return {
    score: m.score, completion: m["metro.completion"], delivered: m["metro.delivered"],
    win: m["skirmish.win"], survival: m["skirmish.hpRatio"], track: m["metro.track"],
    supply: m.supportUsed, delay: m.heldTrainMinutes ?? null, holdMinutes: m.heldMinutes,
  };
}

const cohorts = new Map();
const rows = [];
function insert(source, row) {
  const { seed, ...settings } = row.config;
  const serialized = Object.entries(settings).sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([source, row.problemId, row.budget, row.population ?? 0, serialized]);
  if (!cohorts.has(key)) {
    cohorts.set(key, {
      id: createHash("sha256").update(key).digest("hex").slice(0, 16),
      problemId: row.problemId, scenarioId: row.config.scenarioId,
      config: settings, source, budget: row.budget, population: row.population ?? 0,
    });
  }
  rows.push({
    id: `r${rows.length}`, cohort: cohorts.get(key).id, seed,
    method: row.method, metrics: row.metrics, recording: row.recording,
  });
}

await mkdir(new URL("legacy/", output), { recursive: true });
for (const [source, path] of [
  ["evolutionary", "experiments/2026-11-15-evolutionary-baselines/metro.json"],
  ["evolutionary", "experiments/2026-11-15-evolutionary-baselines/skirmish.json"],
  ["fusion", "experiments/fusion-validation/methods.json"],
]) {
  const data = await load(new URL(path, root));
  data.results.forEach((row, index) => insert(source, {
    problemId: row.problemId, config: row.config, method: row.methodId,
    budget: row.replay.options.evaluations, population: row.replay.options.populationSize,
    metrics: metricsFor(row.problemId, row.metrics), recording: { type: "result", path, index },
  }));
}

const validation = await load(new URL("dataset.json", legacy));
const perspectives = await load(new URL("perspectives.json", legacy));
const traces = new Map(validation.traceIndex.map((entry) => [entry.id, entry]));
for (const trace of traces.values()) {
  await copyFile(new URL(trace.file, legacy), new URL(`legacy/${trace.id}.json.gz`, output));
}
for (const row of perspectives) {
  const trace = traces.get(row.battleId);
  insert("legacy", {
    problemId: "skirmish", config: {
      scenarioId: row.scenarioId, seed: row.seed, team: row.focal,
      opponent: row.opponent, horizon: validation.protocol.maxSeconds,
    },
    method: `squad.${row.policy}`, budget: null,
    metrics: {
      win: Number(row.won), draw: Number(row.draw), survival: row.hpRatio, hpMargin: row.hpMargin,
      time: row.time, orders: row.orders, survivalTime: row.survivalSeconds,
    },
    recording: trace ? { type: "legacy", path: `web/archive/legacy/${trace.id}.json.gz`, team: row.focal } : null,
  });
}

const sharedCases = ["compact--contact", "lumen--contact", "lumen--mixed", "growth--triad", "growth-rush--asymmetric"];
const reuse = process.argv.includes("--reuse-paired");
const fusion = problemRegistry.get("fusion");
function insertBundle(source, path, batch) {
  batch.forEach((recording, index) => insert(source, {
    problemId: recording.problemId, config: recording.config, method: recording.methodId,
    budget: recording.options.evaluations, population: recording.options.populationSize,
    metrics: metricsFor(recording.problemId, recording.finalMetrics),
    recording: { type: "bundle", path, index },
  }));
}
const metroPath = "web/archive/simple-metro.json";
insertBundle("simple-metro", metroPath, await load(new URL(metroPath, root)));
for (const scenario of sharedCases) {
  const archived = `web/archive/paired-${scenario}.json`;
  insertBundle("shared", archived, await load(new URL(archived, root)));
}
for (const scenario of sharedCases) {
  const path = `web/archive/simple-paired-${scenario}.json`;
  const previous = reuse ? await load(new URL(path, root)).catch(() => []) : [];
  const replays = [];
  for (const config of [
    { coupling: "both" }, { coupling: "none" },
    { layout: "shared", spatialVariant: "auto", coupling: "none" },
    { layout: "shared", spatialVariant: "auto", coupling: "both" },
  ]) {
    for (const seed of [28, 30]) {
      const validated = fusion.validateConfig({ ...config, scenarioId: scenario, metroHorizon: 180, skirmishHorizon: 60, seed });
      for (const method of ["constructive", "annealing", "nsga2"]) {
        const recording = previous.find((row) => row.methodId === method &&
          row.options.evaluations === 12 && isDeepStrictEqual(row.config, validated)) ??
          runExperiment({
            problemId: "fusion", scenarioId: scenario, seeds: [seed], methodIds: [method],
            evaluations: 12, config: validated,
          }, problemRegistry, methodRegistry).results[0].replay;
        replays.push(recording);
      }
    }
  }
  await save(`simple-paired-${scenario}.json`, replays);
  insertBundle("simple-fusion", path, replays);
  console.log(`Archived ${replays.length} simple-track paired recordings: ${scenario}`);
}

await save("catalog.json", {
  version: "hex-portal-archive/v1", sources, cohorts: [...cohorts.values()], rows,
});
console.log(`${rows.length} results, ${cohorts.size} cohorts and ${traces.size} legacy recordings`);
