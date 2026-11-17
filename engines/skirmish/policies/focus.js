import { focusTarget } from "./helpers.js";
export default {
  id: "focus",
  name: "Focus fire",
  description:
    "Concentrate the squad on one target, balancing distance, health and threat.",
  decide(observation) {
    if (!observation.own.length || !observation.enemies.length) return [];
    return [
      {
        unitIds: observation.own.map((unit) => unit.id),
        type: "attack",
        targetId: focusTarget(observation).id,
      },
    ];
  },
};
