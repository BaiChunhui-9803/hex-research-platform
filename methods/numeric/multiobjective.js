import {
  createEvaluator,
  population,
  populationSize,
  tournament,
  sbx,
  polynomialMutation,
  indices,
} from "./common.js";
export function dominates(a, b) {
  if (!a.valid || !a.objectives?.every(Number.isFinite)) return false;
  if (!b.valid || !b.objectives?.every(Number.isFinite)) return true;
  return (
    a.objectives.every((v, j) => v <= b.objectives[j]) &&
    a.objectives.some((v, j) => v < b.objectives[j])
  );
}
export function fronts(pop) {
  const dominated = pop.map(() => []),
    counts = pop.map(() => 0),
    result = [[]];
  for (let i = 0; i < pop.length; i++)
    for (let j = i + 1; j < pop.length; j++) {
      if (dominates(pop[i], pop[j])) {
        dominated[i].push(j);
        counts[j]++;
      } else if (dominates(pop[j], pop[i])) {
        dominated[j].push(i);
        counts[i]++;
      }
    }
  for (let i = 0; i < pop.length; i++)
    if (counts[i] === 0) {
      pop[i].rank = 0;
      result[0].push(i);
    }
  for (let rank = 0; rank < result.length; rank++) {
    const next = [];
    for (const i of result[rank])
      for (const j of dominated[i])
        if (--counts[j] === 0) {
          pop[j].rank = rank + 1;
          next.push(j);
        }
    if (next.length) result.push(next);
  }
  return result.filter((f) => f.length).map((f) => f.map((i) => pop[i]));
}
export function crowding(pop) {
  for (const point of pop) point.crowding = 0;
  if (pop.length <= 2) {
    for (const point of pop) point.crowding = Infinity;
    return;
  }
  const m = pop.find((p) => p.objectives)?.objectives.length ?? 0;
  for (let j = 0; j < m; j++) {
    const sorted = [...pop].sort(
      (a, b) =>
        (a.objectives?.[j] ?? Infinity) - (b.objectives?.[j] ?? Infinity),
    );
    sorted[0].crowding = sorted.at(-1).crowding = Infinity;
    const range = sorted.at(-1).objectives?.[j] - sorted[0].objectives?.[j];
    if (!Number.isFinite(range) || range <= 0) continue;
    for (let i = 1; i < sorted.length - 1; i++)
      sorted[i].crowding +=
        (sorted[i + 1].objectives[j] - sorted[i - 1].objectives[j]) / range;
  }
}
const unique = (pop) => [
  ...new Map(pop.map((p) => [JSON.stringify(p.x), p])).values(),
];
function finish(e, extra) {
  const eligible = e.entries.filter(
    (p) => p.valid && p.objectives?.every(Number.isFinite),
  );
  if (!eligible.length)
    throw new Error("This method requires finite multiple objectives");
  const front = fronts(eligible)[0],
    distinct = new Map();
  for (const point of front) {
    const key = JSON.stringify(point.objectives),
      old = distinct.get(key);
    if (!old || point.score > old.score) distinct.set(key, point);
  }
  const archive = [...distinct.values()].sort(
    (a, b) => a.objectives[0] - b.objectives[0],
  );
  const chosen = [...archive].sort((a, b) => b.score - a.score)[0];
  return {
    ...e.finish(),
    solution: e.task.decode(chosen.x),
    vector: [...chosen.x],
    score: chosen.score,
    paretoArchive: archive.map((p) => ({
      objectives: [...p.objectives],
      score: p.score,
      solution: e.task.decode(p.x),
      vector: [...p.x],
    })),
    objectiveSchema: e.task.objectiveSchema,
    selectionRule:
      "Maximum deployment score among nondominated evaluated candidates",
    implementation: {
      ...extra,
      frontScope:
        "nondominated archive of evaluated candidates; equal objective points collapsed",
    },
  };
}
export function nsga2(task, options, context) {
  const e = createEvaluator(task, options, context),
    rng = context.random,
    n = populationSize(options, e.budget);
  let pop = population(e, rng, n),
    generations = 0;
  while (e.canContinue) {
    for (const f of fronts(pop)) crowding(f);
    const offspring = [];
    while (offspring.length < n && e.canContinue) {
      const rank = (a, b) => a.rank - b.rank || b.crowding - a.crowding;
      const a = tournament(pop, rng, rank),
        b = tournament(pop, rng, rank),
        child = e.evaluate(polynomialMutation(sbx(a.x, b.x, rng), rng));
      if (child) offspring.push(child);
    }
    if (!offspring.length) break;
    const next = [];
    for (const f of fronts(unique([...pop, ...offspring]))) {
      crowding(f);
      if (next.length + f.length <= n) next.push(...f);
      else {
        next.push(
          ...f
            .sort((a, b) => b.crowding - a.crowding)
            .slice(0, n - next.length),
        );
        break;
      }
    }
    pop = next;
    generations++;
  }
  return finish(e, {
    method: "NSGA-II",
    populationSize: n,
    generations,
    selection: "fast nondominated sorting and crowding distance",
    variation: "SBX plus polynomial mutation",
  });
}
const distance = (a, b, scales) =>
  Math.sqrt(
    a.objectives.reduce(
      (sum, x, j) => sum + ((x - b.objectives[j]) / (scales?.[j] ?? 1)) ** 2,
      0,
    ),
  );
export function spea2Environmental(pop, size, scales) {
  pop = unique(pop);
  const strength = pop.map((a) => pop.filter((b) => dominates(a, b)).length),
    raw = pop.map((a) =>
      pop.reduce((sum, b, j) => sum + (dominates(b, a) ? strength[j] : 0), 0),
    );
  const k = Math.max(1, Math.floor(Math.sqrt(pop.length)));
  pop.forEach((point, i) => {
    const neighbors = pop
      .filter((p) => p !== point && p.valid && p.objectives)
      .map((p) =>
        point.valid && point.objectives ? distance(point, p, scales) : Infinity,
      )
      .sort((a, b) => a - b);
    point.speaFitness =
      raw[i] +
      1 / (2 + (neighbors[Math.min(k - 1, neighbors.length - 1)] ?? Infinity));
  });
  let archive = pop.filter(
    (_, i) => raw[i] === 0 && pop[i].valid && pop[i].objectives,
  );
  if (archive.length < size)
    archive = [
      ...archive,
      ...pop
        .filter((p) => !archive.includes(p))
        .sort((a, b) => a.speaFitness - b.speaFitness),
    ].slice(0, size);
  while (archive.length > size) {
    const rows = archive.map((a) =>
      archive
        .filter((b) => a !== b)
        .map((b) => distance(a, b, scales))
        .sort((a, b) => a - b),
    );
    let remove = 0;
    for (let i = 1; i < rows.length; i++) {
      for (let j = 0; j < rows[i].length; j++) {
        if (rows[i][j] < rows[remove][j]) {
          remove = i;
          break;
        }
        if (rows[i][j] > rows[remove][j]) break;
      }
    }
    archive.splice(remove, 1);
  }
  return archive;
}
export function spea2(task, options, context) {
  const e = createEvaluator(task, options, context),
    rng = context.random,
    n = populationSize(options, e.budget);
  let pop = population(e, rng, n),
    archive = [];
  while (e.canContinue) {
    archive = spea2Environmental([...archive, ...pop], n, task.objectiveScales);
    const offspring = [];
    while (offspring.length < n && e.canContinue) {
      const rank = (a, b) => a.speaFitness - b.speaFitness,
        a = tournament(archive, rng, rank),
        b = tournament(archive, rng, rank);
      const entry = e.evaluate(polynomialMutation(sbx(a.x, b.x, rng), rng));
      if (entry) offspring.push(entry);
    }
    if (!offspring.length) break;
    pop = offspring;
  }
  return finish(e, {
    method: "SPEA2",
    populationSize: n,
    archiveSize: n,
    selection:
      "strength, k-neighbor density, lexicographic distance truncation",
  });
}
export function moead(task, options, context) {
  const e = createEvaluator(task, options, context),
    rng = context.random,
    n = populationSize(options, e.budget),
    m = task.objectiveSchema?.length;
  if (!m || m < 2) throw new Error("MOEA/D requires at least two objectives");
  let pop = population(e, rng, n);
  const weights = Array.from({ length: pop.length }, (_, i) => {
    if (m === 2)
      return [
        i / Math.max(1, pop.length - 1),
        1 - i / Math.max(1, pop.length - 1),
      ];
    const v = Array.from(
        { length: m },
        () => -Math.log(Math.max(1e-16, rng())),
      ),
      sum = v.reduce((a, b) => a + b, 0);
    return v.map((x) => x / sum);
  });
  const neighbors = weights.map((w) =>
    weights
      .map((v, i) => ({ i, d: v.reduce((s, x, j) => s + (x - w[j]) ** 2, 0) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.max(2, Math.ceil(0.2 * n)))
      .map((p) => p.i),
  );
  let ideal = Array(m).fill(Infinity);
  const updateIdeal = (entry) => {
    if (entry?.valid && entry.objectives?.every(Number.isFinite))
      ideal = ideal.map((z, j) => Math.min(z, entry.objectives[j]));
  };
  for (const entry of pop) updateIdeal(entry);
  const scalar = (entry, w) =>
    !entry?.valid || !entry.objectives
      ? Infinity
      : Math.max(
          ...w.map(
            (v, j) =>
              Math.max(1e-6, v) * Math.abs(entry.objectives[j] - ideal[j]) /
              (task.objectiveScales?.[j] ?? 1),
          ),
        );
  while (e.canContinue && pop.length >= 2) {
    for (let i = 0; i < pop.length && e.canContinue; i++) {
      const pool = rng() < 0.9 ? neighbors[i] : pop.map((_, j) => j),
        at = indices(pool.length, 2, rng),
        a = pop[pool[at[0]]],
        b = pop[pool[at[1]]];
      const child = e.evaluate(polynomialMutation(sbx(a.x, b.x, rng), rng));
      if (!child) break;
      updateIdeal(child);
      let replaced = 0;
      const order = [...pool];
      for (let k = order.length - 1; k > 0; k--) {
        const at = Math.floor(rng() * (k + 1));
        [order[k], order[at]] = [order[at], order[k]];
      }
      for (const j of order)
        if (scalar(child, weights[j]) <= scalar(pop[j], weights[j])) {
          pop[j] = child;
          if (++replaced >= 2) break;
        }
    }
  }
  return finish(e, {
    method: "MOEA/D",
    populationSize: n,
    decomposition: "Tchebycheff",
    neighborhoodFraction: 0.2,
    neighborMating: 0.9,
    maxReplacements: 2,
    variation: "SBX plus polynomial mutation",
  });
}
