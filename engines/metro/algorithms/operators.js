import { pick } from "../shared/rng.js";
export function mutate(plan, problem, rng) {
  const next = structuredClone(plan),
    line = pick(next.lines, rng),
    n = line.stops.length;
  const operation = Math.floor(rng() * 5),
    at = Math.floor(rng() * Math.max(1, n));
  if (operation === 0 && n >= 2) {
    const to = Math.floor(rng() * n);
    [line.stops[at], line.stops[to]] = [line.stops[to], line.stops[at]];
  } else if (
    operation === 1 &&
    n < problem.scenario.resources.maxStopsPerLine
  ) {
    const unused = problem.scenario.stations.filter(
      (s) => !line.stops.includes(s.id),
    );
    if (unused.length) line.stops.splice(at, 0, pick(unused, rng).id);
  } else if (operation === 2 && n > 2) line.stops.splice(at, 1);
  else if (operation === 3 && n) {
    const unused = problem.scenario.stations.filter(
      (s) => !line.stops.includes(s.id),
    );
    if (unused.length) line.stops[at] = pick(unused, rng).id;
  } else if (n >= 3) line.stops.reverse();
  return next;
}
