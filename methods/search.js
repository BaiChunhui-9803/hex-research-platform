/** The same implementations run on every optimization/v1 problem adapter. */
function optimize(kind, task, options, context) {
  const budget = options.evaluations ?? 16;
  const rng = context.random;
  const cache = new Map();
  const evaluate = (solution) => {
    const key = JSON.stringify(solution);
    if (!cache.has(key)) {
      context.check?.();
      const result = task.evaluate(structuredClone(solution));
      cache.set(key, result);
    }
    return cache.get(key);
  };
  let current = task.initial(rng),
    currentValue = evaluate(current);
  let best = structuredClone(current),
    bestValue = currentValue;
  const trace = [
    { iteration: 0, score: bestValue.valid ? bestValue.score : null },
  ];
  const attempts = kind === "constructive" ? 0 : budget - 1;
  for (let i = 0; i < attempts; i++) {
    context.check?.();
    const proposal =
      kind === "random-search"
        ? task.sample(rng)
        : task.mutate(structuredClone(current), rng);
    const value = evaluate(proposal);
    if (value.valid && (!bestValue.valid || value.score > bestValue.score)) {
      best = structuredClone(proposal);
      bestValue = value;
    }
    const delta = value.score - currentValue.score;
    const temperature = Math.max(
      0.001,
      (task.temperature ?? 30) * Math.pow(0.02, i / Math.max(1, attempts)),
    );
    if (
      value.valid &&
      (!currentValue.valid ||
        delta >= 0 ||
        (kind === "annealing" && rng() < Math.exp(delta / temperature)))
    ) {
      current = proposal;
      currentValue = value;
    }
    trace.push({
      iteration: i + 1,
      score: bestValue.valid ? bestValue.score : null,
    });
  }
  if (!bestValue.valid || !Number.isFinite(bestValue.score))
    throw new Error("No valid solution found");
  return {
    solution: best,
    score: bestValue.score,
    evaluations: cache.size,
    trace,
  };
}
export const searchMethods = [
  [
    "constructive",
    "Constructive baseline",
    "Use the constructive starting solution supplied by the problem adapter.",
  ],
  [
    "random-search",
    "Random search",
    "Sample independent candidates, retaining the best valid solution.",
  ],
  [
    "hill-climb",
    "Hill climbing",
    "Improve a solution through the problem-defined neighborhood.",
  ],
  [
    "annealing",
    "Simulated annealing",
    "Accept some temporary decreases while retaining the best solution.",
  ],
].map(([id, name, description]) => ({
  id,
  name,
  description,
  mode: "search",
  objective: "single",
  category:
    id === "constructive" || id === "random-search"
      ? "Reference"
      : "Trajectory search",
  family:
    id === "constructive"
      ? "Constructive"
      : id === "random-search"
        ? "Independent sampling"
        : "Local search",
  variant: id === "annealing" ? "Temperature" : "Reference",
  referenceKeys:
    id === "annealing" ? ["annealing-original"] : ["benchmark-practice"],
  implementationNotes:
    "Native candidate encoding; problem-defined construction, neighborhood and deployment score.",
  protocol: "optimization/v1",
  parameters: [
    { key: "evaluations", type: "integer", default: 128, min: 1, max: 4096 },
  ],
  solve: (task, options, context) => optimize(id, task, options, context),
}));
