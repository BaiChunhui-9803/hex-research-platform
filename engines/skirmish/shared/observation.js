import { living } from "./battle.js";
import { UNIT_TYPES } from "./units.js";

/** Open-information benchmark: no fog of war and no hidden engine references. */
export function observe(state, team) {
  const units = living(state).map((unit) => structuredClone(unit));
  return {
    version: state.version,
    team,
    time: state.time,
    tick: state.tick,
    map: structuredClone(state.scenario.map),
    unitTypes: structuredClone(UNIT_TYPES),
    own: units.filter((unit) => unit.team === team),
    enemies: units
      .filter((unit) => unit.team !== team)
      .map(({ order, targetId, ...unit }) => unit),
  };
}
