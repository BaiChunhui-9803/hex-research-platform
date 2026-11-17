import { PlatformSession, PLATFORM_VERSION } from "./session.js";
import { compatibility } from "./registry.js";
import { integer } from "./random.js";

export function validateExperiment(input, problems, methods) {
  const problem = problems.get(input.problemId);
  const scenarioIds = input.scenarioIds ?? [
    input.scenarioId ?? problem.defaultScenario,
  ];
  const methodIds = input.methodIds ?? [
    "constructive",
    "random-search",
    "hill-climb",
    "annealing",
  ];
  const rawSeeds = input.seeds ?? [input.seed ?? 26];
  if (!Array.isArray(rawSeeds)) throw new Error("Seeds must be an array");
  const seeds = rawSeeds.map(Number);
  for (const [name, values, max] of [
    ["scenarios", scenarioIds, 11],
    ["methods", methodIds, methods.list().length],
    ["seeds", seeds, 10],
  ])
    if (
      !Array.isArray(values) ||
      !values.length ||
      values.length > max ||
      new Set(values).size !== values.length
    )
      throw new Error(`Provide 1 to ${max} distinct ${name}`);
  for (const seed of seeds) integer(seed, 26, 0, 9999999, "Seed");
  const options = {
    evaluations: integer(input.evaluations, 128, 1, 4096, "Evaluations"),
    populationSize: integer(input.populationSize, 0, 0, 128, "Population size"),
  };
  for (const scenarioId of scenarioIds) {
    problem.validateConfig({ ...input.config, scenarioId, seed: seeds[0] });
    for (const id of methodIds) {
      const check = compatibility(
        methods.get(id),
        problem.capabilities(scenarioId),
      );
      if (!check.compatible)
        throw new Error(`${id}: ${check.reasons.join("; ")}`);
    }
  }
  if (scenarioIds.length * methodIds.length * seeds.length > 120)
    throw new Error("At most 120 episodes per experiment");
  return {
    problemId: problem.id,
    scenarioIds,
    methodIds,
    seeds: seeds.map(Number),
    config: input.config ?? {},
    ...options,
  };
}
export function summarize(results, schema) {
  const groups = new Map();
  for (const result of results) {
    const key = JSON.stringify([
      result.problemId,
      result.scenarioId,
      result.methodId,
      result.config.horizon,
      result.config.opponent,
      result.config.team,
      result.config.objective,
      result.config.editBudget,
    ]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  return [...groups.values()].map((rows) => ({
    problemId: rows[0].problemId,
    scenarioId: rows[0].scenarioId,
    methodId: rows[0].methodId,
    n: rows.length,
    metrics: Object.fromEntries(
      schema.map((metric) => {
        const values = rows
          .map((r) => r.metrics[metric.id])
          .filter(Number.isFinite);
        const mean = values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null;
        const sd =
          values.length > 1
            ? Math.sqrt(
                values.reduce((s, v) => s + (v - mean) ** 2, 0) /
                  (values.length - 1),
              )
            : null;
        return [metric.id, { mean, sd, n: values.length }];
      }),
    ),
  }));
}
export function runExperiment(input, problems, methods, hooks = {}) {
  const request = validateExperiment(input, problems, methods),
    problem = problems.get(request.problemId);
  const results = [],
    started = performance.now(),
    limitMs = hooks.limitMs ?? 120000;
  const total =
    request.scenarioIds.length *
    request.methodIds.length *
    request.seeds.length;
  const check = () => {
    if (performance.now() - started > limitMs)
      throw new Error("Experiment time limit exceeded");
    hooks.check?.();
  };
  for (const scenarioId of request.scenarioIds)
    for (const seed of request.seeds)
      for (const methodId of request.methodIds) {
        check();
        const begin = performance.now();
        const session = new PlatformSession(
          problem,
          { ...request.config, scenarioId, seed },
          methods.get(methodId),
          {
            evaluations: request.evaluations,
            populationSize: request.populationSize,
          },
        );
        while (!session.environment.done()) session.advance(50, { check });
        results.push({
          id: `${scenarioId}:${seed}:${methodId}`,
          problemId: problem.id,
          scenarioId,
          seed,
          methodId,
          config: session.config,
          metrics: session.environment.metrics(),
          evaluations: session.evaluations,
          elapsedMs: Math.round(performance.now() - begin),
          replay: session.replay(),
          searchDetail: session.searchDetail,
        });
        hooks.progress?.({
          progress: results.length / total,
          completed: results.length,
          total,
          message: `${scenarioId} · ${methodId} · seed ${seed}`,
        });
      }
  return {
    version: PLATFORM_VERSION,
    createdAt: new Date().toISOString(),
    request,
    metricSchema: problem.metrics,
    results,
    summary: summarize(results, problem.metrics),
    elapsedMs: Math.round(performance.now() - started),
  };
}
export function resultCSV(report) {
  const ids = report.metricSchema.map((m) => m.id);
  const rows = [
    [
      "problemId",
      "scenarioId",
      "methodId",
      "seed",
      "horizon",
      "team",
      "opponent",
      "objective",
      "evaluations",
      "elapsedMs",
      ...ids,
    ],
    ...report.results.map((r) => [
      r.problemId,
      r.scenarioId,
      r.methodId,
      r.seed,
      r.config.horizon,
      r.config.team ?? "",
      r.config.opponent ?? "",
      r.config.objective ?? "",
      r.evaluations,
      r.elapsedMs,
      ...ids.map((k) => r.metrics[k] ?? ""),
    ]),
  ];
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
      )
      .join("\r\n")
  );
}
