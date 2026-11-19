export function squadFeatureTable(config, scenario) {
  const factions = scenario.teams.map(({ id }) => id);
  return {
    id: "skirmish", name: "Squad Tactics", scenarioId: config.scenarioId,
    rows: [
      { dimension: "Space", element: "Positions · hex cells and terrain", operations: [
        { id: "squad.position.move", op: "move", actor: "Unit's faction", phase: "Engagement", condition: "Traversable destination and movement rules",
          effect: "Move a living unit between cells.", binding: { kind: "locator", entity: "unit", grid: "axial-hex" } },
        { id: "squad.geometry", op: "fixed", actor: "Scenario", phase: "Whole episode", effect: "Terrain defines cover, traversal and sight.",
          binding: { kind: "geometry", grid: "axial-hex", entities: ["unit", "terrain"] } },
      ] },
      { dimension: "Players", element: `${factions.length} opposing factions`, operations: [
        { id: "squad.actors", op: "fixed", actor: "Scenario", phase: "Whole episode", effect: "Each faction controls its own units and issues its own orders.",
          binding: { kind: "actors", model: "factions", count: factions.length, factions } },
      ] },
      { dimension: "Time", element: "Real-time engagement", operations: [
        { id: "squad.clock", op: "fixed", actor: "Simulator", phase: "Engagement", effect: "The battle uses fixed 0.1-second ticks. Factions issue orders during the engagement.",
          binding: { kind: "clock", mode: "real-time", unit: "0.1 s", pausable: true } },
      ] },
      { dimension: "Resources", element: "Health points and active units", operations: [
        { id: "squad.health.damage", op: "remove", actor: "Opposing faction", phase: "Engagement", condition: "Valid resolved hit",
          effect: "Deduct HP. A unit at zero HP leaves the set of active units.",
          binding: { kind: "invariant", rule: "resolve-damage" } },
        { id: "squad.health.restore", op: "add", actor: "External resource adapter", phase: "Engagement", condition: "Living wounded unit inside the service area",
          effect: "An optional location-based hook restores HP up to the unit's maximum.",
          binding: { kind: "consumer", resource: "health", access: "faction-local", adaptable: true, divisible: true, hook: "local-health" } },
        { id: "squad.health.cap", op: "fixed", actor: "Engine", phase: "Engagement", effect: "Maximum HP is set by unit type." },
      ] },
    ],
  };
}
