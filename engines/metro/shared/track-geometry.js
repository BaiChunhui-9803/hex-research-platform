import { findPath, key } from "./hex.js";
import { defaultMapRules } from "./map-rules.js";

export const SIMPLE_TRACKS = "simple";
export const LEGACY_TRACKS = "legacy";
export const requiresSimpleTrack = (scenario) => scenario.trackTopology !== LEGACY_TRACKS;

/** A physical segment has the same geometry when the line is read from either endpoint. */
export function trackSegment(scenario, from, to, rules = defaultMapRules) {
  const reversed = requiresSimpleTrack(scenario) && from.id > to.id;
  const path = findPath(scenario.map, reversed ? to : from, reversed ? from : to, scenario.resources, rules);
  return reversed && path ? path.reverse() : path;
}

export const trackCell = ({ q, r }) => key(q, r);
export function reusedTrackCell(path, occupied) {
  // Consecutive legs meet exactly once at their shared stop.
  for (let i = 1; i < path.length; i++)
    if (occupied.has(trackCell(path[i]))) return path[i];
  return null;
}

export function traceTrackLine(scenario, stations, rules = defaultMapRules) {
  const occupied = requiresSimpleTrack(scenario) && stations.length
    ? new Set([trackCell(stations[0])]) : null;
  const segments = [];
  let length = 0;
  for (let i = 1; i < stations.length; i++) {
    const from = stations[i - 1], to = stations[i];
    const cells = trackSegment(scenario, from, to, rules);
    if (!cells) return { segments, length, issue: { from, to } };
    const conflict = occupied && reusedTrackCell(cells, occupied);
    if (conflict) return { segments, length, issue: { from, to, conflict } };
    if (occupied) for (let j = 1; j < cells.length; j++) occupied.add(trackCell(cells[j]));
    const edges = cells.length - 1;
    length += edges;
    segments.push({ from: from.id, to: to.id, cells, length: edges, duration: edges * scenario.resources.minutesPerHex });
  }
  return { segments, length, issue: null };
}
