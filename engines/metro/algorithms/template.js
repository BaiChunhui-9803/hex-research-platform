/** Copy this module, then import and add it to algorithms/registry.js. */
import { greedyPlan } from "./greedy.js";
export default {
  id: "my-solver",
  name: "My planner",
  description:
    "Return the stop order for three lines using your own planning or optimisation method.",
  async solve(problem, options, context) {
    const plan = greedyPlan(problem);
    // context.random(): seeded RNG; do not use Math.random() for experiments.
    // context.evaluate(plan): the same full deterministic simulator for everyone.
    // context.progress(0.5, 'Searching'); context.shouldStop(): wall-time safety limit.
    // Always return the best valid plan you have evaluated.
    return plan;
  },
};
