export const DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
export const key = (cell) => `${cell.q},${cell.r}`;
export const distance = (a, b) =>
  (Math.abs(a.q - b.q) +
    Math.abs(a.r - b.r) +
    Math.abs(a.q + a.r - b.q - b.r)) /
  2;
export const neighbors = (cell) =>
  DIRECTIONS.map(([q, r]) => ({ q: cell.q + q, r: cell.r + r }));
export const within = (map, cell) =>
  cell.q >= map.qMin &&
  cell.q <= map.qMax &&
  cell.r >= map.rMin &&
  cell.r <= map.rMax &&
  Math.abs(cell.q + cell.r) <= map.diagonalLimit;
export function cells(map) {
  const out = [];
  for (let q = map.qMin; q <= map.qMax; q++)
    for (let r = map.rMin; r <= map.rMax; r++)
      if (within(map, { q, r })) out.push({ q, r });
  return out;
}
export const point = (cell, size = 1) => ({
  x: Math.sqrt(3) * size * (cell.q + cell.r / 2),
  y: 1.5 * size * cell.r,
});
export function roundHex(q, r) {
  const s = -q - r;
  let rq = Math.round(q),
    rr = Math.round(r),
    rs = Math.round(s);
  const dq = Math.abs(rq - q),
    dr = Math.abs(rr - r),
    ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}
export function fromPoint(x, y, size = 1) {
  return roundHex(((Math.sqrt(3) * x) / 3 - y / 3) / size, (2 * y) / 3 / size);
}
export function line(a, b) {
  const n = distance(a, b);
  if (!n) return [{ q: a.q, r: a.r }];
  return Array.from({ length: n + 1 }, (_, i) =>
    roundHex(
      (a.q * (n - i) + b.q * i) / n + 1e-6,
      (a.r * (n - i) + b.r * i) / n + 1e-6,
    ),
  );
}
