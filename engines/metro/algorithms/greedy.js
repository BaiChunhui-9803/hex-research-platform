import { emptyPlan } from "../shared/scenarios.js";
import { distance } from "../shared/hex.js";
import { compilePlan } from "../shared/network.js";
export function greedyPlan(problem) {
  const { stations } = problem.scenario,
    byId = Object.fromEntries(stations.map((s) => [s.id, s]));
  const hub = [...stations].sort(
    (a, b) =>
      stations.reduce((n, s) => n + distance(a, s), 0) -
      stations.reduce((n, s) => n + distance(b, s), 0),
  )[0];
  const plan = emptyPlan();
  plan.lines.forEach((l) => l.stops.push(hub.id));
  const remaining = new Set(
    stations.filter((s) => s.id !== hub.id).map((s) => s.id),
  );
  while (remaining.size) {
    let best = null;
    for (const id of remaining)
      for (let li = 0; li < 3; li++) {
        const stops = plan.lines[li].stops;
        if (stops.length >= problem.scenario.resources.maxStopsPerLine)
          continue;
        for (let at = 0; at <= stops.length; at++) {
          const before = byId[stops[at - 1]],
            after = byId[stops[at]],
            station = byId[id];
          const delta =
            (before ? distance(before, station) : 0) +
            (after ? distance(station, after) : 0) -
            (before && after ? distance(before, after) : 0);
          const hasShape = stops.some((x) => byId[x].shape === station.shape);
          const value =
            delta + stops.length * 1.8 - (hasShape ? 0 : 5) - station.demand;
          const candidate = structuredClone(plan);
          candidate.lines[li].stops.splice(at, 0, id);
          if (
            (!best || value < best.value) &&
            compilePlan(problem.scenario, candidate).valid
          )
            best = { value, candidate, id };
        }
      }
    if (!best) break;
    plan.lines = best.candidate.lines;
    remaining.delete(best.id);
  }
  return plan;
}
export default {
  id: "greedy",
  name: "Shape-aware greedy",
  description:
    "Start from a central hub, prioritise missing destination types and insert stations at low additional cost.",
  solve: greedyPlan,
};
