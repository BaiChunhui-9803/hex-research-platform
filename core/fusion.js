const searchProtocols = ["optimization/v1", "vector-optimization/v1"];

export function combineScenarios(problems) {
  let pairs = [{ ids: [], names: [], components: {}, dynamic: false }];
  for (const problem of problems) {
    pairs = pairs.flatMap((pair) =>
      problem.scenarios.map((scenario) => ({
        ids: [...pair.ids, scenario.id],
        names: [...pair.names, scenario.name],
        components: { ...pair.components, [problem.id]: scenario.id },
        dynamic: pair.dynamic || Boolean(scenario.dynamic),
      })),
    );
  }
  return pairs.map(({ ids, names, ...scenario }) => ({
    ...scenario,
    id: ids.join("--"),
    name: names.join(" + "),
  }));
}

export function sharedSearchCapabilities(parts) {
  return {
    protocols: searchProtocols.filter((protocol) =>
      parts.every((part) => part.protocols.includes(protocol)),
    ),
    features: [
      ...parts[0].features.filter((feature) =>
        parts.every((part) => part.features.includes(feature)),
      ),
      "composed",
    ],
  };
}

export function combineSearchTasks(parts, evaluate, objectiveSchema) {
  const entries = Object.entries(parts);
  const collect = (operation, random) =>
    Object.fromEntries(
      entries.map(([key, task]) => [key, task[operation](random)]),
    );
  return {
    protocol: "optimization/v1",
    encoding: "Joint candidate with one native solution per component",
    objectiveSchema,
    temperature: 6,
    initial: (random) => collect("initial", random),
    sample: (random) => collect("sample", random),
    mutate(candidate, random) {
      const [key, task] = entries[Math.floor(random() * entries.length)];
      return {
        ...candidate,
        [key]: task.mutate(structuredClone(candidate[key]), random),
      };
    },
    evaluate,
  };
}

export function combineVectorTasks(
  parts,
  evaluate,
  objectiveSchema,
  objectiveScales,
) {
  let dimension = 0;
  const blocks = Object.entries(parts).map(([key, task]) => {
    const start = dimension;
    dimension += task.dimension;
    return { key, task, start, end: dimension };
  });
  function decode(vector) {
    if (vector.length !== dimension)
      throw new Error(`Joint vector must contain ${dimension} coordinates`);
    return Object.fromEntries(
      blocks.map(({ key, task, start, end }) => [
        key,
        task.decode(vector.slice(start, end)),
      ]),
    );
  }
  return {
    protocol: "vector-optimization/v1",
    dimension,
    blocks: blocks.map(({ key, start, end }) => ({ key, start, end })),
    encoding: blocks
      .map(({ key, task }) => `${key} (${task.dimension})`)
      .join(" + "),
    objectiveSchema,
    objectiveScales,
    initial: (random) => blocks.flatMap(({ task }) => task.initial(random)),
    decode,
    evaluate: (vector) => evaluate(decode(vector)),
  };
}
