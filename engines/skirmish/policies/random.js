import { neighbors, key } from "../shared/hex.js";
import { walkable } from "../shared/terrain.js";
import { occupied } from "./helpers.js";
export default {
  id: "random",
  name: "Random orders",
  description:
    "A deliberately simple reference: alternate random nearby movement and enemy targeting.",
  decide(observation, context) {
    if (!observation.enemies.length) return [];
    return observation.own
      .filter((unit) => !unit.move)
      .map((unit) => {
        const busy = occupied(observation, unit.id),
          moves = neighbors(unit).filter(
            (cell) => walkable(observation.map, cell) && !busy.has(key(cell)),
          );
        if (moves.length && context.random() < 0.45)
          return {
            unitIds: [unit.id],
            type: "move",
            target: moves[Math.floor(context.random() * moves.length)],
          };
        return {
          unitIds: [unit.id],
          type: "attack",
          targetId:
            observation.enemies[
              Math.floor(context.random() * observation.enemies.length)
            ].id,
        };
      });
  },
};
