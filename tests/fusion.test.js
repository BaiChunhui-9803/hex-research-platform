import test from "node:test";
import assert from "node:assert/strict";
import { PlatformSession, replaySession } from "../core/session.js";
import { compatibility } from "../core/registry.js";
import { random } from "../core/random.js";
import { summarize, resultCSV, runExperiment } from "../core/experiment.js";
import { problemRegistry } from "../problems/index.js";
import { methodRegistry } from "../methods/index.js";
import { dominates } from "../methods/numeric/multiobjective.js";

const fusion = problemRegistry.get("fusion");
const base = {
  scenarioId: "lumen--contact",
  metroHorizon: 60,
  skirmishHorizon: 60,
  seed: 26,
};
const result = (config, method = "constructive") => {
  const session = new PlatformSession(
    fusion,
    { ...base, ...config },
    methodRegistry.get(method),
    {
      evaluations: method === "constructive" ? 1 : 12,
    },
  );
  session.advance(1000);
  assert.ok(session.environment.done());
  return session;
};

test("fusion derives map pairs, settings and 20 methods from the constituent problems", () => {
  const metro = problemRegistry.get("metro");
  const squad = problemRegistry.get("skirmish");
  assert.equal(
    fusion.scenarios.length,
    metro.scenarios.length * squad.scenarios.length,
  );
  const scopes = fusion.scenarios.map(({ id }) => fusion.capabilities(id));
  assert.deepEqual(scopes[0].protocols, [
    "optimization/v1",
    "vector-optimization/v1",
  ]);
  assert.ok(scopes.every((scope) => scope.objectiveSchema.length === 4));
  const shared = methodRegistry
    .list()
    .filter((method) =>
      scopes.every((scope) => compatibility(method, scope).compatible),
    );
  assert.equal(shared.length, 20);
  assert.ok(shared.every(({ mode }) => mode === "search"));
  assert.equal(
    fusion.validateConfig({
      scenarioId: "growth--triad",
      skirmishTeam: "violet",
    }).skirmishTeam,
    "violet",
  );
  assert.throws(
    () => fusion.validateConfig({ ...base, skirmishTeam: "violet" }),
    /faction/,
  );
  assert.throws(
    () => fusion.validateConfig({ scenarioId: "growth--unknown" }),
    /Unknown fusion pair/,
  );
  assert.throws(
    () => fusion.validateConfig({ coupling: "unknown" }),
    /Unknown coupling/,
  );
  assert.throws(() => fusion.validateConfig({ metroWeight: 101 }), /weight/);
  assert.throws(
    () => fusion.validateConfig({ fusionRuleVersion: 2 }),
    /rule version/,
  );
});

test("the uncoupled control reproduces both constituent games and preserves their clocks", () => {
  const session = new PlatformSession(fusion, {
    scenarioId: "growth--triad",
    coupling: "none",
    metroHorizon: 180,
    skirmishHorizon: 10,
    skirmishTeam: "violet",
    prepMinutes: 30,
  });
  const metro = new PlatformSession(problemRegistry.get("metro"), {
    scenarioId: "growth",
    horizon: 180,
  });
  const squad = new PlatformSession(problemRegistry.get("skirmish"), {
    scenarioId: "triad",
    horizon: 10,
    team: "violet",
  });
  const before = session.advance(30);
  assert.equal(before.renderState.components.metro.time, 30);
  assert.equal(before.renderState.components.skirmish.time, 0);
  const end = session.advance(1000);
  metro.advance(1000);
  squad.advance(1000);
  assert.equal(end.tick, 180);
  assert.deepEqual(end.renderState.components.metro, {
    config: metro.config,
    time: metro.environment.time(),
    done: true,
    metrics: metro.environment.metrics(),
    renderState: metro.environment.renderState(),
  });
  assert.deepEqual(end.renderState.components.skirmish, {
    config: squad.config,
    time: squad.environment.time(),
    done: true,
    metrics: squad.environment.metrics(),
    renderState: squad.environment.renderState(),
  });
});

test("supply changes the battle and pressure changes railway service under matched settings", () => {
  const control = result({ coupling: "none" }).environment.metrics();
  const supplied = result({ coupling: "supply" }).environment.metrics();
  assert.equal(supplied.heldMinutes, 0);
  assert.equal(supplied["metro.delivered"], control["metro.delivered"]);
  assert.ok(
    supplied.supportUsed > 0 &&
      supplied.supportUsed <= supplied.supportProduced,
  );
  assert.ok(supplied["skirmish.hpRatio"] > control["skirmish.hpRatio"]);
  assert.notEqual(supplied["skirmish.win"], control["skirmish.win"]);

  const scenarioId = "lumen--mixed";
  const plain = result({ scenarioId, coupling: "none" }).environment.metrics();
  const disrupted = result({
    scenarioId,
    coupling: "disruption",
  }).environment.metrics();
  assert.ok(disrupted.heldMinutes > 0);
  assert.equal(disrupted.supportUsed, 0);
  assert.equal(disrupted["skirmish.hpMargin"], plain["skirmish.hpMargin"]);
  assert.equal(disrupted["metro.spawned"], plain["metro.spawned"]);
  assert.ok(disrupted["metro.delivered"] < plain["metro.delivered"]);
  const twoWay = result({ scenarioId, coupling: "both" });
  const metrics = twoWay.environment.metrics();
  assert.ok(metrics.heldMinutes > 0 && metrics.supportUsed > 0);
  assert.equal(
    metrics["metro.spawned"],
    metrics["metro.delivered"] +
      metrics["metro.riding"] +
      metrics["metro.waiting"],
  );
  assert.ok(twoWay.environment.observe().links.stock <= 60);
  assert.deepEqual(
    replaySession(fusion, twoWay.replay()).environment.metrics(),
    metrics,
  );
});

test("component actions enforce native constraints and joint installation is atomic", () => {
  const session = new PlatformSession(fusion, {
    scenarioId: "growth--triad",
    metroEditBudget: 0,
    skirmishTeam: "violet",
  });
  const initial = session.view();
  const visible = initial.observation.components.metro;
  assert.equal(visible.scenario.stations.length, 6);
  const futurePlan = {
    lines: [
      { id: "A", stops: ["s0", "s2"] },
      { id: "B", stops: [] },
      { id: "C", stops: [] },
    ],
  };
  const edit = (plan) => ({
    type: "component",
    component: "metro",
    action: { type: "set-plan", plan },
  });
  assert.throws(() => session.apply(edit(futurePlan)), /unknown station/);
  const plan = {
    lines: visible.plan.lines.map(({ id }) => ({ id, stops: [] })),
  };
  assert.throws(
    () => session.environment.acceptSolution({ metro: plan, skirmish: {} }),
    /Invalid controller/,
  );
  const orders = [
    {
      type: "hold",
      unitIds: [initial.observation.components.skirmish.enemies[0].id],
    },
  ];
  assert.throws(
    () =>
      session.apply({
        type: "component",
        component: "skirmish",
        action: { type: "commands", orders },
      }),
    /your living units/,
  );
  assert.deepEqual(session.view(), initial);
  session.advance(1);
  assert.throws(() => session.apply(edit(plan)), /Edit budget exceeded/);
  const task = session.environment.createSearchTask();
  assert.equal(
    task.evaluate({ ...task.initial(random(26)), metro: plan }).valid,
    false,
  );
  const own = initial.observation.components.skirmish.own[0];
  const enemy = initial.observation.components.skirmish.enemies[0];
  session.apply({
    type: "component",
    component: "skirmish",
    action: {
      type: "commands",
      orders: [{ type: "attack", unitIds: [own.id], targetId: enemy.id }],
    },
  });
  assert.equal(
    session.view().observation.components.skirmish.own[0].order.targetId,
    enemy.id,
  );
  const restored = replaySession(
    fusion,
    JSON.parse(JSON.stringify(session.replay())),
  );
  assert.deepEqual(
    restored.environment.renderState(),
    session.environment.renderState(),
  );
});

test("the optimizer uses the same joint rollout and current-station vector grows with openings", () => {
  const fixed = new PlatformSession(fusion, {
    ...base,
    scenarioId: "lumen--mixed",
    coupling: "both",
  });
  const root = fixed.environment.createSearchTask();
  const candidate = root.initial(random(26));
  const evaluation = root.evaluate(candidate);
  assert.ok(evaluation.valid);
  assert.equal(fixed.view().tick, 0);
  fixed.environment.acceptSolution(candidate);
  const end = fixed.advance(1000);
  assert.equal(evaluation.score, end.metrics.score);
  assert.equal(evaluation.metrics.heldMinutes, end.metrics.heldMinutes);
  assert.equal(evaluation.metrics.supportUsed, end.metrics.supportUsed);
  assert.deepEqual(
    evaluation.metrics.skirmish,
    end.renderState.components.skirmish.metrics,
  );

  const growing = new PlatformSession(fusion, {
    scenarioId: "growth--triad",
    metroHorizon: 180,
    skirmishHorizon: 60,
  });
  const first = growing.environment.createVectorTask();
  const projected = first.evaluate(first.initial(random(26)));
  assert.equal(first.dimension, 24);
  assert.equal(projected.metrics.metro.activeStations, 6);
  assert.equal(projected.objectives.length, 4);
  growing.advance(60);
  assert.equal(growing.environment.createVectorTask().dimension, 33);
  growing.advance(60);
  assert.equal(growing.environment.createVectorTask().dimension, 42);
});

test("fusion Pareto methods archive four objectives and run deterministically after import", () => {
  for (const id of ["nsga2", "spea2", "moead"]) {
    const session = result({ coupling: "both" }, id);
    const detail = session.searchDetail;
    const archive = detail.paretoArchive;
    assert.ok(archive.length > 0);
    assert.equal(detail.objectiveSchema.length, 4);
    assert.ok(
      archive.every(
        (point) =>
          point.objectives.length === 4 &&
          point.objectives.every(Number.isFinite),
      ),
    );
    for (const point of archive) {
      assert.ok(
        !archive.some((other) =>
          dominates({ ...other, valid: true }, { ...point, valid: true }),
        ),
      );
    }
    const imported = JSON.parse(JSON.stringify(session.replay()));
    assert.deepEqual(
      replaySession(fusion, imported).environment.metrics(),
      imported.finalMetrics,
    );
  }
});

test("fusion experiment summaries separate coupling profiles and retain settings in CSV", () => {
  const request = {
    problemId: "fusion",
    scenarioIds: [base.scenarioId],
    methodIds: ["constructive"],
    seeds: [26, 27],
    evaluations: 1,
  };
  const control = runExperiment(
    { ...request, config: { ...base, coupling: "none" } },
    problemRegistry,
    methodRegistry,
  );
  const linked = runExperiment(
    { ...request, config: { ...base, coupling: "both" } },
    problemRegistry,
    methodRegistry,
  );
  assert.deepEqual(
    summarize([...control.results, ...linked.results], linked.metricSchema).map(
      (row) => row.n,
    ),
    [2, 2],
  );
  const csv = resultCSV(linked);
  assert.match(csv, /"coupling"/);
  assert.match(csv, /"metroWeight"/);
  assert.match(csv, /"skirmish\.hpRatio"/);
});
