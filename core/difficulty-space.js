import { cells as metroCells } from "../engines/metro/shared/hex.js";
import { cellAt, defaultMapRules } from "../engines/metro/shared/map-rules.js";
import { requiresSimpleTrack, trackCell, trackSegment } from "../engines/metro/shared/track-geometry.js";
import { cells as battleCells, key } from "../engines/skirmish/shared/hex.js";
import { terrainAt } from "../engines/skirmish/shared/terrain.js";

function stationHistogram(routes, budget, limit, check) {
  const n = routes.length;
  const histogram = new Float64Array(budget + 1);
  histogram[0] = 1;
  let states = new Map(
    routes.map((_, station) => {
      const count = new Float64Array(budget + 1);
      count[0] = 1;
      return [(1 << station) * n + station, count];
    }),
  );
  for (let size = 1; size <= limit; size++) {
    check();
    const next = new Map();
    for (const [index, counts] of states) {
      const last = index % n;
      const mask = Math.floor(index / n);
      for (let cost = 0; cost <= budget; cost++)
        histogram[cost] += counts[cost];
      if (size === limit) continue;
      for (let station = 0; station < n; station++) {
        const distance = routes[last][station]?.edges ?? Infinity;
        if (mask & (1 << station) || distance > budget) continue;
        const id = (mask | (1 << station)) * n + station;
        let row = next.get(id);
        if (!row) {
          row = new Float64Array(budget + 1);
          next.set(id, row);
        }
        for (let cost = 0; cost + distance <= budget; cost++)
          row[cost + distance] += counts[cost];
      }
    }
    states = next;
  }
  return histogram;
}

function footprintHistogram(stations, routes, budget, limit, check) {
  const histogram = new Float64Array(budget + 1);
  histogram[0] = 1;
  const bits = new Map();
  function cellBit(cell) {
    const key = trackCell(cell);
    if (!bits.has(key)) bits.set(key, 1n << BigInt(bits.size));
    return bits.get(key);
  }
  const footprints = routes.map((row) => row.map((route) => route?.cells.slice(1)
    .reduce((bits, cell) => bits | cellBit(cell), 0n)));
  let prefixes = 0;
  let capped = false;
  function visit(last, usedStations, usedCells, cost, stops) {
    prefixes++;
    if (prefixes % 4096 === 0) check();
    if (prefixes > 300000) {
      capped = true;
      return;
    }
    histogram[cost]++;
    if (stops === limit) return;
    for (let next = 0; next < stations.length && !capped; next++) {
      const mask = 1 << next;
      const edges = routes[last][next]?.edges ?? Infinity;
      if ((usedStations & mask) || cost + edges > budget) continue;
      const footprint = footprints[last][next];
      if ((usedCells & footprint) !== 0n) continue;
      visit(next, usedStations | mask, usedCells | footprint, cost + edges, stops + 1);
    }
  }
  for (let i = 0; i < stations.length && !capped; i++) visit(i, 1 << i, cellBit(stations[i]), 0, 1);
  return capped ? null : histogram;
}

function combineLines(histogram, budget, maxLines) {
  const byCost = [...histogram].flatMap((count, cost) =>
    count ? [{ count: BigInt(count), cost }] : [],
  );
  let totals = Array(budget + 1).fill(0n);
  totals[0] = 1n;
  for (let line = 0; line < maxLines; line++) {
    const next = Array(budget + 1).fill(0n);
    for (let used = 0; used <= budget; used++) {
      if (!totals[used]) continue;
      for (const { cost, count } of byCost)
        if (used + cost <= budget) next[used + cost] += totals[used] * count;
    }
    totals = next;
  }
  return totals.reduce((total, count) => total + count, 0n);
}

/** Count ordered stop sequences under the actual line rule, with a certified upper bound for large grids. */
export function railPlanReference(scenario, check = () => {}) {
  const { trackBudget: budget, maxStopsPerLine, maxLines } = scenario.resources;
  const stations = scenario.stations.filter(({ q, r }) =>
    defaultMapRules.canBuildStation(cellAt(scenario.map, `${q},${r}`)),
  );
  if (stations.length > 16) throw new Error("Rail reference counts support up to 16 buildable stations");
  const limit = Math.min(maxStopsPerLine, stations.length);
  const routes = stations.map((from) => stations.map((to) => {
    if (from === to) return null;
    const cells = trackSegment(scenario, from, to);
    return cells ? { cells, edges: cells.length - 1 } : null;
  }));
  const strict = requiresSimpleTrack(scenario);
  const exact = strict ? footprintHistogram(stations, routes, budget, limit, check) : null;
  const histogram = exact ?? stationHistogram(routes, budget, limit, check);
  return { count: combineLines(histogram, budget, maxLines), kind: strict && !exact ? "upper-bound" : "exact" };
}

export function countRailPlans(scenario, check) {
  return railPlanReference(scenario, check).count;
}

export function difficultySpace(problem, env, gridLevels, cache, check) {
  const observation = env.observe();
  const view = env.renderState();
  const composite = problem.id === "fusion";
  const rail = composite
    ? observation.components.metro
    : problem.id === "metro"
      ? observation
      : null;
  const squad = composite
    ? observation.components.skirmish
    : problem.id === "skirmish"
      ? observation
      : null;
  const result = {
    dimensions: null,
    gridLevels,
    components: {},
    referenceCombinations: null,
  };
  let combinations = 1n;
  if (rail) {
    const { map, stations, resources } = rail.scenario;
    const key = JSON.stringify([
      map,
      stations.map(({ q, r }) => [q, r]),
      resources,
      rail.scenario.trackTopology,
    ]);
    if (!cache.has(key)) cache.set(key, railPlanReference(rail.scenario, check));
    const { count, kind } = cache.get(key);
    const terrain = metroCells(map);
    result.components.metro = {
      activeStations: stations.length,
      lines: resources.maxLines,
      maxStopsPerLine: resources.maxStopsPerLine,
      trackBudget: resources.trackBudget,
      trainCapacity: resources.trainCapacity,
      demandMultiplier: rail.scenario.demandMultiplier,
      remainingEditBudget: Number.isFinite(rail.remainingEditBudget)
        ? rail.remainingEditBudget
        : null,
      terrainCells: terrain.length,
      blockedTrackCells: terrain.filter(
        (cell) => !defaultMapRules.canTraverse(cell, cell, resources),
      ).length,
      orderedPlans: count.toString(),
      countKind: kind,
      trackTopology: requiresSimpleTrack(rail.scenario) ? "simple" : "legacy",
      done: composite ? view.components.metro.done : env.done(),
    };
    combinations *= count;
    result.referenceKind = kind;
  }
  if (squad) {
    const terrain = battleCells(squad.map);
    const count = 4n * BigInt(gridLevels) ** 4n;
    const terrainTypes = {};
    for (const location of terrain) {
      const type = squad.map.terrain[key(location)] ?? "plain";
      terrainTypes[type] = (terrainTypes[type] ?? 0) + 1;
    }
    result.components.skirmish = {
      continuousParameters: 4,
      switches: 2,
      terrainCells: terrain.length,
      blockedCells: terrain.filter(
        (cell) => !terrainAt(squad.map, cell).walkable,
      ).length,
      sightBlockingCells: terrain.filter(
        (cell) => terrainAt(squad.map, cell).blocksSight,
      ).length,
      terrainTypes,
      livingOwn: squad.own.length,
      livingOpponents: squad.enemies.length,
      discreteExample: count.toString(),
      done: composite ? view.components.skirmish.done : env.done(),
    };
    combinations *= count;
  }
  if (view.links?.ruleDesign) {
    const count = env.draftOptions().length;
    result.referenceCombinations = count ? String(count) : null;
    result.referenceKind = count ? "exact" : null;
  } else if (rail || squad) result.referenceCombinations = combinations.toString();
  return result;
}
