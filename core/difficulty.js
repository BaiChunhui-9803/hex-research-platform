import { integer, random } from "./random.js";
import { difficultySpace } from "./difficulty-space.js";

export const DIFFICULTY_VERSION = "hex-difficulty/v1";
const EPS = 1e-8;
const average = (values) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
const scoreOf = (result) =>
  result.valid && Number.isFinite(result.score) ? result.score : null;

export function validateDifficulty(input, problems) {
  const problem = problems.get(input.problemId ?? "metro");
  const config = input.config ?? {};
  if (typeof config !== "object" || Array.isArray(config))
    throw new Error("Provide scenario settings as an object");
  const scenarioId =
    input.scenarioId ?? config.scenarioId ?? problem.defaultScenario;
  const seedValues = input.seeds ?? [26, 27, 28];
  if (
    !Array.isArray(seedValues) ||
    seedValues.length < 1 ||
    seedValues.length > 5 ||
    seedValues.some(
      (seed) =>
        (typeof seed !== "number" && typeof seed !== "string") ||
        String(seed).trim() === "",
    )
  )
    throw new Error("Provide 1 to 5 seeds");
  const seeds = seedValues.map((seed) => integer(seed, 26, 0, 9999999, "Seed"));
  if (new Set(seeds).size !== seeds.length)
    throw new Error("Seeds must be distinct");
  if (
    !problem
      .capabilities(scenarioId)
      .protocols.includes("vector-optimization/v1")
  )
    throw new Error("Difficulty probes require a bounded vector task");
  const validated = problem.validateConfig({
    ...config,
    scenarioId,
    seed: seeds[0],
  });
  const requestedComparison = input.compareUncoupled ?? true;
  if (typeof requestedComparison !== "boolean")
    throw new Error("compareUncoupled must be a boolean");
  return {
    problemId: problem.id,
    scenarioId,
    config: validated,
    seeds,
    evaluations: integer(input.evaluations, 24, 8, 64, "Evaluation budget"),
    checkpoint: integer(
      input.checkpoint,
      0,
      0,
      problem.id === "skirmish" ? 900 : 240,
      "Checkpoint",
    ),
    gridLevels: integer(
      input.gridLevels,
      5,
      2,
      20,
      "Grid levels per continuous parameter",
    ),
    targetPercent: integer(input.targetPercent, 80, 50, 95, "Target percent"),
    compareUncoupled:
      requestedComparison &&
      problem.id === "fusion" &&
      validated.coupling !== "none",
  };
}

export function empiricalTarget(baseline, referenceBest, fraction) {
  return referenceBest - baseline > EPS
    ? baseline + fraction * (referenceBest - baseline)
    : null;
}

function bestSoFar(values) {
  let best = null;
  return values.map((value) => {
    if (value !== null) best = best === null ? value : Math.max(best, value);
    return best;
  });
}

function sampledScoreLevels(values) {
  let last = -Infinity;
  let levels = 0;
  for (const value of [...values].sort((a, b) => a - b)) {
    if (value - last > EPS) {
      levels++;
      last = value;
    }
  }
  return levels;
}

function profile(problem, config, request, ga, cache, check) {
  const env = problem.create(config);
  if (request.checkpoint > 0) {
    env.acceptSolution(env.createSearchTask().initial(random(config.seed)));
    while (env.tick() < request.checkpoint && !env.done()) {
      check();
      env.advance();
    }
  }
  const space = difficultySpace(problem, env, request.gridLevels, cache, check);
  const row = {
    seed: config.seed,
    actualCheckpoint: env.tick(),
    space,
    search: null,
  };
  const task = env.done() ? null : env.createVectorTask();
  space.dimensions =
    task?.dimension ??
    (space.components.metro
      ? space.components.metro.lines * space.components.metro.activeStations
      : 0) + (space.components.skirmish ? 6 : 0);
  if (!task) return { row, task, gridCandidates: [] };
  const { evaluations: budget, targetPercent } = request;
  const evaluate = (vector) => {
    check();
    return task.evaluate(vector);
  };
  const anchored = task.initial(random(config.seed ^ 0x511e80));
  const baseline = scoreOf(evaluate(anchored));
  if (baseline === null) throw new Error("The initial encoding is infeasible");
  const initialKey = JSON.stringify(task.decode(anchored));
  const uniformRng = random(config.seed ^ 0x9b311f);
  const localRng = random(config.seed ^ 0x96ff21);
  const sample = (rng) => Array.from({ length: task.dimension }, () => rng());
  const referenceScores = [baseline];
  const uniform = { attempted: budget, valid: 0, decoded: 0, scoreLevels: 0 };
  const local = {
    attempted: budget,
    valid: 0,
    unchangedEncoding: 0,
    neutralScore: 0,
    improved: 0,
  };
  const signatures = new Set();
  const uniformScores = [];
  const gridCandidates = [anchored];
  for (let i = 0; i < budget; i++) {
    const candidate = sample(uniformRng);
    const value = scoreOf(evaluate(candidate));
    if (value !== null) {
      uniform.valid++;
      uniformScores.push(value);
      signatures.add(JSON.stringify(task.decode(candidate)));
      referenceScores.push(value);
      gridCandidates.push(candidate);
    }
    const nearby = [...anchored];
    const changed = new Set();
    for (let k = 0; k < Math.min(task.dimension, 1 + (i % 3)); k++) {
      let coordinate;
      do coordinate = Math.floor(localRng() * task.dimension);
      while (changed.has(coordinate));
      changed.add(coordinate);
      nearby[coordinate] = Math.max(
        0,
        Math.min(1, nearby[coordinate] + (2 * localRng() - 1) * 0.25),
      );
    }
    const nearValue = scoreOf(evaluate(nearby));
    if (nearValue !== null) {
      local.valid++;
      if (JSON.stringify(task.decode(nearby)) === initialKey)
        local.unchangedEncoding++;
      if (Math.abs(nearValue - baseline) <= EPS) local.neutralScore++;
      if (nearValue - baseline > EPS) local.improved++;
      referenceScores.push(nearValue);
      gridCandidates.push(nearby);
    }
  }
  uniform.decoded = signatures.size;
  uniform.scoreLevels = sampledScoreLevels(uniformScores);
  const best = Math.max(...referenceScores);
  const target = empiricalTarget(baseline, best, targetPercent / 100);
  const probeRng = random(config.seed ^ 0x6fa43a);
  const randomScores = [baseline];
  for (let i = 1; i < budget; i++)
    randomScores.push(scoreOf(evaluate(sample(probeRng))));
  const search = ga.solve(
    { ...task, evaluate },
    { evaluations: budget, populationSize: 8 },
    {
      random: random(config.seed ^ 0x18b196),
      check,
    },
  );
  const probes = [
    { id: "uniform", scores: bestSoFar(randomScores) },
    { id: "ga", scores: search.trace.map((entry) => entry.score) },
  ].map(({ id, scores }) => ({
    id,
    scores,
    evaluations: scores.length,
    best: scores.at(-1),
    hitAt:
      target === null
        ? null
        : scores.findIndex((value) => value !== null && value >= target - EPS) +
            1 || null,
  }));
  row.search = {
    baseline,
    referenceBest: best,
    target,
    uniform,
    local,
    probes,
  };
  space.encoding = task.encoding;
  return { row, task, gridCandidates };
}

export function gridInteraction(grid) {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (
    height < 2 ||
    width < 2 ||
    grid.some(
      (row) =>
        row.length !== width || row.some((value) => !Number.isFinite(value)),
    )
  )
    return null;
  const mean = average(grid.flat());
  const rowMeans = grid.map(average);
  const colMeans = grid[0].map((_, col) =>
    average(grid.map((row) => row[col])),
  );
  let total = 0,
    residual = 0,
    maxDoubleDifference = 0;
  grid.forEach((row, r) =>
    row.forEach((value, c) => {
      total += (value - mean) ** 2;
      residual += (value - rowMeans[r] - colMeans[c] + mean) ** 2;
      for (let a = 0; a < r; a++)
        for (let b = 0; b < c; b++)
          maxDoubleDifference = Math.max(
            maxDoubleDifference,
            Math.abs(value - grid[r][b] - grid[a][c] + grid[a][b]),
          );
    }),
  );
  return {
    residualShare: maxDoubleDifference > EPS ? residual / total : 0,
    maxDoubleDifference: maxDoubleDifference > EPS ? maxDoubleDifference : 0,
  };
}

function interaction(active, control, check) {
  const blocks = active.task?.blocks;
  if (!blocks || blocks.length !== 2 || !control.task) return null;
  const levels = blocks.map(({ key, start, end }) => {
    const parts = new Map();
    for (const candidate of active.gridCandidates) {
      const value = JSON.stringify(active.task.decode(candidate)[key]);
      if (!parts.has(value)) parts.set(value, candidate.slice(start, end));
      if (parts.size === 3) break;
    }
    return [...parts.values()];
  });
  const measure = (task) =>
    levels[0].map((a) =>
      levels[1].map((b) => {
        check();
        return scoreOf(task.evaluate([...a, ...b]));
      }),
    );
  const a = measure(active.task);
  const b = measure(control.task);
  const joint = gridInteraction(a),
    uncoupled = gridInteraction(b);
  return joint && uncoupled
    ? {
        seed: active.row.seed,
        rows: a.length,
        columns: a[0].length,
        active: joint,
        uncoupled,
        matrices: { active: a, uncoupled: b },
      }
    : null;
}

function summarizeProfile(label, rows, budget) {
  const searched = rows.filter(({ search }) => search);
  const eligible = searched.filter(({ search }) => search.target !== null);
  const sum = (key, metric) =>
    searched.reduce((total, row) => total + row.search[key][metric], 0);
  const valid = sum("uniform", "valid");
  const sampled = sum("uniform", "attempted");
  const nearby = sum("local", "valid");
  return {
    label,
    rows,
    summary: {
      inspected: rows.length,
      searched: searched.length,
      eligible: eligible.length,
      dimensions: [...new Set(rows.map(({ space }) => space.dimensions))].sort(
        (a, b) => a - b,
      ),
      uniformValid: valid,
      uniformSamples: sampled,
      uniformScoreLevels: sum("uniform", "scoreLevels"),
      decodedSignatures: sum("uniform", "decoded"),
      localValid: nearby,
      localSamples: sum("local", "attempted"),
      localNeutral: sum("local", "neutralScore"),
      localUnchangedEncoding: sum("local", "unchangedEncoding"),
      probes: ["uniform", "ga"].map((id) => {
        const hits = eligible.map(
          ({ search }) => search.probes.find((probe) => probe.id === id).hitAt,
        );
        const reached = hits.filter((value) => value !== null);
        return {
          id,
          eligible: hits.length,
          reached: reached.length,
          reachedAtHalf: reached.filter(
            (value) => value <= Math.floor(budget / 2),
          ).length,
          missedShare: hits.length ? 1 - reached.length / hits.length : null,
          meanCallsOnHit: average(reached),
        };
      }),
    },
  };
}

export function assessDifficulty(input, problems, methods, hooks = {}) {
  const request = validateDifficulty(input, problems);
  const problem = problems.get(request.problemId);
  const ga = methods.get("ga");
  const cache = new Map();
  const started = performance.now();
  const check = () => {
    if (performance.now() - started > (hooks.limitMs ?? 60000))
      throw new Error(
        "Assessment time limit reached. Try fewer seeds or a smaller budget.",
      );
    hooks.check?.();
  };
  const selected = [],
    control = [],
    interactions = [];
  for (const seed of request.seeds) {
    const config = { ...request.config, seed };
    const a = profile(problem, config, request, ga, cache, check);
    selected.push(a.row);
    if (request.compareUncoupled) {
      const b = profile(
        problem,
        { ...config, coupling: "none" },
        request,
        ga,
        cache,
        check,
      );
      control.push(b.row);
      if (request.checkpoint === 0) {
        const observed = interaction(a, b, check);
        if (observed) interactions.push(observed);
      }
    }
    hooks.progress?.({
      done: selected.length,
      total: request.seeds.length,
      seed,
    });
  }
  return {
    version: DIFFICULTY_VERSION,
    request,
    profiles: [
      summarizeProfile(
        request.config.coupling ?? "selected",
        selected,
        request.evaluations,
      ),
      ...(control.length
        ? [summarizeProfile("none", control, request.evaluations)]
        : []),
    ],
    interaction: {
      status: !request.compareUncoupled
        ? "not-requested"
        : request.checkpoint > 0
          ? "initial-only"
          : interactions.length
            ? "measured"
            : "insufficient-variation",
      samples: interactions,
    },
  };
}

export function difficultyCSV(report) {
  const rows = [
    [
      "problem",
      "scenario",
      "profile",
      "seed",
      "checkpoint",
      "dimensions",
      "uniform_valid",
      "uniform_samples",
      "baseline",
      "reference_best",
      "target",
      "probe",
      "budget",
      "evaluations",
      "best",
      "hit_at",
      "rail_stations",
      "rail_track_cap",
      "ordered_rail_plans",
      "squad_traversable_tiles",
      "grid_levels",
      "reference_combinations",
      "neutral_local",
      "valid_local",
    ],
  ];
  for (const profile of report.profiles)
    for (const row of profile.rows) {
      const probes = row.search?.probes ?? [null];
      const { metro, skirmish } = row.space.components;
      for (const probe of probes)
        rows.push([
          report.request.problemId,
          report.request.scenarioId,
          profile.label,
          row.seed,
          row.actualCheckpoint,
          row.space.dimensions,
          row.search?.uniform.valid,
          row.search?.uniform.attempted,
          row.search?.baseline,
          row.search?.referenceBest,
          row.search?.target,
          probe?.id,
          report.request.evaluations,
          probe?.evaluations,
          probe?.best,
          probe?.hitAt,
          metro?.activeStations,
          metro?.trackBudget,
          metro?.orderedPlans,
          skirmish ? skirmish.terrainCells - skirmish.blockedCells : null,
          row.space.gridLevels,
          row.space.referenceCombinations,
          row.search?.local.neutralScore,
          row.search?.local.valid,
        ]);
    }
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => '"' + String(value ?? "").replaceAll('"', '""') + '"')
          .join(","),
      )
      .join("\r\n")
  );
}
