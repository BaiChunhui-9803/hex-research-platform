/** Normalize four real parameters and two thresholded controller switches. */
export function controllerVectorTask(native, bounds) {
  const names = Object.keys(bounds),
    start = native.initial(() => 0.5);
  const decode = (vector) => ({
    focus: vector[0] >= 0.5,
    kite: vector[1] >= 0.5,
    ...Object.fromEntries(
      names.map((name, i) => [
        name,
        bounds[name][0] + vector[i + 2] * (bounds[name][1] - bounds[name][0]),
      ]),
    ),
  });
  return {
    protocol: "vector-optimization/v1",
    dimension: names.length + 2,
    encoding:
      "Six normalized controller parameters; two switches use a 0.5 threshold",
    objectiveSchema: native.objectiveSchema,
    initial: () => [
      start.focus ? 0.75 : 0.25,
      start.kite ? 0.75 : 0.25,
      ...names.map(
        (name) =>
          (start[name] - bounds[name][0]) / (bounds[name][1] - bounds[name][0]),
      ),
    ],
    decode,
    evaluate(vector) {
      const result = native.evaluate(decode(vector));
      return {
        valid: result.valid,
        score: result.score,
        objectives: result.objectives,
        metrics: result.metrics ?? result,
      };
    },
  };
}
