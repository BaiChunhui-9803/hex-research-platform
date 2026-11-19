import { distance, findPath } from "../../engines/metro/shared/hex.js";
import { requiresSimpleTrack, reusedTrackCell, trackCell, trackSegment } from "../../engines/metro/shared/track-geometry.js";
import { emptyPlan } from "../../engines/metro/shared/scenarios.js";
import { pick } from "../../core/random.js";

const objectives = [
  { id: "demand", name: "Link demand potential (negative)", direction: "min", unit: "ranking units" },
  { id: "cost", name: "New track edges", direction: "min", unit: "edges" },
  { id: "reach", name: "Distance from the acting faction", direction: "min", unit: "hexes" },
];

export const railActionKey = (action) => action?.type === "pass-turn" ? `pass:${action.team}` :
  action?.type === "place-track" ? [action.team, action.line, action.from, action.to, action.side].join(":") : null;

function stationZones(stations, factionUnits, factions) {
  const anchors = Object.fromEntries(factions.map((team) => {
    const units = factionUnits.filter((unit) => unit.team === team);
    return [team, {
      q: units.reduce((sum, { q }) => sum + q, 0) / units.length,
      r: units.reduce((sum, { r }) => sum + r, 0) / units.length,
    }];
  }));
  const sorted = [...stations].sort((a, b) =>
    stations.reduce((sum, station) => sum + distance(a, station) - distance(b, station), 0) ||
    a.id.localeCompare(b.id));
  const hub = sorted[0]?.id;
  const owner = new Map(stations.map((station) => [station.id,
    [...factions].sort((a, b) => distance(station, anchors[a]) - distance(station, anchors[b]) || a.localeCompare(b))[0]]));
  return { anchors, hub, owner };
}

/** One turn admits atomic additions to the actual metro plan. Path costs reuse native routing. */
export function createRailDraft(metro, geometry, program, firstSeat) {
  const { factions } = program;
  const build = program.phases[0];
  const ordered = [...factions.slice(firstSeat), ...factions.slice(0, firstSeat)];
  const turns = build.order === "snake"
    ? Array.from({ length: build.rounds }, (_, round) => round % 2 ? [...ordered].reverse() : ordered).flat()
    : ["neutral"];
  const scenario = metro.observe().scenario;
  const stations = scenario.stations;
  const byId = new Map(stations.map((station) => [station.id, station]));
  const simple = requiresSimpleTrack(scenario);
  const { anchors, hub, owner } = stationZones(stations, geometry.units, factions);
  const quota = Math.floor(scenario.resources.trackBudget / factions.length);
  const spent = Object.fromEntries(factions.map((team) => [team, 0]));
  const contributions = Object.fromEntries(factions.map((team) => [team, 0]));
  const choicesByFaction = Object.fromEntries(factions.map((team) => [team, 0]));
  const paths = new Map();
  let turn = 0, committed = false, cache;
  if (turns[0] !== "neutral") metro.acceptSolution(emptyPlan());

  function segment(a, b) {
    const id = simple ? `${a}:${b}` : [a, b].sort().join(":");
    if (!paths.has(id)) {
      const from = byId.get(a), to = byId.get(b);
      const path = simple ? trackSegment(scenario, from, to) : findPath(scenario.map, from, to, scenario.resources);
      paths.set(id, path);
    }
    return paths.get(id);
  }
  function options() {
    const team = turns[turn];
    if (!team || team === "neutral" || committed) return [];
    if (cache) return cache;
    const plan = metro.currentPlan();
    const existing = simple ? metro.trackPaths() : null;
    const budget = Math.min(quota - spent[team], scenario.resources.trackBudget - metro.metrics().track);
    const visited = new Set(plan.lines.flatMap(({ stops }) => stops));
    const moves = [];
    for (const line of plan.lines) {
      if (line.stops.length >= scenario.resources.maxStopsPerLine) continue;
      if (build.writer === "zones" && factions.indexOf(team) !== plan.lines.indexOf(line)) continue;
      const occupied = simple ? new Set((existing[line.id] ?? []).flatMap(({ cells }) => cells.map(trackCell))) : null;
      const legalStation = (id) => build.writer !== "zones" || id === hub || owner.get(id) === team;
      const ends = line.stops.length
        ? [["end", line.stops.at(-1)], ...((line.stops.length > 1) ? [["start", line.stops[0]]] : [])]
        : stations.map(({ id }) => ["new", id]);
      for (const [side, from] of ends) {
        if (!legalStation(from)) continue;
        for (const { id: to } of stations) {
          if (to === from || line.stops.includes(to) || !legalStation(to) || (side === "new" && from > to)) continue;
          const path = segment(from, to);
          if (!path || path.length - 1 > budget || (occupied && reusedTrackCell(path, occupied))) continue;
          const edges = path.length - 1;
          const a = byId.get(from), b = byId.get(to);
          const reach = Math.min(distance(a, anchors[team]), distance(b, anchors[team]));
          const demand = a.demand + b.demand + 1.5 * Number(a.shape !== b.shape) +
            Number(!visited.has(to)) + (side === "new" ? Number(visited.has(from) !== visited.has(to)) : 0);
          const score = 3 * demand - 0.45 * edges - 0.55 * reach;
          moves.push({ action: { type: "place-track", team, line: line.id, from, to, side },
            label: `Line ${line.id} · ${a.name} → ${b.name} · ${edges} edges`, edges, demand, reach, score });
        }
      }
    }
    moves.sort((a, b) => b.score - a.score || a.edges - b.edges || railActionKey(a.action).localeCompare(railActionKey(b.action)));
    cache = [...moves, { action: { type: "pass-turn", team }, label: "Pass", edges: 0, demand: 0, reach: 0,
      score: -1, }];
    return cache;
  }
  const view = (withActions) => ({
    turn, totalTurns: turns.length, active: turns[turn] ?? null, order: [...turns], quota,
    trackBudget: scenario.resources.trackBudget, spent: { ...spent },
    contributions: { ...contributions }, choicesByFaction: { ...choicesByFaction }, committed,
    ...(withActions ? { actions: options().slice(0, 12).map(({ action, label }) => ({ action, label })) } : {}),
  });
  function apply(action) {
    if (committed || action?.team !== turns[turn]) throw new Error("Only the active faction may act once this turn");
    if (!["place-track", "pass-turn"].includes(action.type)) throw new Error("Unknown draft action");
    const choices = options();
    const move = choices.find((item) => railActionKey(item.action) === railActionKey(action));
    if (!move) throw new Error("Placement exceeds the faction quota, station rights, or route constraints");
    const { type, team, line: id, side, from, to } = move.action;
    if (type === "place-track") {
      const plan = metro.currentPlan();
      const line = plan.lines.find(({ id: candidate }) => candidate === id);
      if (side === "new") line.stops = [from, to];
      else if (side === "start") line.stops.unshift(to);
      else line.stops.push(to);
      metro.acceptSolution(plan);
      spent[team] += move.edges;
      contributions[team]++;
    }
    const distinctLinks = new Set(choices.filter(({ action }) => action.type === "place-track")
      .map(({ action }) => [action.from, action.to].sort().join(":")));
    if (distinctLinks.size > 1) choicesByFaction[team]++;
    committed = true;
    return { ...move.action, label: move.label, edges: move.edges };
  }
  return {
    view, apply, options,
    finished: () => turn >= turns.length,
    advance() {
      if (turn >= turns.length) return;
      const team = turns[turn];
      const event = team === "neutral" ? { type: "neutral-plan", label: "Neutral planner committed the public network" }
        : !committed ? apply({ type: "pass-turn", team }) : null;
      turn++;
      committed = false;
      cache = null;
      return event;
    },
  };
}

export function draftTasks(choices) {
  if (!choices.length) throw new Error("There is no active faction placement");
  const index = new Map(choices.map((move, position) => [railActionKey(move.action), position]));
  const encode = (position) => [(position + 0.5) / choices.length];
  const decode = ([v]) => choices[Math.max(0, Math.min(choices.length - 1, Math.floor(v * choices.length)))].action;
  function evaluate(action) {
    const move = index.has(railActionKey(action)) ? choices[index.get(railActionKey(action))] : null;
    return move ? {
      valid: true, score: move.score, objectives: [-move.demand, move.edges, move.reach],
      metrics: { trackEdges: move.edges, demandPotential: move.demand, localDistance: move.reach },
    } : { valid: false, score: -Infinity };
  }
  return {
    native: {
      protocol: "optimization/v1", encoding: "One legal move for the active faction",
      temperature: 2, objectiveSchema: objectives,
      initial: () => choices[0].action,
      sample: (rng) => pick(choices, rng).action,
      mutate(action, rng) {
        const position = index.get(railActionKey(action)) ?? 0;
        const offset = rng() < 0.5 ? -1 : 1;
        return choices[(position + offset + choices.length) % choices.length].action;
      },
      evaluate,
    },
    vector: {
      protocol: "vector-optimization/v1", dimension: 1,
      encoding: "One key selects a legal placement for the active faction",
      objectiveSchema: objectives, objectiveScales: [8, 12, 12],
      initial: () => encode(0), decode, evaluate: (vector) => evaluate(decode(vector)),
    },
  };
}
