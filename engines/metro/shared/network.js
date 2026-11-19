import { LINE_IDS, SHAPES } from "./scenarios.js";
import { defaultMapRules, cellAt } from "./map-rules.js";
import { traceTrackLine, trackCell } from "./track-geometry.js";

export function compilePlan(scenario, plan, rules = defaultMapRules) {
  const errors = [],
    stationMap = Object.fromEntries(scenario.stations.map((s) => [s.id, s])),
    paths = {},
    graph = {};
  for (const s of scenario.stations) graph[s.id] = [];
  if (!plan || !Array.isArray(plan.lines))
    return {
      valid: false,
      errors: ["Plan must contain a lines array"],
      trackUsed: 0,
      paths,
      graph,
    };
  if (
    plan.lines.length !== 3 ||
    new Set(plan.lines.map((l) => l.id)).size !== 3 ||
    plan.lines.some((l) => !LINE_IDS.includes(l.id))
  )
    errors.push("Plan must include Lines A, B and C exactly once");
  let trackUsed = 0;
  for (const line of plan.lines) {
    if (!Array.isArray(line.stops)) {
      errors.push(`Line ${line.id} must contain a stops array`);
      continue;
    }
    if (line.stops.length > scenario.resources.maxStopsPerLine)
      errors.push(
        `Line ${line.id} allows at most ${scenario.resources.maxStopsPerLine} stops`,
      );
    if (new Set(line.stops).size !== line.stops.length)
      errors.push(`Line ${line.id} cannot repeat a station`);
    if (line.stops.some((id) => !stationMap[id])) {
      errors.push(`Line ${line.id} contains an unknown station`);
      continue;
    }
    for (const id of line.stops) {
      const s = stationMap[id];
      if (!rules.canBuildStation(cellAt(scenario.map, `${s.q},${s.r}`)))
        errors.push(`A station cannot be built at ${s.name}`);
    }
    const { segments, length, issue } = traceTrackLine(scenario, line.stops.map((id) => stationMap[id]), rules);
    paths[line.id] = segments;
    trackUsed += length;
    if (issue) {
      const { from, to, conflict } = issue;
      errors.push(conflict
        ? `Line ${line.id} revisits hex ${trackCell(conflict)} between ${from.name} and ${to.name}. A line must follow a simple path.`
        : `No traversable route connects ${from.name} and ${to.name}`);
    }
    for (const { from, to, duration } of segments) {
      graph[from].push({
        to,
        line: line.id,
        cost: duration + scenario.resources.dwellMinutes,
      });
      graph[to].push({
        to: from,
        line: line.id,
        cost: duration + scenario.resources.dwellMinutes,
      });
    }
  }
  if (trackUsed > scenario.resources.trackBudget)
    errors.push(
      `Track budget exceeded: ${trackUsed}/${scenario.resources.trackBudget} edges`,
    );
  return { valid: errors.length === 0, errors, paths, graph, trackUsed };
}
/** A station intersection is a transfer only when both lines stop there. */
export function buildRouting(scenario, network) {
  const byId = Object.fromEntries(scenario.stations.map((s) => [s.id, s])),
    result = {};
  for (const origin of scenario.stations)
    for (const shape of SHAPES) {
      const open = [{ station: origin.id, line: null, cost: 0, first: null }],
        seen = new Map();
      while (open.length) {
        open.sort((a, b) => a.cost - b.cost);
        const x = open.shift(),
          key = `${x.station}/${x.line}`;
        if ((seen.get(key) ?? Infinity) <= x.cost) continue;
        seen.set(key, x.cost);
        if (x.station !== origin.id && byId[x.station].shape === shape) {
          result[`${origin.id}/${shape}`] = x.first;
          break;
        }
        for (const edge of network.graph[x.station] ?? []) {
          open.push({
            station: edge.to,
            line: edge.line,
            cost: x.cost + edge.cost + (x.line && x.line !== edge.line ? 2 : 0),
            first: x.first ?? { line: edge.line, to: edge.to },
          });
        }
      }
    }
  return result;
}
