import assert from "node:assert/strict";
import test from "node:test";
import { compileFeatureRules } from "../core/rule-composition.js";
import { PlatformSession, replaySession } from "../core/session.js";
import { fusion } from "../problems/fusion/index.js";
import { methodRegistry } from "../methods/index.js";
import { compilePlan } from "../engines/metro/shared/network.js";
import { allocateStationSupply, EQUAL_SUPPLY, PROPORTIONAL_SUPPLY } from "../problems/fusion/supply-allocation.js";

const base = { scenarioId: "growth--triad", metroHorizon: 180, skirmishHorizon: 60, seed: 28 };
const operations = (tables) => tables.flatMap(({ rows }) => rows.flatMap((row) => row.operations));

test("candidate admissibility is derived from operation bindings instead of problem names", () => {
  const source = fusion.sourceFeatureTables(base);
  const compiled = compileFeatureRules(source);
  assert.ok(compiled.findings.find(({ id }) => id === "invariants").evidence.includes("rail.track.simple"));
  assert.equal(compiled.candidates.length, 6);
  const renamed = structuredClone(source);
  renamed[0].id = "world-a";
  renamed[1].id = "world-b";
  assert.deepEqual(compileFeatureRules(renamed), compileFeatureRules(source));
  const edit = operations(renamed).find(({ id }) => id === "rail.route.add");
  edit.binding.adaptable = false;
  assert.deepEqual(compileFeatureRules(renamed).candidates.filter(({ admissible }) => admissible)
    .map(({ id }) => id), ["neutral", "neutral-equal"]);
  const producer = operations(renamed).find(({ id }) => id === "rail.passenger.delivered");
  producer.binding.event = "unknown-event";
  assert.ok(compileFeatureRules(renamed).candidates.every(({ missing }) => missing.includes("public-station-pool")));
});

test("real pilot outcomes select different rules for different design goals", () => {
  const agency = fusion.design({ ...base, designGoal: "agency" });
  const service = fusion.design({ ...base, designGoal: "service" });
  assert.equal(agency.selected, "turns-equal");
  assert.equal(service.selected, "neutral-equal");
  const entry = agency.candidates.find(({ id }) => id === agency.selected);
  assert.equal(entry.samples.length, 6);
  assert.ok(entry.samples.every(({ participation, contributions }) =>
    participation === 1 && Object.values(contributions).every((value) => value === 2)));
  assert.ok(entry.samples.every(({ controlHp, hp }) => Object.keys(controlHp).length === Object.keys(hp).length));
  assert.deepEqual(fusion.validateConfig(agency.config), agency.config);
});

test("the selected snake draft commits one faction action per turn, freezes service and replays public stock", () => {
  const config = { ...base, ruleMode: "features", ruleCandidate: "turns" };
  const session = new PlatformSession(fusion, config, methodRegistry.get("constructive"), { evaluations: 4 });
  const env = session.environment;
  const first = env.draftOptions()[0].action;
  const snapshot = env.renderState();
  assert.throws(() => env.apply({ ...first, team: "blue" }), /active faction/);
  assert.throws(() => env.apply({ ...first, to: "missing" }), /Placement exceeds/);
  assert.deepEqual(env.renderState(), snapshot);
  session.advance(1);
  assert.equal(env.audit().rail.delivered, 0);
  assert.equal(env.renderState().components.metro.time, 0);
  assert.equal(env.renderState().components.skirmish.time, 0);
  session.advance(5);
  assert.deepEqual(session.actions.map(({ value }) => value.team), ["orange", "violet", "blue", "blue", "violet", "orange"]);
  assert.throws(() => env.apply(first), /tracks are locked/);
  assert.equal(env.observe().links.ruleDesign.phase, "operate");
  session.advance(240);
  const result = env.audit();
  assert.ok(result.produced > 0 && result.used > 0);
  assert.ok(Math.abs(result.produced - result.used - result.stock - result.discarded) < 1e-6);
  const replay = JSON.parse(JSON.stringify(session.replay()));
  assert.deepEqual(replaySession(fusion, replay).environment.metrics(), replay.finalMetrics);
  const other = new PlatformSession(fusion, { ...config, skirmishTeam: "orange" }, methodRegistry.get("constructive"));
  other.advance(240);
  assert.deepEqual(other.environment.observe().links.ruleDesign.recovered, env.observe().links.ruleDesign.recovered);
});

test("candidate rail extensions satisfy the full native validator on every draft turn", () => {
  const session = new PlatformSession(fusion, { ...base, ruleMode: "features", ruleCandidate: "turns" });
  const env = session.environment;
  while (env.observe().links.ruleDesign.phase === "build") {
    const { scenario, plan } = env.observe().components.metro;
    const options = env.draftOptions();
    for (const { action } of options) {
      if (action.type === "pass-turn") continue;
      const proposal = structuredClone(plan);
      const line = proposal.lines.find(({ id }) => id === action.line);
      if (action.side === "new") line.stops = [action.from, action.to];
      else if (action.side === "start") line.stops.unshift(action.to);
      else line.stops.push(action.to);
      assert.equal(compilePlan(scenario, proposal).valid, true);
    }
    env.apply(options[0].action);
    env.advance();
  }
});

test("public supply allocators respect unequal claims and redistribute unused equal shares", () => {
  const needs = { blue: 2, orange: 10, violet: 20 };
  assert.deepEqual(allocateStationSupply(needs, 16, PROPORTIONAL_SUPPLY), { blue: 1, orange: 5, violet: 10 });
  assert.deepEqual(allocateStationSupply(needs, 16, EQUAL_SUPPLY), { blue: 2, orange: 7, violet: 7 });
  assert.deepEqual(allocateStationSupply(needs, 200, EQUAL_SUPPLY), needs);
});
