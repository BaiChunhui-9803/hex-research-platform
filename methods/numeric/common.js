export const clamp = (x) => Math.max(0, Math.min(1, x));
export const mean = (values) =>
  values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
export const norm = (vector) =>
  Math.sqrt(vector.reduce((s, x) => s + x * x, 0));
export const better = (a, b) => a?.valid && (!b?.valid || a.score > b.score);
export function normal(rng) {
  return (
    Math.sqrt(-2 * Math.log(Math.max(1e-16, rng()))) *
    Math.cos(2 * Math.PI * rng())
  );
}
export function cauchy(center, scale, rng) {
  return center + scale * Math.tan(Math.PI * (rng() - 0.5));
}
export function indices(n, count, rng, exclude = []) {
  const pool = Array.from({ length: n }, (_, i) => i).filter(
    (i) => !exclude.includes(i),
  );
  if (pool.length < count) throw new Error("Insufficient distinct donors");
  for (let i = 0; i < count; i++) {
    const at = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[at]] = [pool[at], pool[i]];
  }
  return pool.slice(0, count);
}
export function createEvaluator(task, options, context) {
  if (
    task.protocol !== "vector-optimization/v1" ||
    !Number.isInteger(task.dimension) ||
    task.dimension < 1
  )
    throw new Error("A bounded vector task is required");
  const budget = options.evaluations ?? 128,
    cache = new Map();
  let calls = 0,
    attempts = 0,
    best = null;
  const trace = [];
  const evaluate = (x) => {
    context.check?.();
    attempts++;
    if (
      !Array.isArray(x) ||
      x.length !== task.dimension ||
      x.some((v) => !Number.isFinite(v))
    )
      throw new Error("Invalid search vector");
    const vector = x.map(clamp),
      key = JSON.stringify(vector);
    if (cache.has(key)) return cache.get(key);
    if (calls >= budget) return null;
    calls++;
    const result = task.evaluate(vector),
      valid = Boolean(result.valid) && Number.isFinite(result.score);
    const entry = {
      x: vector,
      valid,
      score: valid ? result.score : -Infinity,
      objectives:
        valid && Array.isArray(result.objectives) ? result.objectives : null,
      metrics: result.metrics ?? null,
    };
    cache.set(key, entry);
    if (better(entry, best)) best = entry;
    trace.push({ iteration: calls, score: best?.valid ? best.score : null });
    return entry;
  };
  return {
    task,
    budget,
    evaluate,
    get calls() {
      return calls;
    },
    get best() {
      return best;
    },
    get trace() {
      return trace;
    },
    get remaining() {
      return budget - calls;
    },
    get canContinue() {
      return calls < budget && attempts < budget * 15;
    },
    get entries() {
      return [...cache.values()];
    },
    finish(extra = {}) {
      if (!best?.valid) throw new Error("No valid solution found");
      return {
        solution: task.decode(best.x),
        vector: [...best.x],
        score: best.score,
        evaluations: calls,
        trace,
        ...extra,
      };
    },
  };
}
export function population(evaluator, rng, size) {
  const entries = [];
  const initial = evaluator.evaluate(evaluator.task.initial(rng));
  if (initial) entries.push(initial);
  while (entries.length < size && evaluator.canContinue) {
    const entry = evaluator.evaluate(
      Array.from({ length: evaluator.task.dimension }, () => rng()),
    );
    if (entry) entries.push(entry);
  }
  return entries;
}
export function populationSize(options, budget, fallback = 20) {
  return Math.min(
    Math.max(1, budget),
    options.populationSize ||
      Math.max(4, Math.min(fallback, Math.floor(budget / 4))),
  );
}
export function tournament(pop, rng, rank = (a, b) => b.score - a.score) {
  const a = pop[Math.floor(rng() * pop.length)],
    b = pop[Math.floor(rng() * pop.length)];
  return rank(a, b) <= 0 ? a : b;
}
export function sbx(a, b, rng, eta = 20) {
  return a.map((value, j) => {
    if (rng() > 0.5 || Math.abs(value - b[j]) < 1e-14) return value;
    const x1 = Math.min(value, b[j]),
      x2 = Math.max(value, b[j]),
      u = rng();
    const beta = 1 + (2 * x1) / (x2 - x1),
      alpha = 2 - Math.pow(beta, -(eta + 1));
    const q =
      u <= 1 / alpha
        ? Math.pow(u * alpha, 1 / (eta + 1))
        : Math.pow(1 / (2 - u * alpha), 1 / (eta + 1));
    const beta2 = 1 + (2 * (1 - x2)) / (x2 - x1),
      alpha2 = 2 - Math.pow(beta2, -(eta + 1));
    const q2 =
      u <= 1 / alpha2
        ? Math.pow(u * alpha2, 1 / (eta + 1))
        : Math.pow(1 / (2 - u * alpha2), 1 / (eta + 1));
    return clamp(
      rng() < 0.5
        ? 0.5 * (x1 + x2 - q * (x2 - x1))
        : 0.5 * (x1 + x2 + q2 * (x2 - x1)),
    );
  });
}
export function polynomialMutation(
  vector,
  rng,
  eta = 20,
  probability = 1 / vector.length,
) {
  return vector.map((x) => {
    if (rng() > probability) return x;
    const u = rng(),
      power = 1 / (eta + 1);
    let delta;
    if (u <= 0.5)
      delta =
        Math.pow(2 * u + (1 - 2 * u) * Math.pow(1 - x, eta + 1), power) - 1;
    else
      delta =
        1 - Math.pow(2 * (1 - u) + 2 * (u - 0.5) * Math.pow(x, eta + 1), power);
    return clamp(x + delta);
  });
}
export function midpointBounds(vector, parent) {
  return vector.map((x, j) =>
    x < 0 ? parent[j] / 2 : x > 1 ? (1 + parent[j]) / 2 : x,
  );
}
export function binomial(parent, mutant, cr, rng) {
  const forced = Math.floor(rng() * parent.length);
  return parent.map((x, j) => (j === forced || rng() < cr ? mutant[j] : x));
}
