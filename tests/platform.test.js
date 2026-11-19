import test from "node:test";
import assert from "node:assert/strict";
import { createReplayCursor, PlatformSession, replaySession } from "../core/session.js";
import { problemRegistry } from "../problems/index.js";
import { methodRegistry } from "../methods/index.js";
import { compatibility, createRegistry } from "../core/registry.js";
import {
  runExperiment,
  validateExperiment,
  resultCSV,
} from "../core/experiment.js";
import { createScenario as originalScenario } from "../engines/skirmish/shared/scenarios.js";
import {
  createBattle,
  battleMetrics,
} from "../engines/skirmish/shared/battle.js";
import { stepMatch } from "../engines/skirmish/shared/match.js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const shared = ["constructive", "random-search", "hill-climb", "annealing"];
test("all shared optimizers run both domains and reproduce after JSON replay round-trip", () => {
  for (const problem of ["metro", "skirmish"].map((id) => problemRegistry.get(id)))
    for (const id of shared) {
      const session = new PlatformSession(
        problem,
        {
          scenarioId: problem.id === "metro" ? "compact" : "contact",
          horizon: problem.id === "metro" ? 60 : 20,
        },
        methodRegistry.get(id),
        { evaluations: 5 },
      );
      while (!session.environment.done()) session.advance(50);
      assert.ok(Number.isFinite(session.environment.metrics().score));
      const restored = replaySession(
        problem,
        JSON.parse(JSON.stringify(session.replay())),
      );
      assert.deepEqual(
        restored.environment.metrics(),
        session.environment.metrics(),
        `${problem.id}:${id}`,
      );
      assert.ok(session.evaluations <= 5);
    }
});
test("dynamic metro opens all stations, respects edit budget and replays decisions", () => {
  const problem = problemRegistry.get("metro");
  for (const id of ["hill-climb", "metro.repair", "metro.growth-greedy"]) {
    const session = new PlatformSession(
      problem,
      { scenarioId: "growth", horizon: 180, editBudget: 12 },
      methodRegistry.get(id),
      { evaluations: 4 },
    );
    session.advance(1000);
    assert.equal(session.environment.metrics().activeStations, 12);
    assert.ok(session.environment.metrics().editUnits <= 12);
    assert.deepEqual(
      replaySession(problem, session.replay()).environment.metrics(),
      session.environment.metrics(),
    );
  }
});
test("domain policies are rejected outside their ports and dynamic requirement", () => {
  const metro = problemRegistry.get("metro"),
    squad = problemRegistry.get("skirmish");
  assert.equal(
    compatibility(
      methodRegistry.get("squad.focus"),
      metro.capabilities("lumen"),
    ).compatible,
    false,
  );
  assert.equal(
    compatibility(
      methodRegistry.get("metro.repair"),
      metro.capabilities("lumen"),
    ).compatible,
    false,
  );
  assert.equal(
    compatibility(
      methodRegistry.get("metro.repair"),
      squad.capabilities("contact"),
    ).compatible,
    false,
  );
  assert.throws(
    () => new PlatformSession(metro, {}, methodRegistry.get("squad.focus")),
    /Requires/,
  );
});
test("manual batch orders are atomic and a controller-to-manual transition replays", () => {
  const problem = problemRegistry.get("skirmish"),
    session = new PlatformSession(
      problem,
      { scenarioId: "contact", horizon: 20 },
      methodRegistry.get("constructive"),
    );
  session.advance(5);
  const before = session.environment.renderState();
  assert.throws(() =>
    session.apply({
      type: "commands",
      orders: [
        { unitIds: ["blue-1"], type: "hold" },
        { unitIds: ["orange-1"], type: "hold" },
      ],
    }),
  );
  assert.deepEqual(session.environment.renderState(), before);
  session.takeControl();
  session.advance(1000);
  assert.deepEqual(
    replaySession(problem, session.replay()).environment.metrics(),
    session.environment.metrics(),
  );
});
test("manual edits at a paused final replay position are retained", () => {
  const problem = problemRegistry.get("metro"),
    session = new PlatformSession(problem, { scenarioId: "compact" });
  const plan = session.view().renderState.plan;
  plan.lines[0].stops = [];
  session.apply({ type: "set-plan", plan });
  assert.deepEqual(
    replaySession(problem, session.replay()).environment.renderState().plan,
    plan,
  );
});
test("a replay cursor applies final-tick commands once and supports rewinding", () => {
  const problem = problemRegistry.get("metro");
  const session = new PlatformSession(problem, { scenarioId: "growth" });
  session.advance(6);
  const plan = session.environment.currentPlan();
  const changed = structuredClone(plan);
  changed.lines[0].stops = [];
  session.apply({ type: "set-plan", plan: changed });
  const cursor = createReplayCursor(problem, session.replay());
  assert.deepEqual(cursor.seek(5).environment.currentPlan(), plan);
  const end = cursor.seek(6);
  assert.deepEqual(end.environment.currentPlan(), changed);
  assert.deepEqual(cursor.seek(6).environment.metrics(), session.environment.metrics());
  assert.deepEqual(cursor.seek(0).environment.currentPlan(), plan);
  assert.deepEqual(cursor.seek(6).environment.metrics(), session.environment.metrics());
});
test("native squad controller preserves the existing engine outcomes", () => {
  const problem = problemRegistry.get("skirmish");
  const session = new PlatformSession(
    problem,
    { scenarioId: "triad", seed: 31, horizon: 30 },
    methodRegistry.get("squad.focus"),
  );
  session.advance(1000);
  const scenario = originalScenario("triad", 31);
  scenario.duration = 30;
  const original = createBattle(scenario, {
    controllers: { blue: "focus", orange: "focus", violet: "focus" },
  });
  while (original.phase !== "finished") stepMatch(original);
  const metrics = battleMetrics(original);
  for (const [key, value] of Object.entries(metrics))
    assert.deepEqual(session.environment.metrics()[key], value, key);
});
test("future metro stations are not exposed through algorithm observations", () => {
  const session = new PlatformSession(problemRegistry.get("metro"), {
    scenarioId: "growth",
  });
  const observation = session.environment.observe();
  assert.equal(observation.scenario.stations.length, 6);
  assert.ok(!Object.hasOwn(observation.scenario, "seed"));
  assert.ok(!Object.hasOwn(observation, "schedule"));
});
test("a third problem runs without changes to shared methods or session core", () => {
  const toy = {
    id: "test-problem",
    timeUnit: "step",
    metrics: [{ id: "score" }],
    defaultScenario: "one",
    validateConfig: (c) => ({ scenarioId: "one", seed: c.seed ?? 26 }),
    capabilities: () => ({ protocols: ["optimization/v1"], features: [] }),
    create() {
      let x = 0,
        tick = 0;
      return {
        tick: () => tick,
        time: () => tick,
        done: () => tick === 1,
        observe: () => ({ x }),
        metrics: () => ({ score: x }),
        renderState: () => ({ x }),
        clearSolution() {},
        decisionDue: (_, last) => !last,
        decisionStamp: () => ({ tick }),
        createSearchTask: () => ({
          initial: () => 0,
          sample: (rng) => 1 + Math.floor(rng() * 10),
          mutate: (n) => Math.min(10, n + 1),
          evaluate: (n) => ({ valid: true, score: n }),
        }),
        acceptSolution: (n) => (x = n),
        apply: (a) => (x = a),
        advance: () => tick++,
      };
    },
  };
  const session = new PlatformSession(
    toy,
    {},
    methodRegistry.get("hill-climb"),
    { evaluations: 8 },
  );
  session.advance();
  assert.equal(session.environment.metrics().score, 7);
  assert.throws(() => createRegistry([toy, toy], "problem"), /duplicate/);
});
test("experiments pair identical seeds and export problem-specific metrics", () => {
  const report = runExperiment(
    {
      problemId: "metro",
      scenarioIds: ["compact"],
      methodIds: ["constructive", "hill-climb"],
      seeds: [26, 27],
      evaluations: 3,
      config: { horizon: 60 },
    },
    problemRegistry,
    methodRegistry,
  );
  assert.equal(report.results.length, 4);
  assert.equal(report.summary.length, 2);
  assert.ok(report.summary.every((s) => s.n === 2));
  assert.match(resultCSV(report), /completion/);
  assert.ok(!resultCSV(report).includes("hpRatio"));
  assert.throws(
    () =>
      validateExperiment(
        { problemId: "metro", seeds: ["26", 26] },
        problemRegistry,
        methodRegistry,
      ),
    /distinct/,
  );
});
test("copied engine rules and renderer snapshots remain byte-identical", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../engines/provenance.json", import.meta.url),
      "utf8",
    ),
  );
  for (const entry of manifest.files) {
    const bytes = await readFile(new URL("../" + entry.file, import.meta.url));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      entry.sha256,
      entry.file,
    );
  }
});
