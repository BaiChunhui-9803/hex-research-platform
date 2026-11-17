import { createEvaluator, normal, norm, clamp } from "./common.js";
const identity = (n) =>
  Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => Number(i === j)),
  );
const multiply = (a, x) =>
  a.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
/** Symmetric Jacobi eigensolver, also independently tested on rotated matrices. */
export function symmetricEigen(matrix) {
  const n = matrix.length,
    a = matrix.map((row) => [...row]),
    vectors = identity(n);
  for (let sweep = 0; sweep < 20; sweep++) {
    let largest = 0;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        largest = Math.max(largest, Math.abs(apq));
        if (Math.abs(apq) < 1e-13) continue;
        const angle = 0.5 * Math.atan2(2 * apq, a[q][q] - a[p][p]),
          c = Math.cos(angle),
          s = Math.sin(angle),
          app = a[p][p],
          aqq = a[q][q];
        a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        a[p][q] = a[q][p] = 0;
        for (let k = 0; k < n; k++)
          if (k !== p && k !== q) {
            const akp = a[k][p],
              akq = a[k][q];
            a[k][p] = a[p][k] = c * akp - s * akq;
            a[k][q] = a[q][k] = s * akp + c * akq;
          }
        for (let k = 0; k < n; k++) {
          const vp = vectors[k][p],
            vq = vectors[k][q];
          vectors[k][p] = c * vp - s * vq;
          vectors[k][q] = s * vp + c * vq;
        }
      }
    if (largest < 1e-11) break;
  }
  return { values: a.map((row, i) => Math.max(1e-14, row[i])), vectors };
}
export function cmaes(task, options, context) {
  const e = createEvaluator(task, options, context),
    rng = context.random,
    n = task.dimension;
  const lambda = options.populationSize || 4 + Math.floor(3 * Math.log(n)),
    mu = Math.max(1, Math.floor(lambda / 2));
  const raw = Array.from(
      { length: mu },
      (_, i) => Math.log(mu + 0.5) - Math.log(i + 1),
    ),
    sum = raw.reduce((a, b) => a + b, 0),
    weights = raw.map((w) => w / sum),
    mueff = 1 / weights.reduce((s, w) => s + w * w, 0);
  const cc = (4 + mueff / n) / (n + 4 + (2 * mueff) / n),
    cs = (mueff + 2) / (n + mueff + 5),
    c1 = 2 / ((n + 1.3) ** 2 + mueff),
    cmu = Math.min(
      1 - c1,
      (2 * (mueff - 2 + 1 / mueff)) / ((n + 2) ** 2 + mueff),
    ),
    damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs,
    chi = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  let center = task.initial(rng).map(clamp),
    sigma = 0.25,
    covariance = identity(n),
    pc = Array(n).fill(0),
    ps = Array(n).fill(0),
    generation = 0;
  e.evaluate(center);
  while (e.canContinue) {
    const eigen = symmetricEigen(covariance),
      scales = eigen.values.map(Math.sqrt),
      B = eigen.vectors,
      offspring = [];
    for (let k = 0; k < lambda && e.canContinue; k++) {
      const z = Array.from({ length: n }, () => normal(rng)),
        y = multiply(
          B,
          z.map((v, j) => v * scales[j]),
        );
      const point = center.map((x, j) => clamp(x + sigma * y[j])),
        entry = e.evaluate(point);
      if (entry) offspring.push(entry);
    }
    if (!offspring.length) break;
    offspring.sort((a, b) => b.score - a.score);
    const chosen = offspring.slice(0, Math.min(mu, offspring.length)),
      used = weights.slice(0, chosen.length),
      total = used.reduce((a, b) => a + b, 0),
      w = used.map((v) => v / total),
      old = [...center];
    center = Array.from({ length: n }, (_, j) =>
      chosen.reduce((s, p, i) => s + w[i] * p.x[j], 0),
    );
    const yw = center.map((x, j) => (x - old[j]) / sigma),
      projection = Array.from(
        { length: n },
        (_, j) => B.reduce((s, row, i) => s + row[j] * yw[i], 0) / scales[j],
      ),
      white = multiply(B, projection);
    ps = ps.map(
      (v, j) => (1 - cs) * v + Math.sqrt(cs * (2 - cs) * mueff) * white[j],
    );
    generation++;
    const hsig =
      norm(ps) / Math.sqrt(1 - (1 - cs) ** (2 * generation)) / chi <
      1.4 + 2 / (n + 1)
        ? 1
        : 0;
    pc = pc.map(
      (v, j) => (1 - cc) * v + hsig * Math.sqrt(cc * (2 - cc) * mueff) * yw[j],
    );
    covariance = covariance.map((row, i) =>
      row.map((value, j) => {
        const rankMu = chosen.reduce(
          (s, p, k) =>
            s +
            (w[k] * (p.x[i] - old[i]) * (p.x[j] - old[j])) / (sigma * sigma),
          0,
        );
        return (
          (1 - c1 - cmu) * value +
          c1 * (pc[i] * pc[j] + (1 - hsig) * cc * (2 - cc) * value) +
          cmu * rankMu
        );
      }),
    );
    sigma = Math.max(
      1e-6,
      Math.min(2, sigma * Math.exp((cs / damps) * (norm(ps) / chi - 1))),
    );
  }
  return e.finish({
    implementation: {
      variant: "positive-weight full covariance CMA-ES",
      populationSize: lambda,
      generations: generation,
      boundary: "normalized-coordinate clipping",
      activeNegativeWeights: false,
      restarts: false,
    },
  });
}
