import { requiresSimpleTrack } from "../../engines/metro/shared/track-geometry.js";

export function metroFeatureTable(config, scenario) {
  const editPhase = scenario.dynamic ? "Planning / scheduled replans" : "Opening plan";
  const simple = requiresSimpleTrack(scenario);
  return {
    id: "metro", name: "Metro Network", scenarioId: config.scenarioId,
    rows: [
      { dimension: "Space", element: "Stations · points on a hex grid", operations: [
        { id: "rail.station.geometry", op: "fixed", actor: "Scenario", phase: "Whole episode", effect: "Station positions and destination shapes are set by the scenario.",
          binding: { kind: "geometry", grid: "axial-hex", entities: ["station", "track"] } },
        ...(scenario.dynamic ? [{ id: "rail.station.open", op: "change", actor: "Simulator", phase: "Scheduled opening",
          condition: "Station opening time has arrived", effect: "An existing station becomes available for routing." }] : []),
      ] },
      { dimension: "Space", element: "Routes · ordered stops and track edges", operations: [
        { id: "rail.route.add", op: "add", actor: "Planner", phase: editPhase,
          condition: "Active stops, traversable path, enough track budget", effect: "Add a railway connection between two stations.",
          binding: { kind: "write-track", authority: "single-writer", hook: "add-station-link", adaptable: true } },
        { id: "rail.route.remove", op: "remove", actor: "Planner", phase: editPhase, effect: "Remove stops or connections from a line." },
        { id: "rail.route.change", op: "change", actor: "Planner", phase: editPhase, effect: "Reorder stops within a legal plan." },
      ] },
      { dimension: "Players", element: "Single planning role", operations: [
        { id: "rail.actors", op: "fixed", actor: "Scenario", phase: editPhase, effect: "One role owns the right to commit a plan. Fusion may adapt that write authority.",
          binding: { kind: "actors", model: "single-planner", count: 1 } },
      ] },
      { dimension: "Time", element: "Minute-based service", operations: [
        { id: "rail.clock", op: "fixed", actor: "Simulator", phase: "Service", effect: "Service advances in one-minute ticks after a plan is available.",
          binding: { kind: "clock", mode: "service-ticks", unit: "min", pausable: true } },
      ] },
      { dimension: "Resources", element: "Passengers and station deliveries", operations: [
        { id: "rail.passenger.spawn", op: "add", actor: "Simulator", phase: "Service", effect: "Generate passengers at open stations." },
        { id: "rail.passenger.travel", op: "change", actor: "Simulator", phase: "Service", effect: "Passengers queue, board trains and transfer." },
        { id: "rail.passenger.delivered", op: "remove", actor: "Simulator", phase: "Service", condition: "Train reaches a stop that satisfies the destination shape",
          effect: "Complete the trip and emit a delivery attributed to the destination station.",
          binding: { kind: "producer", event: "station-arrival", location: "station" } },
      ] },
      { dimension: "Resources", element: "Track and train capacity", operations: [
        { id: "rail.constraints", op: "fixed", actor: "Engine", phase: "Each plan commit", effect: `Validate path geometry, ${scenario.resources.trackBudget} track edges, and ${scenario.resources.maxStopsPerLine} stops per line.`,
          binding: { kind: "invariant", rule: "validate-track-plan" } },
        ...(simple ? [{ id: "rail.track.simple", op: "fixed", actor: "Engine", phase: "Each plan commit",
          condition: "Check the full sequence of routed hex cells per line",
          effect: "Each line occupies a simple path: an already traversed hex cannot be visited again.",
          binding: { kind: "invariant", rule: "simple-track-path" } }] : []),
        ...(scenario.dynamic ? [{ id: "rail.edit.cost", op: "remove", actor: "Planner", phase: "Replanning", effect: "A later route change debits the remaining edit budget." }] : []),
      ] },
    ],
  };
}
