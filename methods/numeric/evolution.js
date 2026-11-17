import {
  createEvaluator,
  population,
  populationSize,
  better,
  normal,
  clamp,
  sbx,
  polynomialMutation,
  tournament,
  mean,
  cauchy,
  indices,
  midpointBounds,
  binomial,
} from "./common.js";

export function geneticAlgorithm(task, options, context) {
  const e = createEvaluator(task, options, context),
    rng = context.random,
    n = populationSize(options, e.budget);
  let pop = population(e, rng, n);
  while (e.canContinue) {
    const offspring = [];
    while (offspring.length < n && e.canContinue) {
      const a = tournament(pop, rng),
        b = tournament(pop, rng);
      const child = polynomialMutation(sbx(a.x, b.x, rng), rng);
      const entry = e.evaluate(child);
      if (entry) offspring.push(entry);
    }
    if (!offspring.length) break;
    pop = [...pop, ...offspring].sort((a, b) => b.score - a.score).slice(0, n);
  }
  return e.finish({
    implementation: {
      populationSize: n,
      variation: "bounded SBX and polynomial mutation",
      selection: "binary tournament plus elitist survival",
    },
  });
}
export function evolutionStrategy(task, options, context) {
  const e = createEvaluator(task, options, context),
    rng = context.random;
  let current = e.evaluate(task.initial(rng)),
    sigma = 0.15,
    success = 0,
    window = 0;
  while (e.canContinue) {
    const candidate = e.evaluate(
      current.x.map((x) => clamp(x + sigma * normal(rng))),
    );
    if (!candidate) break;
    if (better(candidate, current)) {
      current = candidate;
      success++;
    }
    window++;
    if (window === 10) {
      sigma = Math.max(
        0.002,
        Math.min(0.8, sigma * Math.exp(success / window - 0.2)),
      );
      window = 0;
      success = 0;
    }
  }
  return e.finish({
    implementation: {
      strategy: "(1+1)-ES",
      stepSize: "Gaussian mutation with a windowed one-fifth success rule",
      boundary: "clipping",
    },
  });
}
export function particleSwarm(task, options, context, constriction = false) {
  const e = createEvaluator(task, options, context),
    rng = context.random,
    n = populationSize(options, e.budget),
    initial = population(e, rng, n);
  const swarm = initial.map((entry) => ({
    entry,
    best: entry,
    velocity: entry.x.map(() => 0.1 * (rng() - 0.5)),
  }));
  while (e.canContinue) {
    for (const particle of swarm) {
      if (!e.canContinue) break;
      const inertia = 0.9 - (0.5 * e.calls) / e.budget,
        c = constriction ? 2.05 : 2,
        chi = constriction ? 0.729843788 : 1;
      const global = e.best?.x ?? particle.best.x;
      particle.velocity = particle.velocity.map((v, j) =>
        Math.max(
          -0.2,
          Math.min(
            0.2,
            chi *
              ((constriction ? 1 : inertia) * v +
                c * rng() * (particle.best.x[j] - particle.entry.x[j]) +
                c * rng() * (global[j] - particle.entry.x[j])),
          ),
        ),
      );
      const entry = e.evaluate(
        particle.entry.x.map((x, j) => clamp(x + particle.velocity[j])),
      );
      if (!entry) break;
      particle.entry = entry;
      if (better(entry, particle.best)) particle.best = entry;
    }
  }
  return e.finish({
    implementation: {
      populationSize: n,
      topology: "global best",
      variant: constriction
        ? "Clerc-Kennedy constriction"
        : "linearly decreasing inertia",
      velocityLimit: 0.2,
      boundary: "clipping",
    },
  });
}

export function differentialEvolution(
  task,
  options,
  context,
  variant = "rand",
) {
  const e = createEvaluator(task, options, context),
    rng = context.random,
    d = task.dimension;
  const n0 =
    variant === "lshade"
      ? options.populationSize ||
        Math.max(4, Math.min(18 * d, Math.floor(e.budget / 3)))
      : populationSize(options, e.budget, 20);
  const historySize = variant === "shade" ? 100 : 6;
  let pop = population(e, rng, Math.min(n0, e.budget)),
    archive = [],
    muF = 0.5,
    muCR = 0.5,
    memoryF = Array(historySize).fill(0.5),
    memoryCR = Array(historySize).fill(0.5),
    memoryAt = 0;
  let fs = pop.map(() => 0.5),
    crs = pop.map(() => 0.9);
  while (e.canContinue && pop.length >= 4) {
    const sf = [],
      scr = [],
      gains = [],
      next = [...pop],
      nextF = [...fs],
      nextCR = [...crs];
    const ranked = [...pop].sort((a, b) => b.score - a.score);
    for (let i = 0; i < pop.length && e.canContinue; i++) {
      let f = 0.5,
        cr = 0.9,
        mutant;
      if (variant === "jde") {
        f = rng() < 0.1 ? 0.1 + 0.9 * rng() : fs[i];
        cr = rng() < 0.1 ? rng() : crs[i];
      }
      const adaptive = ["jade", "shade", "lshade"].includes(variant);
      if (adaptive) {
        const mem = Math.floor(rng() * historySize),
          center = variant === "jade" ? muF : memoryF[mem];
        let tries = 0;
        do {
          f = cauchy(center, 0.1, rng);
        } while (f <= 0 && ++tries < 100);
        f = Math.max(0.001, Math.min(1, f));
        const centerCR = variant === "jade" ? muCR : memoryCR[mem];
        cr = centerCR === -1 ? 0 : clamp(centerCR + 0.1 * normal(rng));
      }
      if (adaptive) {
        const p =
          variant === "shade"
            ? 2 / pop.length + rng() * Math.max(0, 0.2 - 2 / pop.length)
            : variant === "jade"
              ? 0.05
              : 0.11;
        const pbest =
          ranked[
            Math.floor(
              rng() *
                Math.min(pop.length, Math.max(2, Math.ceil(p * pop.length))),
            )
          ];
        const [r1] = indices(pop.length, 1, rng, [i]);
        const union = [...pop, ...archive];
        const donorCandidates = union
          .map((_, j) => j)
          .filter((j) => j !== i && j !== r1);
        const r2 = donorCandidates[Math.floor(rng() * donorCandidates.length)];
        mutant = pop[i].x.map(
          (x, j) =>
            x + f * (pbest.x[j] - x) + f * (pop[r1].x[j] - union[r2].x[j]),
        );
      } else {
        if (variant === "best") {
          const bestAt = pop.indexOf(ranked[0]),
            donor = indices(pop.length, 2, rng, [i, bestAt]);
          mutant = ranked[0].x.map(
            (x, j) => x + f * (pop[donor[0]].x[j] - pop[donor[1]].x[j]),
          );
        } else {
          const donor = indices(pop.length, 3, rng, [i]);
          mutant = pop[donor[0]].x.map(
            (x, j) => x + f * (pop[donor[1]].x[j] - pop[donor[2]].x[j]),
          );
        }
      }
      const vector = binomial(
          pop[i].x,
          midpointBounds(mutant, pop[i].x),
          cr,
          rng,
        ),
        entry = e.evaluate(vector);
      if (!entry) break;
      if (entry.valid && (!pop[i].valid || entry.score >= pop[i].score)) {
        next[i] = entry;
        nextF[i] = f;
        nextCR[i] = cr;
        if (adaptive && better(entry, pop[i])) {
          archive.push(pop[i]);
          sf.push(f);
          scr.push(cr);
          gains.push(
            pop[i].valid ? Math.max(1e-12, entry.score - pop[i].score) : 1,
          );
        }
      }
    }
    pop = next;
    fs = nextF;
    crs = nextCR;
    if (sf.length) {
      if (variant === "jade") {
        muF =
          0.9 * muF +
          (0.1 * sf.reduce((s, x) => s + x * x, 0)) /
            sf.reduce((a, b) => a + b, 0);
        muCR = 0.9 * muCR + 0.1 * mean(scr);
      } else {
        const sum = gains.reduce((a, b) => a + b, 0),
          weights = gains.map((g) => g / sum),
          weighted = (v, p = 1) =>
            v.reduce((s, x, j) => s + weights[j] * x ** p, 0);
        memoryF[memoryAt] = weighted(sf, 2) / weighted(sf);
        memoryCR[memoryAt] =
          variant === "shade"
            ? weighted(scr)
            : memoryCR[memoryAt] === -1 || Math.max(...scr) === 0
              ? -1
              : weighted(scr, 2) / Math.max(1e-16, weighted(scr));
        memoryAt = (memoryAt + 1) % historySize;
      }
    }
    if (variant === "lshade") {
      const target = Math.max(
        4,
        Math.round(n0 + ((4 - n0) * e.calls) / e.budget),
      );
      if (pop.length > target) {
        const order = pop
          .map((_, i) => i)
          .sort((a, b) => pop[b].score - pop[a].score)
          .slice(0, target);
        pop = order.map((i) => pop[i]);
        fs = order.map((i) => fs[i]);
        crs = order.map((i) => crs[i]);
      }
    }
    while (archive.length > pop.length)
      archive.splice(Math.floor(rng() * archive.length), 1);
  }
  return e.finish({
    implementation: {
      variant,
      populationSize: n0,
      finalPopulationSize: pop.length,
      boundary: "parent-bound midpoint repair",
      initialPopulation:
        "UI-budget adapted unless an explicit size is supplied",
      archive:
        variant === "jade" || variant === "shade" || variant === "lshade",
      memorySize: historySize,
      historyVersion:
        variant === "shade"
          ? "SHADE 1.0: weighted arithmetic CR memory"
          : variant === "lshade"
            ? "L-SHADE: weighted Lehmer CR memory"
            : null,
    },
  });
}
