import { emptyPlan } from "../shared/scenarios.js";
import { shuffle } from "../shared/rng.js";
import { compilePlan } from "../shared/network.js";
export default {
  id: "random",
  name: "Random baseline",
  description:
    "Shuffle stations with a fixed seed and divide them between three lines.",
  solve(problem, options, context) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const plan = emptyPlan(),
        stations = shuffle(problem.scenario.stations, context.random);
      stations.forEach((s, i) => plan.lines[i % 3].stops.push(s.id));
      if (compilePlan(problem.scenario, plan).valid) return plan;
    }
    return emptyPlan();
  },
};
