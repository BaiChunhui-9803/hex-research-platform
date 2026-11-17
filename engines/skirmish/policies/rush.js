import { closestEnemy } from "./helpers.js";
export default {
  id: "rush",
  name: "Attack-move",
  description:
    "Advance toward the nearest enemy and let each unit acquire targets locally.",
  decide(observation) {
    if (!observation.own.length || !observation.enemies.length) return [];
    const enemy = closestEnemy(observation, observation.own[0]);
    return [
      {
        unitIds: observation.own.map((unit) => unit.id),
        type: "attackMove",
        target: { q: enemy.q, r: enemy.r },
      },
    ];
  },
};
