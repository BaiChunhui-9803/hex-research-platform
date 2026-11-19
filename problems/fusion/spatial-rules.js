import { distance, key } from "../../engines/skirmish/shared/hex.js";
import { couplingProfiles, hasSupply, SUPPORT_CAP } from "./rules.js";

export const SPATIAL_RULE_VERSION = 1;
export const spatialVariants = Object.freeze({
  gentle: Object.freeze({ periodOffset: 2, pressureRadius: 1, stationRadius: 2 }),
  standard: Object.freeze({ periodOffset: 0, pressureRadius: 2, stationRadius: 3 }),
  wide: Object.freeze({ periodOffset: -1, pressureRadius: 3, stationRadius: 4 }),
});
const rules = [
  { id: "local-dispatch-delay", key: "holds", needs: ["sharedAxialGrid", "viableTrackPlan", "segmentDispatch", "livingPositions"] },
  { id: "station-supply", key: "supply", needs: ["sharedAxialGrid", "stationArrivals", "livingPositions", "localHealing"] },
];

const radii = [1, 2, 3, 4];

function chooseRadius(coverage, target, preferred, override) {
  const choices = radii.map((radius) => ({ radius, coverage: coverage(radius) }));
  const distanceToTarget = (option) => Math.abs(option.coverage - target);
  const chosen = choices.find(({ radius }) => radius === override) ??
    [...choices].sort((a, b) =>
      distanceToTarget(a) - distanceToTarget(b) ||
      Math.abs(a.radius - preferred) - Math.abs(b.radius - preferred) ||
      a.radius - b.radius,
    )[0];
  return { ...chosen, target, fixed: Boolean(override), choices };
}

function fitOpeningLayout(config, geometry) {
  const { stations, segments, units } = geometry;
  const own = units.filter(({ team }) => team === config.skirmishTeam);
  const supply = chooseRadius(
    (radius) => own.filter((unit) => stations.some((station) => distance(station, unit) <= radius)).length / Math.max(1, own.length),
    (config.supplyReachTarget ?? 50) / 100, 3, config.stationRadius,
  );
  const pressure = chooseRadius((radius) => {
    const affected = pressureCells(units, config.skirmishTeam, radius);
    return segments.filter((segment) => segment.some((cell) => affected.has(key(cell)))).length / Math.max(1, segments.length);
  }, (config.pressureReachTarget ?? 30) / 100, 2, config.pressureRadius);
  return { supply, pressure, openingSegments: segments.length };
}

export function compileSpatialRules(config, capabilities, geometry) {
  const selected = config.spatialVariant === "auto" ? "standard" : config.spatialVariant;
  const adaptive = selected === "adaptive";
  if (adaptive && !geometry) throw new Error("Adaptive selection needs the assembled opening layout");
  const variant = spatialVariants[adaptive ? "standard" : selected];
  if (!variant) throw new Error("Unknown spatial variant");
  const fit = adaptive ? fitOpeningLayout(config, geometry) : null;
  const profile = couplingProfiles[config.coupling];
  const enabled = [];
  const skipped = [];
  for (const rule of rules) {
    const missing = rule.needs.filter((capability) => !capabilities[capability]);
    if (!profile[rule.key]) skipped.push({ id: rule.id, reason: "disabled-by-profile" });
    else if (missing.length) skipped.push({ id: rule.id, reason: "missing-capability", missing });
    else if (rule.key === "supply" && !hasSupply(config))
      skipped.push({ id: rule.id, reason: "zero-supply" });
    else enabled.push(rule.id);
  }
  return Object.freeze({
    version: SPATIAL_RULE_VERSION,
    variant: selected,
    selectedBy: adaptive ? "layout-adaptive" : config.spatialVariant === "auto" ? "capability-priority"
      : config.spatialSelector === "pilot" ? "pilot" : "frozen-variant",
    holdEvery: Math.max(2, config.holdEvery + variant.periodOffset),
    pressureRadius: config.pressureRadius || fit?.pressure.radius || variant.pressureRadius,
    stationRadius: config.stationRadius || fit?.supply.radius || variant.stationRadius,
    ...(fit ? { fit } : {}),
    holds: enabled.includes("local-dispatch-delay"),
    supply: enabled.includes("station-supply"),
    enabled: Object.freeze(enabled),
    skipped: Object.freeze(skipped),
  });
}

const offsets = new Map();
function radiusOffsets(radius) {
  if (!offsets.has(radius)) {
    const values = [];
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        if (Math.abs(q + r) <= radius) values.push({ q, r });
      }
    }
    offsets.set(radius, values);
  }
  return offsets.get(radius);
}

export function pressureCells(positions, friendlyTeam, radius) {
  const balance = new Map();
  for (const unit of positions) {
    const contribution = unit.team === friendlyTeam ? -1 : 1;
    for (const offset of radiusOffsets(radius)) {
      const tile = key({ q: unit.q + offset.q, r: unit.r + offset.r });
      balance.set(tile, (balance.get(tile) ?? 0) + contribution);
    }
  }
  return new Set([...balance].filter(([, number]) => number > 0).map(([cell]) => cell));
}

export function advanceSpatial(parts, clock, config, manifest) {
  const { metro, skirmish } = parts;
  const next = clock.cycle + 1;
  const inspected = manifest.holds && skirmish.tick() > 0 && next % manifest.holdEvery === 0;
  const pressured = inspected ? pressureCells(skirmish.livingCells(), config.skirmishTeam, manifest.pressureRadius) : null;
  const rail = metro.advanceLocal({
    ...(pressured ? { delay: (cells) => cells.some((cell) => pressured.has(key(cell))) } : {}),
    collectArrivals: manifest.supply && !skirmish.done(),
  });
  clock.heldTrainMinutes += rail.held;
  clock.movingTrainMinutes += rail.moving;
  clock.lastHeldLines = rail.heldLines;
  if (rail.held) clock.heldMinutes++;
  clock.lastHold = rail.held > 0;

  const battleWindow = config.metroHorizon - config.prepMinutes;
  const target = Math.floor((Math.max(0, next - config.prepMinutes) * skirmish.maxTicks()) / battleWindow);
  if (manifest.supply && !skirmish.done() && skirmish.tick() < target && clock.stock > 0) {
    for (const id of Object.keys(clock.stationStocks).sort()) {
      const station = clock.stationStocks[id];
      const used = skirmish.restoreHealth(station.stock, { ...station, radius: manifest.stationRadius });
      clock.supportUsed += used;
      clock.stock -= used;
      station.stock -= used;
      if (station.stock <= 1e-8) delete clock.stationStocks[id];
    }
    clock.stock = Math.max(0, clock.stock);
  }
  while (!skirmish.done() && skirmish.tick() < target) skirmish.advance();
  if (manifest.supply && !skirmish.done()) {
    for (const { stationId, q, r, count } of rail.arrivals) {
      const earned = count * config.supportPerPassenger;
      const retained = Math.min((config.supplyCap ?? SUPPORT_CAP) - clock.stock, earned);
      clock.supportProduced += earned;
      if (retained <= 0) continue;
      const station = clock.stationStocks[stationId] ?? { q, r, stock: 0 };
      station.stock += retained;
      clock.stock += retained;
      clock.stationStocks[stationId] = station;
    }
  }
  clock.cycle = next;
}
