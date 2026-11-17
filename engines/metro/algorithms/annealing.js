import { greedyPlan } from "./greedy.js";
import { mutate } from "./operators.js";
export default {
  id: "annealing",
  name: "Simulated annealing",
  description:
    "Accept some temporary score decreases as temperature falls, while retaining the best plan found.",
  solve(problem, options, context) {
    let current = greedyPlan(problem),
      best = current;
    let currentScore = context.evaluate(current).score,
      bestScore = currentScore;
    const iterations = options.iterations ?? 120;
    for (let i = 0; i < iterations && !context.shouldStop(); i++) {
      const candidate = mutate(current, problem, context.random),
        result = context.evaluate(candidate);
      if (!result.valid) continue;
      const temperature = 65 * Math.pow(0.015, i / iterations),
        change = result.score - currentScore;
      if (change >= 0 || context.random() < Math.exp(change / temperature)) {
        current = candidate;
        currentScore = result.score;
      }
      if (currentScore > bestScore) {
        best = structuredClone(current);
        bestScore = currentScore;
      }
      if (i % 5 === 0)
        context.progress(
          i / iterations,
          `Simulated annealing ${i}/${iterations}`,
        );
    }
    return best;
  },
};
