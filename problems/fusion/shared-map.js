import { scenarioAt } from "../../engines/metro/shared/scenarios.js";
import { createState } from "../../engines/metro/shared/simulation.js";
import { greedyPlan } from "../../engines/metro/algorithms/greedy.js";
import { createBattle } from "../../engines/skirmish/shared/battle.js";
import { key, within } from "../../engines/skirmish/shared/hex.js";
import { metro } from "../metro/index.js";
import { buildMetroScenario } from "../metro/scenario.js";
import { skirmish } from "../skirmish/index.js";
import { buildSquadScenario } from "../skirmish/scenario.js";

export function createSharedParts(children, config = {}) {
  const rail = buildMetroScenario(children.metro);
  const squad = buildSquadScenario(children.skirmish);
  const q = config.squadOffsetQ ?? 0;
  const r = config.squadOffsetR ?? 0;
  const translate = ({ q: column, r: row, ...rest }) => ({ ...rest, q: column + q, r: row + r });
  if (q || r) {
    squad.units = squad.units.map(translate);
    squad.map = {
      qMin: squad.map.qMin + q, qMax: squad.map.qMax + q,
      rMin: squad.map.rMin + r, rMax: squad.map.rMax + r,
      diagonalLimit: squad.map.diagonalLimit + Math.abs(q + r),
      terrain: Object.fromEntries(Object.entries(squad.map.terrain).map(([cell, value]) => {
        const [column, row] = cell.split(",").map(Number);
        return [key(translate({ q: column, r: row })), value];
      })),
    };
  }
  const bounds = {
    qMin: Math.min(rail.map.qMin, squad.map.qMin),
    qMax: Math.max(rail.map.qMax, squad.map.qMax),
    rMin: Math.min(rail.map.rMin, squad.map.rMin),
    rMax: Math.max(rail.map.rMax, squad.map.rMax),
    diagonalLimit: Math.max(rail.map.diagonalLimit, squad.map.diagonalLimit),
  };
  const protectedCells = new Set([...rail.stations, ...squad.units].map(key));
  const terrain = { ...squad.map.terrain };
  for (const [cell, info] of Object.entries(rail.map.terrain)) {
    if (info.terrain === "blocked" || info.terrain === "mountain") terrain[cell] = "rock";
    if (info.terrain === "river") terrain[cell] = "water";
  }
  const protectedChanges = [];
  for (const cell of protectedCells) {
    if (["rock", "water"].includes(terrain[cell])) {
      protectedChanges.push(cell);
      delete terrain[cell];
    }
  }
  if (![...rail.stations, ...squad.units].every((cell) => within(bounds, cell)))
    throw new Error("Station or deployment outside the shared axial grid");
  squad.map = { ...bounds, terrain };
  squad.duration = children.skirmish.horizon;
  rail.map = {
    ...bounds,
    terrain: Object.fromEntries(
      Object.entries(terrain).map(([cell, kind]) => [cell, {
        terrain: ["rock", "water"].includes(kind) ? "blocked" : kind,
      }]),
    ),
  };
  const opening = scenarioAt(rail, 0);
  const transit = createState(rail, greedyPlan({ scenario: opening }), {
    seed: children.metro.seed,
    horizon: children.metro.horizon,
    editBudget: rail.dynamic ? children.metro.editBudget : null,
  });
  const battle = createBattle(squad, {
    controllers: Object.fromEntries(squad.teams.map(({ id }) => [
      id, id === children.skirmish.team ? "human" : children.skirmish.opponent,
    ])),
  });
  const parts = { metro: metro.create(children.metro, transit), skirmish: skirmish.create(children.skirmish, { state: battle }) };
  return {
    parts,
    layout: { bounds, protectedChanges: protectedChanges.sort(), squadOffset: { q, r } },
    geometry: {
      stations: opening.stations,
      segments: Object.values(transit.network.paths).flat().map(({ cells }) => cells),
      units: squad.units,
    },
    capabilities: {
      sharedAxialGrid: true,
      viableTrackPlan: transit.network.valid,
      segmentDispatch: typeof parts.metro.advanceLocal === "function",
      stationArrivals: typeof parts.metro.advanceLocal === "function",
      livingPositions: typeof parts.skirmish.livingCells === "function",
      localHealing: typeof parts.skirmish.restoreHealth === "function",
    },
  };
}
