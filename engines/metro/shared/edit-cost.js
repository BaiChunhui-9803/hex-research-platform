/** An explicit planning-effort proxy, separate from physical track length. */
export const EDIT_COST_VERSION = "line-stop-link-v1";
export function canonicalStops(stops) {
  const forward = stops.join("/"),
    backward = [...stops].reverse().join("/");
  return forward < backward ? forward : backward;
}
function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length];
}
const connectionSet = (stops) =>
  new Set(stops.slice(1).map((id, i) => [stops[i], id].sort().join("/")));
const difference = (a, b) => [...a].filter((x) => !b.has(x)).length;
export function emptyEditStats() {
  return {
    editUnits: 0,
    editOperations: 0,
    changedLines: 0,
    stopEdits: 0,
    addedLinks: 0,
    removedLinks: 0,
  };
}
export function planChange(before, after) {
  const result = emptyEditStats();
  for (const line of after.lines) {
    const old = before.lines.find((x) => x.id === line.id)?.stops ?? [];
    if (canonicalStops(old) === canonicalStops(line.stops)) continue;
    const previous = connectionSet(old),
      next = connectionSet(line.stops);
    result.changedLines++;
    result.stopEdits += Math.min(
      editDistance(old, line.stops),
      editDistance(old, [...line.stops].reverse()),
    );
    result.addedLinks += difference(next, previous);
    result.removedLinks += difference(previous, next);
  }
  result.editUnits =
    result.changedLines +
    result.stopEdits +
    result.addedLinks +
    result.removedLinks;
  result.editOperations = result.editUnits > 0 ? 1 : 0;
  return result;
}
export function totalEditStats(a, b) {
  return Object.fromEntries(
    Object.keys(emptyEditStats()).map((key) => [
      key,
      (a[key] ?? 0) + (b[key] ?? 0),
    ]),
  );
}
