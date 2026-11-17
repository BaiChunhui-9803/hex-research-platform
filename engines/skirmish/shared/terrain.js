import { key, within, line, cells, distance } from "./hex.js";
export const TERRAIN = {
  plain: {
    name: "Open ground",
    walkable: true,
    blocksSight: false,
    moveCost: 1,
    cover: 1,
    height: 0,
  },
  forest: {
    name: "Woodland cover",
    walkable: true,
    blocksSight: false,
    moveCost: 1.35,
    cover: 0.75,
    height: 0,
  },
  hill: {
    name: "High ground",
    walkable: true,
    blocksSight: false,
    moveCost: 1.1,
    cover: 1,
    height: 1,
  },
  rock: {
    name: "Rock formation",
    walkable: false,
    blocksSight: true,
    moveCost: Infinity,
    cover: 1,
    height: 2,
  },
  water: {
    name: "Deep water",
    walkable: false,
    blocksSight: false,
    moveCost: Infinity,
    cover: 1,
    height: 0,
  },
};
export const terrainAt = (map, cell) =>
  TERRAIN[map.terrain[key(cell)] ?? "plain"] ?? TERRAIN.plain;
export const walkable = (map, cell) =>
  within(map, cell) && terrainAt(map, cell).walkable;
export const lineOfSight = (map, a, b) =>
  line(a, b)
    .slice(1, -1)
    .every((cell) => !terrainAt(map, cell).blocksSight);
export function nearby(map, center) {
  return cells(map)
    .filter((cell) => walkable(map, cell))
    .sort(
      (a, b) =>
        distance(a, center) - distance(b, center) || a.q - b.q || a.r - b.r,
    );
}
