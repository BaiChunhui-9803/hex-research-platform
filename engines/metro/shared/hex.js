import { defaultMapRules, cellAt } from "./map-rules.js";
export const DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
export const key = (q, r) => `${q},${r}`;
export const distance = (a, b) =>
  (Math.abs(a.q - b.q) +
    Math.abs(a.r - b.r) +
    Math.abs(a.q + a.r - b.q - b.r)) /
  2;
export const hexPoint = (cell, size = 25) => ({
  x: Math.sqrt(3) * size * (cell.q + cell.r / 2),
  y: 1.5 * size * cell.r,
});
export function cells(map) {
  const result = [];
  for (let q = map.qMin; q <= map.qMax; q++)
    for (let r = map.rMin; r <= map.rMax; r++) {
      if (Math.abs(q + r) <= map.diagonalLimit)
        result.push(cellAt(map, key(q, r)));
    }
  return result;
}
export function inMap(map, q, r) {
  return (
    q >= map.qMin &&
    q <= map.qMax &&
    r >= map.rMin &&
    r <= map.rMax &&
    Math.abs(q + r) <= map.diagonalLimit
  );
}
/** Deterministic A*: ties use stable insertion order. Returns hex centres. */
export function findPath(
  map,
  start,
  goal,
  context = {},
  rules = defaultMapRules,
) {
  if (!inMap(map, start.q, start.r) || !inMap(map, goal.q, goal.r)) return null;
  const sk = key(start.q, start.r),
    gk = key(goal.q, goal.r);
  const open = [{ k: sk, g: 0, f: distance(start, goal) }],
    cost = new Map([[sk, 0]]),
    prev = new Map();
  while (open.length) {
    open.sort((a, b) => a.f - b.f || a.g - b.g);
    const cur = open.shift();
    if (cur.g !== cost.get(cur.k)) continue;
    if (cur.k === gk) {
      const route = [cellAt(map, gk)];
      let k = gk;
      while (k !== sk) {
        k = prev.get(k);
        route.push(cellAt(map, k));
      }
      return route.reverse();
    }
    const from = cellAt(map, cur.k);
    for (const [dq, dr] of DIRECTIONS) {
      const q = from.q + dq,
        r = from.r + dr;
      if (!inMap(map, q, r)) continue;
      const to = cellAt(map, key(q, r));
      if (!rules.canTraverse(from, to, context)) continue;
      const g = cur.g + rules.traversalCost(from, to, context),
        k = key(q, r);
      if (g >= (cost.get(k) ?? Infinity)) continue;
      cost.set(k, g);
      prev.set(k, cur.k);
      open.push({ k, g, f: g + distance(to, goal) });
    }
  }
  return null;
}
