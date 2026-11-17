import { compatibility } from "../core/registry.js";
export const objectiveLabels = {
  single: "Single-objective optimization",
  multi: "Multiobjective optimization",
  control: "Online control strategies",
};
export function filterMethods(methods, filter = {}, capabilities = null) {
  const query = (filter.query ?? "").trim().toLowerCase();
  return methods.filter(
    (method) =>
      (!filter.objective || method.objective === filter.objective) &&
      (!filter.category || method.category === filter.category) &&
      (!filter.family || method.family === filter.family) &&
      (!filter.variant || method.variant === filter.variant) &&
      (!query ||
        [
          method.name,
          method.id,
          method.description,
          method.category,
          method.family,
          method.variant,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)) &&
      (!filter.compatibleOnly ||
        !capabilities ||
        compatibility(method, capabilities).compatible),
  );
}
export function taxonomyOptions(methods, filter = {}, capabilities = null) {
  const values = (rows, key) =>
    [...new Set(rows.map((m) => m[key]).filter(Boolean))].sort();
  return {
    categories: values(
      filterMethods(
        methods,
        { objective: filter.objective, compatibleOnly: filter.compatibleOnly },
        capabilities,
      ),
      "category",
    ),
    families: values(
      filterMethods(
        methods,
        {
          objective: filter.objective,
          category: filter.category,
          compatibleOnly: filter.compatibleOnly,
        },
        capabilities,
      ),
      "family",
    ),
    variants: values(
      filterMethods(
        methods,
        {
          objective: filter.objective,
          category: filter.category,
          family: filter.family,
          compatibleOnly: filter.compatibleOnly,
        },
        capabilities,
      ),
      "variant",
    ),
  };
}
