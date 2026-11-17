import { random } from "./rng.js";
import { cells, distance, key } from "./hex.js";
import { nearby, walkable } from "./terrain.js";
import { UNIT_TYPES, TEAMS } from "./units.js";

export const SCENARIOS = [
  {
    id: "contact",
    name: "First Contact",
    tag: "4 v 4 · Infantry",
    description:
      "A short-range engagement. Select your squad, focus fire and keep wounded units safe.",
    terrain: "open",
    forces: {
      blue: ["rifle", "rifle", "rifle", "rifle"],
      orange: ["rifle", "rifle", "rifle", "rifle"],
    },
  },
  {
    id: "mixed",
    name: "Combined Arms",
    tag: "6 v 8 · Mixed forces",
    description:
      "A smaller mixed squad faces a larger rifle force. Use armor and range together.",
    terrain: "cover",
    forces: {
      blue: ["rifle", "rifle", "rifle", "heavy", "marksman", "marksman"],
      orange: Array(8).fill("rifle"),
    },
  },
  {
    id: "crossfire",
    name: "Crossfire Ridge",
    tag: "8 v 8 · High ground",
    description:
      "Woodland reduces incoming damage. Elevated tiles extend firing range against lower ground.",
    terrain: "ridge",
    forces: {
      blue: [
        "rifle",
        "rifle",
        "rifle",
        "rifle",
        "heavy",
        "heavy",
        "marksman",
        "marksman",
      ],
      orange: [
        "rifle",
        "rifle",
        "rifle",
        "rifle",
        "heavy",
        "heavy",
        "marksman",
        "marksman",
      ],
    },
  },
  {
    id: "pass",
    name: "Broken Pass",
    tag: "5 v 7 · Chokepoints",
    description:
      "Rock formations block movement and sight. Find firing angles around the central pass.",
    terrain: "pass",
    forces: {
      blue: ["heavy", "heavy", "rifle", "marksman", "marksman"],
      orange: [
        "rifle",
        "rifle",
        "rifle",
        "rifle",
        "rifle",
        "heavy",
        "marksman",
      ],
    },
  },
  {
    id: "triad",
    name: "Three-Way Standoff",
    tag: "6 v 6 v 6 · Free-for-all",
    description:
      "Three hostile factions share the field. Survive the crossfire and choose when to engage.",
    terrain: "triad",
    forces: {
      blue: ["rifle", "rifle", "rifle", "heavy", "marksman", "marksman"],
      orange: ["rifle", "rifle", "rifle", "heavy", "marksman", "marksman"],
      violet: ["rifle", "rifle", "rifle", "heavy", "marksman", "marksman"],
    },
  },
  {
    id: "asymmetric",
    name: "Uneven Front",
    tag: "5 v 7 v 6 · Free-for-all",
    description:
      "Unequal forces, no allies. A compact long-range squad faces two different enemy compositions.",
    terrain: "triad",
    forces: {
      blue: ["rifle", "rifle", "heavy", "marksman", "marksman"],
      orange: ["rifle", "rifle", "rifle", "rifle", "rifle", "rifle", "heavy"],
      violet: ["rifle", "rifle", "rifle", "heavy", "heavy", "marksman"],
    },
  },
];

export function createScenario(id = "contact", seed = 26) {
  const spec = SCENARIOS.find((s) => s.id === id);
  if (!spec) throw new Error("Unknown battlefield");
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 9999999)
    throw new Error("Seed must be an integer from 0 to 9999999");
  const rng = random(seed),
    teams = Object.keys(spec.forces),
    map = {
      qMin: -9,
      qMax: 9,
      rMin: -6,
      rMax: 6,
      diagonalLimit: 11,
      terrain: {},
    };
  const anchors =
    teams.length === 3
      ? {
          blue: { q: -6, r: 3 },
          orange: { q: 4, r: 2 },
          violet: { q: 1, r: -5 },
        }
      : { blue: { q: -5, r: 1 }, orange: { q: 4, r: -1 } };
  if (id === "contact") {
    anchors.blue = { q: -3, r: 0 };
    anchors.orange = { q: 3, r: 0 };
  }
  if (spec.terrain !== "open") {
    for (const [q, r] of [
      [-2, 0],
      [-2, 1],
      [2, 0],
      [2, -1],
      [-3, 3],
      [3, -3],
    ])
      map.terrain[key({ q, r })] = "forest";
    for (const [q, r] of [
      [-1, -2],
      [0, -2],
      [1, 2],
      [2, 2],
    ])
      map.terrain[key({ q, r })] = "hill";
    if (["ridge", "pass", "triad"].includes(spec.terrain))
      for (const [q, r] of [
        [0, -3],
        [0, -2],
        [0, 2],
        [0, 3],
        [1, 3],
        [-1, -3],
      ])
        map.terrain[key({ q, r })] = "rock";
    if (spec.terrain === "triad") {
      map.terrain["0,0"] = "rock";
      map.terrain["1,-1"] = "rock";
    }
    for (const cell of cells(map))
      if (
        !map.terrain[key(cell)] &&
        Math.abs(cell.q) < 4 &&
        Math.abs(cell.r) < 4 &&
        rng() < 0.14
      )
        map.terrain[key(cell)] = rng() < 0.7 ? "forest" : "hill";
  }
  for (const cell of cells(map))
    if (Object.values(anchors).some((a) => distance(a, cell) <= 2))
      delete map.terrain[key(cell)];
  const occupied = new Set(),
    units = [];
  for (const team of teams) {
    const locations = nearby(map, anchors[team]).filter(
      (cell) => !occupied.has(key(cell)),
    );
    spec.forces[team].forEach((type, index) => {
      const cell = locations[index];
      if (!cell || !walkable(map, cell)) throw new Error("Invalid deployment");
      occupied.add(key(cell));
      units.push({ id: `${team}-${index + 1}`, team, type, ...cell });
    });
  }
  return {
    version: "hex-skirmish-v1",
    id,
    seed,
    name: spec.name,
    tag: spec.tag,
    description: spec.description,
    map,
    teams: teams.map((id) => ({ ...TEAMS[id] })),
    units,
    duration: 90,
    unitTypes: structuredClone(UNIT_TYPES),
  };
}

export function validateScenario(scenario) {
  if (
    !Array.isArray(scenario.teams) ||
    ![2, 3].includes(scenario.teams.length) ||
    new Set(scenario.teams.map((team) => team.id)).size !==
      scenario.teams.length ||
    scenario.teams.some((team) => !Object.hasOwn(TEAMS, team.id))
  )
    throw new Error(
      "A battlefield requires two or three distinct supported factions",
    );
  if (
    !Number.isFinite(scenario.duration) ||
    scenario.duration <= 0 ||
    scenario.duration > 3600
  )
    throw new Error("Battle duration must be between 0 and 3600 seconds");
  if (
    !Array.isArray(scenario.units) ||
    !scenario.units.length ||
    new Set(scenario.units.map((unit) => unit.id)).size !==
      scenario.units.length
  )
    throw new Error("Unit IDs must be unique");
  const teamIds = new Set(scenario.teams.map((team) => team.id));
  for (const unit of scenario.units)
    if (
      !Object.hasOwn(UNIT_TYPES, unit.type) ||
      !teamIds.has(unit.team) ||
      !Number.isInteger(unit.q) ||
      !Number.isInteger(unit.r) ||
      !walkable(scenario.map, unit)
    )
      throw new Error(
        "Every unit needs a valid type, faction and traversable deployment tile",
      );
  if (new Set(scenario.units.map(key)).size !== scenario.units.length)
    throw new Error("Units cannot share a deployment tile");
  if (
    scenario.teams.some(
      (team) => !scenario.units.some((unit) => unit.team === team.id),
    )
  )
    throw new Error("Every faction must have at least one unit");
  return true;
}
