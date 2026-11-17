import { distance, key } from "../shared/hex.js";
import { terrainAt, lineOfSight } from "../shared/terrain.js";
import { UNIT_TYPES } from "../shared/units.js";
export const closestEnemy = (observation, unit) =>
  [...observation.enemies].sort(
    (a, b) =>
      distance(unit, a) - distance(unit, b) ||
      a.hp - b.hp ||
      a.id.localeCompare(b.id),
  )[0];
export function focusTarget(observation) {
  const rank = (enemy) =>
    (observation.own.reduce((n, unit) => n + distance(unit, enemy), 0) /
      Math.max(1, observation.own.length)) *
      2 +
    enemy.hp * 0.06 -
    UNIT_TYPES[enemy.type].damage * 0.05;
  return [...observation.enemies].sort(
    (a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id),
  )[0];
}
export const occupied = (observation, ignore) =>
  new Set(
    [...observation.own, ...observation.enemies]
      .filter((unit) => unit.id !== ignore)
      .flatMap((unit) => [
        key(unit),
        ...(unit.move ? [key(unit.move.to)] : []),
      ]),
  );
export const canShoot = (observation, unit, enemy) =>
  distance(unit, enemy) <=
    UNIT_TYPES[unit.type].range +
      (terrainAt(observation.map, unit).height >
      terrainAt(observation.map, enemy).height
        ? 1
        : 0) && lineOfSight(observation.map, unit, enemy);
