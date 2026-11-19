import test from "node:test";
import assert from "node:assert/strict";
import { random } from "../core/random.js";
import { PlatformSession, replaySession } from "../core/session.js";
import { difficultySpace } from "../core/difficulty-space.js";
import { methodRegistry } from "../methods/index.js";
import { fusion } from "../problems/fusion/index.js";
import { metro } from "../problems/metro/index.js";
import { skirmish } from "../problems/skirmish/index.js";
import { compileSpatialRules, pressureCells } from "../problems/fusion/spatial-rules.js";
import { stepLocal } from "../problems/metro/local-operations.js";
import { createState } from "../engines/metro/shared/simulation.js";
import { configForScope, normalizeScope, scopedCohorts, scopeFromConfig } from "../web/portal/data.js";

test("shared-rule compiler explains a missing dispatch capability", () => {
  const config = fusion.validateConfig({ layout: "shared" });
  const compiled = compileSpatialRules(config, {
    sharedAxialGrid: true, viableTrackPlan: true,
    segmentDispatch: false, stationArrivals: true, livingPositions: true, localHealing: true,
  });
  assert.deepEqual(compiled.enabled, ["station-supply"]);
  assert.deepEqual(compiled.skipped, [{
    id: "local-dispatch-delay", reason: "missing-capability", missing: ["segmentDispatch"],
  }]);
  assert.equal(compiled.selectedBy, "capability-priority");
  const cells = pressureCells([
    { q: 4, r: 0, team: "orange" }, { q: 2, r: 0, team: "blue" },
  ], "blue", 1);
  assert.ok(cells.has("4,0"));
  assert.ok(!cells.has("3,0"));
});

test("local delay holds just the affected segment while other trains deliver", () => {
  const scenario = {
    seed: 26, demandMultiplier: 0,
    map: { qMin: 0, qMax: 7, rMin: 0, rMax: 0, diagonalLimit: 7, terrain: {} },
    stations: [
      { id: "s1", q: 0, r: 0, shape: "circle" }, { id: "s2", q: 1, r: 0, shape: "triangle" },
      { id: "s3", q: 6, r: 0, shape: "circle" }, { id: "s4", q: 7, r: 0, shape: "square" },
    ],
    resources: { trackBudget: 4, maxStopsPerLine: 3, minutesPerHex: 1, dwellMinutes: 1, trainCapacity: 3, platformCapacity: 10 },
  };
  const state = createState(scenario, { lines: [
    { id: "A", stops: ["s1", "s2"] }, { id: "B", stops: ["s3", "s4"] }, { id: "C", stops: [] },
  ] }, { horizon: 5, schedule: [] });
  state.trains[0].dwell = 0;
  state.trains[1].dwell = 0;
  state.trains[1].passengers.push({ id: 1, shape: "square", created: 0 });
  const planBefore = structuredClone(state.plan);
  const changes = stepLocal(state, { delay: (cells) => cells.some(({ q }) => q < 2), collectArrivals: true });
  assert.deepEqual(changes, { held: 1, heldLines: ["A"], moving: 2, arrivals: [{ stationId: "s4", q: 7, r: 0, count: 1 }] });
  assert.equal(state.trains[0].from, "s1");
  assert.equal(state.trains[1].from, "s4");
  assert.equal(state.time, 1);
  assert.deepEqual(state.plan, planBefore);
});

test("station healing spends points only on nearby living teammates", () => {
  const config = skirmish.validateConfig({ scenarioId: "contact", horizon: 60 });
  const state = skirmish.create(config).renderState();
  const [near, far] = state.units.filter((unit) => unit.team === config.team);
  near.hp -= 8;
  far.hp -= 8;
  const env = skirmish.create(config, { state });
  assert.equal(env.restoreHealth(12, { q: near.q, r: near.r, radius: 0 }), 8);
  assert.equal(near.hp, near.maxHp);
  assert.equal(far.hp, far.maxHp - 8);
});

test("shared bounds and forecast copies stay consistent with a frozen pilot replay", () => {
  const session = new PlatformSession(fusion, {
    scenarioId: "growth--triad", layout: "shared", spatialVariant: "pilot", seed: 30, skirmishHorizon: 60,
  });
  const original = session.environment.renderState();
  const metro = original.components.metro.renderState.scenario.map;
  const squad = original.components.skirmish.renderState.scenario.map;
  for (const field of ["qMin", "qMax", "rMin", "rMax", "diagonalLimit"])
    assert.equal(metro[field], squad[field]);
  assert.equal(original.links.spatial.selectedBy, "pilot");
  assert.notEqual(session.config.spatialVariant, "pilot");
  const task = session.environment.createVectorTask();
  assert.equal(task.evaluate(task.initial(random(26))).objectives.length, 4);
  assert.deepEqual(session.environment.renderState(), original);
  session.advance(82);
  const recording = JSON.parse(JSON.stringify(session.replay()));
  assert.deepEqual(replaySession(fusion, recording).environment.metrics(), recording.finalMetrics);
  assert.deepEqual(fusion.validateConfig(recording.config), recording.config);
});

test("layout-adaptive radii respond to geometry, targets, and explicit overrides", () => {
  const base = {
    scenarioId: "lumen--contact", seed: 28, layout: "shared", spatialVariant: "adaptive",
    skirmishHorizon: 60,
  };
  const inspect = (extra) =>
    fusion.create(fusion.validateConfig({ ...base, ...extra })).observe().links.spatial;
  const opening = inspect({});
  assert.equal(opening.selectedBy, "layout-adaptive");
  assert.deepEqual([opening.stationRadius, opening.pressureRadius], [1, 1]);
  const shifted = inspect({ squadOffsetR: 4 });
  assert.deepEqual([shifted.stationRadius, shifted.pressureRadius], [2, 2]);
  assert.equal(inspect({ supplyReachTarget: 100 }).fit.supply.coverage, 1);
  const fixed = inspect({ stationRadius: 4, pressureRadius: 3 });
  assert.equal(fixed.fit.supply.fixed, true);
  assert.deepEqual([fixed.stationRadius, fixed.pressureRadius], [4, 3]);
  assert.deepEqual(inspect({ coupling: "supply", supplyCap: 0 }).enabled, []);
});

test("same-domain scenario parts feed the native engine and the compiled fusion", () => {
  const config = fusion.validateConfig({
    scenarioId: "compact--contact", seed: 28, layout: "shared", spatialVariant: "adaptive",
    metroDemandScenario: "rush", metroDemandPercent: 120, metroTrackBudget: 20, metroMaxStopsPerLine: 3,
    skirmishTerrainScenario: "pass", skirmishEnemyUnitPercent: 50, supplyCap: 25,
  });
  const children = fusion.components(config);
  const baseRail = metro.create(metro.validateConfig({ scenarioId: "compact", seed: 28 })).renderState();
  const customRail = metro.create(children.metro).renderState();
  assert.deepEqual(customRail.scenario.stations, baseRail.scenario.stations);
  assert.equal(customRail.scenario.demandMultiplier, 1.55 * 1.2);
  assert.equal(customRail.scenario.resources.trackBudget, 20);
  assert.ok(customRail.schedule.length > baseRail.schedule.length);
  const customSquad = skirmish.create(children.skirmish).renderState().scenario;
  assert.equal(customSquad.units.filter((unit) => unit.team === "orange").length, 2);
  assert.ok(Object.values(customSquad.map.terrain).includes("rock"));
  const session = new PlatformSession(fusion, config, methodRegistry.get("constructive"), { evaluations: 4 });
  const initial = session.environment.renderState();
  assert.equal(initial.components.metro.renderState.scenario.resources.trackBudget, 20);
  assert.equal(initial.components.skirmish.renderState.units.length, 6);
  const space = difficultySpace(fusion, session.environment, 7, new Map(), () => {});
  assert.equal(space.components.metro.trackBudget, 20);
  assert.equal(space.components.skirmish.discreteExample, "9604");
  session.advance(240);
  const recording = JSON.parse(JSON.stringify(session.replay()));
  assert.deepEqual(replaySession(fusion, recording).environment.metrics(), recording.finalMetrics);
});

test("shared links carry typed scenario changes and select exact archived conditions", () => {
  const baseline = normalizeScope({ problem: "fusion", scenario: "lumen--contact", profile: "shared" });
  const input = { ...baseline, setup: { metroTrackBudget: "20", stationRadius: 0, skirmishTeam: "violet", seed: 900 } };
  const scope = normalizeScope(input);
  assert.deepEqual(JSON.parse(scope.setup), { metroTrackBudget: 20 });
  const full = fusion.validateConfig(configForScope(scope, 28));
  assert.deepEqual(scopeFromConfig("fusion", full), scope);
  const original = fusion.validateConfig(configForScope(baseline, 28));
  const makeCohort = (id, { seed, ...config }) => ({
    id, scenarioId: config.scenarioId, problemId: "fusion", config,
  });
  const catalog = { cohorts: [makeCohort("original", original), makeCohort("custom", full)] };
  assert.deepEqual(scopedCohorts(catalog, scope).map(({ id }) => id), ["custom"]);
});
