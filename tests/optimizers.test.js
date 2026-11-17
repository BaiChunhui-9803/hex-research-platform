import test from "node:test";
import assert from "node:assert/strict";
import { methodRegistry } from "../methods/index.js";
import { problemRegistry } from "../problems/index.js";
import { random } from "../core/random.js";
import { PlatformSession, replaySession } from "../core/session.js";
import {
  dominates,
  fronts,
  crowding,
  spea2Environmental,
} from "../methods/numeric/multiobjective.js";
import { symmetricEigen } from "../methods/numeric/cmaes.js";
import { filterMethods, taxonomyOptions } from "../methods/taxonomy.js";
const vectorMethods = methodRegistry
  .list()
  .filter((m) => m.protocol === "vector-optimization/v1");
function sphere(multi = false) {
  return {
    protocol: "vector-optimization/v1",
    dimension: 3,
    initial: () => [0.9, 0.9, 0.9],
    decode: (x) => [...x],
    objectiveSchema: [
      { id: "a", name: "a" },
      { id: "b", name: "b" },
    ],
    evaluate(x) {
      return {
        valid: true,
        score: -x.reduce((s, v) => s + (v - 0.2) ** 2, 0),
        objectives: multi
          ? [
              x.reduce((s, v) => s + v * v, 0),
              x.reduce((s, v) => s + (1 - v) ** 2, 0),
            ]
          : null,
      };
    },
  };
}
test("bounded optimizers are deterministic, budgeted and retain an initial feasible solution", () => {
  for (const method of vectorMethods) {
    const task = sphere(method.objective === "multi"),
      options = { evaluations: 128 };
    const a = method.solve(task, options, { random: random(31) }),
      b = method.solve(task, options, { random: random(31) });
    assert.deepEqual(a, b, method.id);
    assert.ok(a.evaluations <= 128, method.id);
    assert.ok(
      a.solution.every((x) => x >= 0 && x <= 1),
      method.id,
    );
    assert.ok(Number.isFinite(a.score), method.id);
    if (method.objective === "single")
      assert.ok(a.score >= task.evaluate(task.initial()).score, method.id);
    else {
      assert.ok(a.paretoArchive.length >= 1);
      for (const x of a.paretoArchive)
        for (const y of a.paretoArchive)
          assert.equal(
            dominates({ valid: true, ...x }, { valid: true, ...y }),
            false,
            method.id,
          );
    }
  }
});
test("CMA eigen decomposition reconstructs a rotated symmetric covariance", () => {
  const matrix = [
      [4, 1, 2],
      [1, 3, 0.5],
      [2, 0.5, 5],
    ],
    { values, vectors } = symmetricEigen(matrix);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const v = values.reduce(
        (s, x, k) => s + vectors[i][k] * x * vectors[j][k],
        0,
      );
      assert.ok(Math.abs(v - matrix[i][j]) < 1e-8);
    }
});
test("Pareto ranking, crowding and SPEA2 truncation preserve extreme points", () => {
  const points = [
    [0, 4],
    [1, 3],
    [2, 2],
    [3, 1],
    [4, 0],
    [3, 4],
  ].map((objectives, i) => ({
    x: [i / 6],
    objectives,
    valid: true,
    score: -objectives.reduce((a, b) => a + b, 0),
  }));
  const layers = fronts(points);
  assert.equal(layers[0].length, 5);
  assert.equal(layers[1].length, 1);
  crowding(layers[0]);
  assert.equal(points[0].crowding, Infinity);
  assert.equal(points[4].crowding, Infinity);
  const selected = spea2Environmental(points, 3);
  assert.ok(selected.includes(points[0]));
  assert.ok(selected.includes(points[4]));
});
test("vector encodings reproduce native initial routes and exclude hidden stations", () => {
  const p = problemRegistry.get("metro"),
    session = new PlatformSession(p, { scenarioId: "growth" }),
    env = session.environment;
  const a = env.createVectorTask(),
    native = env.createSearchTask();
  assert.equal(a.dimension, 18);
  assert.deepEqual(a.decode(a.initial()), native.initial());
  env.advance();
  for (let i = 1; i < 60; i++) env.advance();
  assert.equal(env.createVectorTask().dimension, 27);
});
test("all added methods solve both games and their deployed decisions replay exactly", () => {
  for (const pid of ["metro", "skirmish"])
    for (const method of methodRegistry
      .list()
      .filter((m) => m.mode === "search")) {
      const p = problemRegistry.get(pid),
        session = new PlatformSession(
          p,
          {
            scenarioId: pid === "metro" ? "compact" : "contact",
            horizon: pid === "metro" ? 60 : 10,
          },
          method,
          { evaluations: 12 },
        );
      session.advance(1000);
      assert.ok(
        Number.isFinite(session.environment.metrics().score),
        method.id,
      );
      assert.deepEqual(
        replaySession(
          p,
          JSON.parse(JSON.stringify(session.replay())),
        ).environment.metrics(),
        session.environment.metrics(),
        pid + ":" + method.id,
      );
    }
});
test("hierarchical filters narrow to actual families and compatible native strategies", () => {
  const all = methodRegistry.list(),
    cap = problemRegistry.get("metro").capabilities("growth");
  assert.equal(all.length, 28);
  assert.equal(
    filterMethods(all, {
      category: "Evolutionary",
      family: "Differential evolution",
    }).length,
    6,
  );
  assert.equal(filterMethods(all, { objective: "multi" }).length, 3);
  assert.ok(
    filterMethods(
      all,
      { objective: "control", compatibleOnly: true },
      cap,
    ).every((m) => m.id.startsWith("metro.")),
  );
  assert.deepEqual(taxonomyOptions(all, { objective: "multi" }).categories, [
    "Multiobjective",
  ]);
});
