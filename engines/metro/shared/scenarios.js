import { stationNames } from "./catalogs/names.en.js";
import { random, shuffle } from "./rng.js";
import { distance } from "./hex.js";
export const SHAPES = ["circle", "triangle", "square"];
export const LINE_IDS = ["A", "B", "C"];
export const SCENARIOS = [
  {
    id: "compact",
    name: "First Connections",
    subtitle: "A compact six-station puzzle. Build an efficient network.",
    label: "01 · First Connections · 6 stations",
    demandMultiplier: 0.8,
    stationIds: [0, 1, 2, 5, 6, 9],
    trackBudget: 60,
  },
  {
    id: "lumen",
    name: "Lumen City",
    subtitle: "One city. Three destination types.",
    label: "02 · Lumen City · 12 stations",
    demandMultiplier: 1,
  },
  {
    id: "rush",
    name: "Lumen City · Rush Hour",
    subtitle: "Keep the city moving through rush hour.",
    label: "03 · Rush Hour · Heavy demand",
    demandMultiplier: 1.55,
  },
  {
    id: "growth",
    name: "Growing City",
    subtitle: "Start with 6 stations. Three more open at minutes 60 and 120.",
    label: "04 · Growing City · 6 → 9 → 12",
    demandMultiplier: 1,
    dynamic: true,
  },
  {
    id: "growth-rush",
    name: "Growth under Pressure",
    subtitle:
      "A growing network with heavier demand and a limited edit budget.",
    label: "05 · Growth under Pressure · 6 → 9 → 12",
    demandMultiplier: 1.55,
    dynamic: true,
  },
];
const POSITIONS = [
  [-6, -2],
  [-2, -3],
  [3, -3],
  [6, -2],
  [-7, 1],
  [-3, 0],
  [0, 0],
  [4, 0],
  [-5, 3],
  [-1, 3],
  [2, 3],
  [6, 2],
];
const NAMES = stationNames(POSITIONS.length);
const TYPES = [
  "circle",
  "triangle",
  "square",
  "circle",
  "triangle",
  "circle",
  "square",
  "triangle",
  "square",
  "circle",
  "triangle",
  "circle",
];
export function createScenario(id = "lumen", seed = 26) {
  const spec = SCENARIOS.find((x) => x.id === id);
  if (!spec) throw new Error("Unknown city");
  const rng = random(seed),
    variant = seed === 26 ? [...TYPES] : shuffle(TYPES, rng);
  const positions = POSITIONS.map(([q, r]) => ({ q, r }));
  if (seed !== 26) {
    for (let i = 0; i < positions.length; i++) {
      const candidate = {
        q: positions[i].q + Math.floor(rng() * 3) - 1,
        r: positions[i].r + Math.floor(rng() * 3) - 1,
      };
      if (
        positions.every(
          (other, j) => j === i || distance(candidate, other) >= 2,
        )
      ) {
        positions[i] = candidate;
      }
    }
  }
  let stations = positions.map(({ q, r }, i) => ({
    id: `s${i}`,
    name: NAMES[i],
    q,
    r,
    shape: variant[i],
    demand: 0.7 + rng() * 0.6,
  }));
  if (spec.stationIds)
    stations = stations.filter((s) =>
      spec.stationIds.includes(Number(s.id.slice(1))),
    );
  if (spec.stationIds)
    for (const shape of SHAPES) {
      if (!stations.some((s) => s.shape === shape)) {
        const target = stations.find(
          (s) => stations.filter((other) => other.shape === s.shape).length > 1,
        );
        target.shape = shape;
      }
    }
  if (spec.dynamic) {
    const initial = new Set(["s0", "s1", "s4", "s5", "s6", "s8"]);
    const second = new Set(["s2", "s9", "s10"]);
    for (const s of stations)
      s.opensAt = initial.has(s.id) ? 0 : second.has(s.id) ? 60 : 120;
    // Every initial network has all three destination types, without hidden nodes.
    for (const shape of SHAPES) {
      if (!stations.some((s) => s.opensAt === 0 && s.shape === shape)) {
        const counts = Object.fromEntries(
          SHAPES.map((x) => [
            x,
            stations.filter((s) => s.opensAt === 0 && s.shape === x).length,
          ]),
        );
        const target = stations.find(
          (s) => s.opensAt === 0 && counts[s.shape] > 1,
        );
        const other = stations.find((s) => s.opensAt > 0 && s.shape === shape);
        [target.shape, other.shape] = [other.shape, target.shape];
      }
    }
  }
  return {
    version: "hex-metro-v2",
    id,
    seed,
    name: spec.name,
    subtitle: spec.subtitle,
    dynamic: Boolean(spec.dynamic),
    horizon: 180,
    map: {
      qMin: -10,
      qMax: 10,
      rMin: -6,
      rMax: 6,
      diagonalLimit: 12,
      terrain: {},
    },
    stations,
    resources: {
      maxLines: 3,
      maxStopsPerLine: 7,
      trackBudget: spec.trackBudget ?? 100,
      trainCapacity: 6,
      minutesPerHex: 1.5,
      dwellMinutes: 1,
      platformCapacity: 20,
      capabilities: [],
    },
    demandMultiplier: spec.demandMultiplier,
    editBudget: spec.dynamic ? 60 : null,
  };
}
export function scenarioAt(scenario, time = 0) {
  return {
    ...scenario,
    stations: scenario.stations.filter((s) => (s.opensAt ?? 0) <= time),
  };
}
export function starterPlan(scenario = null) {
  const plan = {
    lines: [
      { id: "A", stops: ["s0", "s5", "s6", "s7", "s3"] },
      { id: "B", stops: ["s4", "s5", "s8", "s9", "s10"] },
      { id: "C", stops: ["s1", "s2", "s6", "s10", "s11"] },
    ],
  };
  if (scenario) {
    const active = new Set(scenarioAt(scenario, 0).stations.map((s) => s.id));
    for (const line of plan.lines)
      line.stops = line.stops.filter((id) => active.has(id));
  }
  return plan;
}
export const emptyPlan = () => ({
  lines: LINE_IDS.map((id) => ({ id, stops: [] })),
});
