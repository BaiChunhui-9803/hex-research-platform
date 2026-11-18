import { cells as metroCells, findPath } from "../engines/metro/shared/hex.js";
import { cellAt, defaultMapRules } from "../engines/metro/shared/map-rules.js";
import { cells as battleCells, key } from "../engines/skirmish/shared/hex.js";
import { terrainAt } from "../engines/skirmish/shared/terrain.js";

/** Count ordered routes over active stations, then combine labeled lines under the shared track limit. */
export function countRailPlans(scenario, check = () => {}) {
  const { trackBudget: budget, maxStopsPerLine, maxLines } = scenario.resources;
  const stations = scenario.stations.filter(({ q, r }) =>
    defaultMapRules.canBuildStation(cellAt(scenario.map, `${q},${r}`)),
  );
  const n = stations.length;
  if (n > 16)
    throw new Error("Exact rail counts support up to 16 buildable stations");
  const limit = Math.min(maxStopsPerLine, n);
  const costs = stations.map((from) =>
    stations.map((to) => {
      if (from === to) return 0;
      const path = findPath(scenario.map, from, to, scenario.resources);
      return path ? path.length - 1 : Infinity;
    }),
  );
  const histogram = new Float64Array(budget + 1);
  histogram[0] = 1;
  let states = new Map(
    stations.map((_, station) => {
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
        const distance = costs[last][station];
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
    ]);
    if (!cache.has(key)) cache.set(key, countRailPlans(rail.scenario, check));
    const count = cache.get(key);
    const terrain = metroCells(map);
    result.components.metro = {
      activeStations: stations.length,
      lines: resources.maxLines,
      maxStopsPerLine: resources.maxStopsPerLine,
      trackBudget: resources.trackBudget,
      remainingEditBudget: Number.isFinite(rail.remainingEditBudget)
        ? rail.remainingEditBudget
        : null,
      terrainCells: terrain.length,
      blockedTrackCells: terrain.filter(
        (cell) => !defaultMapRules.canTraverse(cell, cell, resources),
      ).length,
      orderedPlans: count.toString(),
      done: composite ? view.components.metro.done : env.done(),
    };
    combinations *= count;
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
  if (rail || squad) result.referenceCombinations = combinations.toString();
  return result;
}
