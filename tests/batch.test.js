import test from "node:test";
import assert from "node:assert/strict";
import {
  splitExperiment,
  mergeReports,
  createExperimentRunner,
} from "../web/experiment-runner.js";
test("batch splitting retains every requested method and respects episode limits", () => {
  const request = {
    scenarioIds: Array.from({ length: 11 }, (_, i) => "s" + i),
    seeds: Array.from({ length: 10 }, (_, i) => i),
    methodIds: Array.from({ length: 28 }, (_, i) => "m" + i),
  };
  const batches = splitExperiment(request);
  assert.equal(batches.length, 28);
  assert.deepEqual(
    batches.flatMap((b) => b.methodIds),
    request.methodIds,
  );
  assert.ok(
    batches.every(
      (b) => b.scenarioIds.length * b.seeds.length * b.methodIds.length <= 120,
    ),
  );
});
test("partial merged comparisons retain an explicit incomplete marker", () => {
  const request = {
    problemId: "metro",
    scenarioIds: ["a"],
    methodIds: ["x", "y"],
    seeds: [26, 27],
  };
  const report = {
    version: "hex-research/v1",
    createdAt: "2026-11-15",
    elapsedMs: 10,
    metricSchema: [{ id: "score" }],
    results: [
      {
        problemId: "metro",
        scenarioId: "a",
        methodId: "x",
        config: { horizon: 60 },
        metrics: { score: 3 },
      },
    ],
  };
  const merged = mergeReports([report], request);
  assert.equal(merged.complete, false);
  assert.equal(merged.expectedEpisodes, 4);
  assert.equal(merged.summary[0].metrics.score.mean, 3);
});
test("cancelling while a job is being created terminates that job before polling", async () => {
  let release;
  const calls = [];
  const created = new Promise((resolve) => (release = resolve));
  const api = async (path, data, method) => {
    calls.push([path, method ?? (data ? "POST" : "GET")]);
    if (path === "/api/jobs") return created;
    if (method === "DELETE") return { status: "cancelled" };
    throw new Error("Unexpected polling");
  };
  const runner = createExperimentRunner(api, () => {});
  const task = runner.run({
    scenarioIds: ["a"],
    seeds: [26],
    methodIds: ["x"],
  });
  await runner.cancel();
  release({ id: "example" });
  const result = await task;
  assert.equal(result.cancelled, true);
  assert.equal(result.completed, 0);
  assert.deepEqual(calls, [
    ["/api/jobs", "POST"],
    ["/api/jobs/example", "DELETE"],
  ]);
});
