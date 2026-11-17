import random from "./random.js";
import greedy from "./greedy.js";
import local from "./local-search.js";
import annealing from "./annealing.js";
/** Register new solvers here; neither the simulator nor UI needs rewriting. */
export const solvers = [random, greedy, local, annealing];
export const solverById = (id) => solvers.find((s) => s.id === id);
export const solverMetadata = () =>
  solvers.map(({ id, name, description }) => ({ id, name, description }));
