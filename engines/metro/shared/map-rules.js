/** A terrain adapter is independent of map rendering and path finding. */
export const defaultMapRules = {
  id: "plain-and-capabilities-v1",
  canBuildStation(cell) {
    return cell.terrain !== "blocked" && cell.terrain !== "river";
  },
  canTraverse(from, to, context = {}) {
    if (to.terrain === "blocked") return false;
    const required =
      to.requires ??
      (to.terrain === "river"
        ? ["bridge"]
        : to.terrain === "mountain"
          ? ["tunnel"]
          : []);
    return required.every((x) => (context.capabilities ?? []).includes(x));
  },
  traversalCost(from, to) {
    return Math.max(1, to.cost ?? 1);
  },
};
export function cellAt(map, key) {
  const [q, r] = key.split(",").map(Number);
  return { q, r, terrain: "plain", ...(map.terrain?.[key] ?? {}) };
}
