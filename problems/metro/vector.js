/** Route membership and ordering keys; no future station enters this encoding. */
export function routeVectorTask(native, observation) {
  const stations = observation.scenario.stations,
    limit = observation.scenario.resources.maxStopsPerLine;
  const start = native.initial(() => 0.5),
    lineIds = start.lines.map((l) => l.id);
  const decode = (vector) => ({
    lines: lineIds.map((id, line) => ({
      id,
      stops: stations
        .map((station, index) => ({
          id: station.id,
          key: vector[line * stations.length + index],
        }))
        .filter((s) => s.key < 0.5)
        .sort((a, b) => a.key - b.key || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((s) => s.id),
    })),
  });
  return {
    protocol: "vector-optimization/v1",
    dimension: lineIds.length * stations.length,
    encoding:
      "Random keys: one membership/order key per active station and line",
    objectiveSchema: native.objectiveSchema,
    initial: () =>
      lineIds.flatMap((id) =>
        stations.map((station) => {
          const stops = start.lines.find((l) => l.id === id).stops,
            rank = stops.indexOf(station.id);
          return rank < 0 ? 0.75 : (rank + 1) / (2 * (limit + 1));
        }),
      ),
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
