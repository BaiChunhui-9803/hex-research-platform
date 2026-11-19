import { integer } from "../../core/random.js";
import { key } from "../../engines/skirmish/shared/hex.js";
import { createScenario, SCENARIOS } from "../../engines/skirmish/shared/scenarios.js";
import { walkable } from "../../engines/skirmish/shared/terrain.js";

export function squadDesignFields(id) {
  return [
    {
      key: "terrainScenario", name: "Terrain source", default: "",
      choices: [{ value: "", label: "Selected scenario's terrain" }, ...SCENARIOS
        .filter((scenario) => scenario.id !== id)
        .map(({ id, name }) => ({ value: id, label: name }))],
    },
    { key: "enemyUnitPercent", name: "Opposing roster size (%)", min: 25, max: 100, default: 100 },
  ];
}

export function squadDesignConfig(input, id) {
  const donor = input.terrainScenario;
  if (donor && !SCENARIOS.some((scenario) => scenario.id === donor))
    throw new Error("Unknown terrain source");
  const percent = integer(input.enemyUnitPercent, 100, 25, 100, "Opposing roster size");
  return {
    ...(donor && donor !== id ? { terrainScenario: donor } : {}),
    ...(percent !== 100 ? { enemyUnitPercent: percent } : {}),
  };
}

export function buildSquadScenario(config) {
  const scenario = createScenario(config.scenarioId, config.seed);
  const fraction = (config.enemyUnitPercent ?? 100) / 100;
  if (fraction < 1) {
    const keep = new Set();
    for (const { id } of scenario.teams) {
      const roster = scenario.units.filter((unit) => unit.team === id);
      const count = id === config.team ? roster.length : Math.max(1, Math.round(roster.length * fraction));
      for (let i = 0; i < count; i++) keep.add(roster[Math.floor(i * roster.length / count)].id);
    }
    scenario.units = scenario.units.filter(({ id }) => keep.has(id));
  }
  if (config.terrainScenario) {
    const { map } = createScenario(config.terrainScenario, config.seed);
    scenario.map.terrain = { ...map.terrain };
    for (const unit of scenario.units)
      if (!walkable(scenario.map, unit)) delete scenario.map.terrain[key(unit)];
  }
  scenario.duration = config.horizon;
  return scenario;
}
