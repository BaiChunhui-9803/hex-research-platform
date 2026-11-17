export function multistart(task, options, context) {
  const n = options.evaluations ?? 64,
    period = Math.max(2, Math.ceil(n / 4)),
    rng = context.random;
  let current = task.initial(rng),
    best = structuredClone(current),
    value = task.evaluate(current),
    bestValue = value,
    calls = 1;
  const trace = [];
  for (let i = 1; i < n; i++) {
    context.check?.();
    const candidate =
        i % period === 0
          ? task.sample(rng)
          : task.mutate(structuredClone(current), rng),
      v = task.evaluate(candidate);
    calls++;
    if (
      v.valid &&
      (i % period === 0 || !value.valid || v.score > value.score)
    ) {
      current = candidate;
      value = v;
    }
    if (v.valid && (!bestValue.valid || v.score > bestValue.score)) {
      best = structuredClone(candidate);
      bestValue = v;
    }
    trace.push({
      iteration: calls,
      score: bestValue.valid ? bestValue.score : null,
    });
  }
  if (!bestValue.valid) throw new Error("No valid solution");
  return { solution: best, score: bestValue.score, evaluations: calls, trace };
}
export function tabu(task, options, context) {
  const budget = options.evaluations ?? 64,
    rng = context.random;
  let current = task.initial(rng),
    best = structuredClone(current),
    bestValue = task.evaluate(current),
    calls = 1;
  const queue = [JSON.stringify(current)],
    trace = [];
  while (calls < budget) {
    let next = null,
      nextValue = null;
    for (let i = 0; i < 4 && calls < budget; i++) {
      context.check?.();
      const candidate = task.mutate(structuredClone(current), rng),
        value = task.evaluate(candidate);
      calls++;
      if (
        value.valid &&
        (!queue.includes(JSON.stringify(candidate)) ||
          value.score > bestValue.score) &&
        (!nextValue || value.score > nextValue.score)
      ) {
        next = candidate;
        nextValue = value;
      }
    }
    if (next) {
      current = next;
      queue.push(JSON.stringify(current));
      if (queue.length > 7) queue.shift();
      if (!bestValue.valid || nextValue.score > bestValue.score) {
        best = structuredClone(current);
        bestValue = nextValue;
      }
    }
    trace.push({
      iteration: calls,
      score: bestValue.valid ? bestValue.score : null,
    });
  }
  if (!bestValue.valid) throw new Error("No valid solution");
  return {
    solution: best,
    score: bestValue.score,
    evaluations: calls,
    trace,
    implementation: {
      tenure: 7,
      neighborhood: "four sampled moves per iteration",
      aspiration: "best score",
    },
  };
}
