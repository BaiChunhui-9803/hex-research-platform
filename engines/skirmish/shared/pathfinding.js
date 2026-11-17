import { key, distance, neighbors } from "./hex.js";
import { walkable, terrainAt, lineOfSight } from "./terrain.js";

/** Deterministic A*: exact destinations or an unobstructed firing position. */
export function findPath(
  map,
  start,
  goal,
  { occupied = new Set(), range = 0, shooting = false, maxExpanded = 500 } = {},
) {
  if (!walkable(map, start) || !goal) return null;
  const open = [
      {
        cell: { q: start.q, r: start.r },
        g: 0,
        f: Math.max(0, distance(start, goal) - range),
      },
    ],
    cost = new Map([[key(start), 0]]),
    parent = new Map(),
    nodes = new Map([[key(start), { q: start.q, r: start.r }]]);
  let expanded = 0;
  while (open.length && expanded++ < maxExpanded) {
    open.sort(
      (a, b) =>
        a.f - b.f || a.g - b.g || key(a.cell).localeCompare(key(b.cell)),
    );
    const current = open.shift(),
      ck = key(current.cell);
    if (current.g > cost.get(ck)) continue;
    if (
      distance(current.cell, goal) <= range &&
      (!shooting || lineOfSight(map, current.cell, goal))
    ) {
      const path = [current.cell];
      let previous = parent.get(ck);
      while (previous) {
        path.push(nodes.get(previous));
        previous = parent.get(previous);
      }
      return path.reverse();
    }
    for (const cell of neighbors(current.cell)) {
      const k = key(cell);
      if (!walkable(map, cell) || (occupied.has(k) && k !== key(start)))
        continue;
      const g = current.g + terrainAt(map, cell).moveCost;
      if (g >= (cost.get(k) ?? Infinity) - 1e-9) continue;
      cost.set(k, g);
      parent.set(k, ck);
      nodes.set(k, cell);
      open.push({ cell, g, f: g + Math.max(0, distance(cell, goal) - range) });
    }
  }
  return null;
}
