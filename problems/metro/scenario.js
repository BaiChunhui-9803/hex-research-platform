import { integer } from "../../core/random.js";
import { createScenario, SCENARIOS } from "../../engines/metro/shared/scenarios.js";

const resourceFields = [
  { key: "trackBudget", name: "Track budget (edges)", min: 4, max: 160 },
  { key: "maxStopsPerLine", name: "Stops per line", min: 2, max: 12 },
  { key: "trainCapacity", name: "Seats per train", min: 2, max: 18 },
];

function designDefaults(id) {
  return {
    trackBudget: SCENARIOS.find((scenario) => scenario.id === id)?.trackBudget ?? 100,
    maxStopsPerLine: 7,
    trainCapacity: 6,
  };
}

export function metroDesignFields(id) {
  const defaults = designDefaults(id);
  return [
    {
      key: "demandScenario", name: "Passenger-demand source", default: "",
      choices: [{ value: "", label: "Selected city's demand" }, ...SCENARIOS
        .filter((scenario) => scenario.id !== id)
        .map((scenario) => ({ value: scenario.id, label: `${scenario.name} · ×${scenario.demandMultiplier}` }))],
    },
    { key: "demandPercent", name: "Passenger demand (%)", min: 25, max: 300, default: 100 },
    ...resourceFields.map((field) => ({ ...field, default: defaults[field.key] })),
  ];
}

export function metroDesignConfig(input, id) {
  const defaults = designDefaults(id);
  const result = {};
  const donor = input.demandScenario;
  if (donor && donor !== id) {
    if (!SCENARIOS.some((scenario) => scenario.id === donor)) throw new Error("Unknown passenger-demand source");
    result.demandScenario = donor;
  }
  const demand = integer(input.demandPercent, 100, 25, 300, "Passenger demand");
  if (demand !== 100) result.demandPercent = demand;
  for (const { key, min, max, name } of resourceFields) {
    const value = integer(input[key], defaults[key], min, max, name);
    if (value !== defaults[key]) result[key] = value;
  }
  return result;
}

export function buildMetroScenario(config) {
  const scenario = createScenario(config.scenarioId, config.seed);
  scenario.trackTopology = config.trackTopology;
  const donor = SCENARIOS.find(({ id }) => id === config.demandScenario);
  scenario.demandMultiplier = (donor?.demandMultiplier ?? scenario.demandMultiplier) *
    ((config.demandPercent ?? 100) / 100);
  for (const { key } of resourceFields) {
    if (config[key] !== undefined) scenario.resources[key] = config[key];
  }
  return scenario;
}
