import test from "node:test";
import assert from "node:assert/strict";
import {
  assessDifficulty,
  difficultyCSV,
  empiricalTarget,
  gridInteraction,
} from "../core/difficulty.js";
import { countRailPlans } from "../core/difficulty-space.js";
import { problemRegistry } from "../problems/index.js";
import { methodRegistry } from "../methods/index.js";

const assess = (input) =>
  assessDifficulty(
    { seeds: [26], evaluations: 8, ...input },
    problemRegistry,
    methodRegistry,
  );
const summary = (report) => report.profiles[0].summary;

test("ordered rail counts respect the total track cap across labeled lines", () => {
  const scene = {
    map: { qMin: 0, qMax: 1, rMin: 0, rMax: 0, diagonalLimit: 1, terrain: {} },
    stations: [
      { id: "s0", q: 0, r: 0 },
      { id: "s1", q: 1, r: 0 },
    ],
    resources: { trackBudget: 1, maxStopsPerLine: 2, maxLines: 3 },
  };
  // Three zero-cost choices per line. A two-stop route has two directions.
  assert.equal(countRailPlans(scene), 3n ** 3n + 3n * 2n * 3n ** 2n);
  scene.resources.trackBudget = 0;
  assert.equal(countRailPlans(scene), 27n);
});

test("rail counts exclude hidden repeated hexes under the simple-path rule", () => {
  const scene = {
    map: { qMin: 0, qMax: 2, rMin: 0, rMax: 0, diagonalLimit: 2, terrain: {} },
    stations: [0, 1, 2].map((q) => ({ id: `s${q}`, q, r: 0 })),
    resources: { trackBudget: 8, maxStopsPerLine: 3, maxLines: 1 },
  };
  assert.equal(countRailPlans(scene), 12n);
  assert.equal(countRailPlans({ ...scene, trackTopology: "legacy" }), 16n);
});

test("reference calibration and interaction distinguish additive and coupled scores", () => {
  assert.equal(empiricalTarget(12, 12, 0.8), null);
  assert.equal(empiricalTarget(12, 22, 0.8), 20);
  assert.deepEqual(
    gridInteraction([
      [1, 2],
      [4, 5],
    ]),
    { maxDoubleDifference: 0, residualShare: 0 },
  );
  assert.equal(
    gridInteraction([
      [0, 0],
      [0, 8],
    ]).maxDoubleDifference,
    8,
  );
  assert.equal(
    gridInteraction([
      [0, null],
      [0, 1],
    ]),
    null,
  );
});

test("a growing metro assessment follows station openings and is repeatable", () => {
  const setup = { problemId: "metro", scenarioId: "growth" };
  const before = assess(setup);
  const after = assess({ ...setup, checkpoint: 60 });
  assert.deepEqual(summary(before).dimensions, [18]);
  assert.deepEqual(summary(after).dimensions, [27]);
  const start = before.profiles[0].rows[0].space.components.metro;
  const expanded = after.profiles[0].rows[0].space.components.metro;
  assert.ok(BigInt(expanded.orderedPlans) > BigInt(start.orderedPlans));
  assert.deepEqual(before, assess(setup));
  assert.match(
    difficultyCSV(after),
    /"metro","growth","selected","26","60","27"/,
  );
});

test("the squad reference grid separates continuous parameters from terminal search", () => {
  const setup = {
    problemId: "skirmish",
    scenarioId: "contact",
    config: { horizon: 10 },
  };
  const live = assess(setup);
  const ended = assess({ ...setup, checkpoint: 250 });
  assert.deepEqual(summary(live).dimensions, [6]);
  assert.equal(
    live.profiles[0].rows[0].space.components.skirmish.discreteExample,
    "2500",
  );
  assert.equal(summary(ended).searched, 0);
  assert.equal(summary(ended).probes[0].missedShare, null);
  assert.equal(ended.profiles[0].rows[0].search, null);
});

test("fusion compares identical initial candidate grids and respects evaluation budgets", () => {
  const result = assess({
    problemId: "fusion",
    scenarioId: "compact--contact",
    seeds: [26, 27],
    evaluations: 12,
  });
  const [both, off] = result.profiles;
  assert.equal(result.interaction.status, "measured");
  assert.equal(result.interaction.samples.length, 2);
  assert.ok(
    result.interaction.samples.some(
      (sample) => sample.active.maxDoubleDifference > 0,
    ),
  );
  assert.ok(
    result.interaction.samples.every(
      (sample) => sample.uncoupled.maxDoubleDifference === 0,
    ),
  );
  assert.deepEqual(both.summary.dimensions, [24]);
  assert.deepEqual(both.rows[0].space.components, off.rows[0].space.components);
  for (const profile of result.profiles)
    for (const row of profile.rows) {
      assert.equal(row.search.uniform.attempted, 12);
      assert.ok(row.search.probes.every((probe) => probe.evaluations <= 12));
    }
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
