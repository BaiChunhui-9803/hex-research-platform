import { greedyPlan } from "./greedy.js";
import { mutate } from "./operators.js";
export default {
  id: "local",
  name: "Local search",
  description:
    "Start from the greedy plan. Insert, remove or swap stops, accepting score improvements only.",
  solve(problem, options, context) {
    let best = greedyPlan(problem),
      score = context.evaluate(best).score;
    const iterations = options.iterations ?? 90;
    for (let i = 0; i < iterations && !context.shouldStop(); i++) {
      const candidate = mutate(best, problem, context.random),
        result = context.evaluate(candidate);
      if (result.valid && result.score > score) {
        best = candidate;
        score = result.score;
      }
      if (i % 5 === 0)
        context.progress(i / iterations, `Local search ${i}/${iterations}`);
    }
    return best;
  },
};
