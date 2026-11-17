import { distance, neighbors, key } from "../shared/hex.js";
import { walkable, terrainAt } from "../shared/terrain.js";
import { UNIT_TYPES } from "../shared/units.js";
import { closestEnemy, focusTarget, occupied } from "./helpers.js";
export default {
  id: "kite",
  name: "Kite & focus",
  description:
    "Focus fire, then use weapon cooldown windows to create distance with ranged units.",
  decide(observation) {
    if (!observation.own.length || !observation.enemies.length) return [];
    const target = focusTarget(observation),
      orders = [],
      claimed = new Set();
    for (const unit of observation.own) {
      if (unit.move) continue;
      const nearest = closestEnemy(observation, unit),
        stats = UNIT_TYPES[unit.type];
      if (
        stats.range > 1 &&
        unit.cooldown > 1 &&
        distance(unit, nearest) <= stats.range
      ) {
        const busy = occupied(observation, unit.id);
        const score = (cell) =>
          Math.min(
            ...observation.enemies.map((enemy) => distance(cell, enemy)),
          ) -
          distance(cell, target) * 0.12 +
          (terrainAt(observation.map, cell).cover < 1 ? 0.25 : 0);
        const moves = neighbors(unit)
          .filter(
            (cell) =>
              walkable(observation.map, cell) &&
              !busy.has(key(cell)) &&
              !claimed.has(key(cell)),
          )
          .sort((a, b) => score(b) - score(a) || key(a).localeCompare(key(b)));
        if (moves.length && score(moves[0]) > score(unit) + 0.1) {
          claimed.add(key(moves[0]));
          orders.push({ unitIds: [unit.id], type: "move", target: moves[0] });
          continue;
        }
      }
      orders.push({ unitIds: [unit.id], type: "attack", targetId: target.id });
    }
    return orders;
  },
};
