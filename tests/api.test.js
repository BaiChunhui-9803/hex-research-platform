import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "../server/index.js";

test("unified discovery, sessions, compatibility, jobs and cancellation", async (t) => {
  const server = createServer({ persist: false });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  async function api(path, data, method) {
    const res = await fetch(root + path, {
      method: method ?? (data ? "POST" : "GET"),
      ...(data
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        : {}),
    });
    return { status: res.status, data: await res.json() };
  }
  assert.deepEqual(
    (await api("/api/problems")).data.map((p) => p.id),
    ["metro", "skirmish", "fusion"],
  );
  const joined = await api("/api/problems/fusion");
  const evaluated = await api("/api/difficulty", {
    problemId: "metro", scenarioId: "compact", seeds: [26], evaluations: 8,
  });
  assert.equal(evaluated.status, 200);
  assert.equal(evaluated.data.version, "hex-difficulty/v1");
  assert.deepEqual(evaluated.data.profiles[0].summary.dimensions, [18]);
  assert.equal(evaluated.data.frozen.profiles[0].rows[0].status, "no-reference");
  assert.equal(evaluated.data.profiles[0].rows[0].space.components.metro.trackTopology, "simple");
  assert.equal((await api("/api/difficulty", {
    problemId: "fusion", seeds: [26, 26], evaluations: 8,
  })).status, 400);
  assert.deepEqual(joined.data.sourceProblems, ["metro", "skirmish"]);
  assert.equal(joined.data.scenarios.length, 30);
  const compatible = await api("/api/methods?problemId=fusion&scenarioId=growth--triad&compatible=true");
  assert.equal(compatible.data.length, 20);
  const assembled = await api("/api/sessions", {
    problemId: "fusion", config: { scenarioId: "lumen--mixed", metroHorizon: 60, skirmishHorizon: 60 },
    methodId: "nsga2", evaluations: 3,
  });
  assert.equal(assembled.status, 201);
  const fusionId = assembled.data.id;
  const fusionStep = await api(`/api/sessions/${fusionId}/step`, { steps: 1 });
  assert.equal(fusionStep.data.searchDetail.objectiveSchema.length, 4);
  assert.equal(fusionStep.data.observation.components.metro.time, 1);
  assert.equal((await api(`/api/sessions/${fusionId}/actions`, {
    action: { type: "component", component: "unknown" },
  })).status, 400);
  const fusedReplay = (await api(`/api/sessions/${fusionId}/replay`)).data;
  assert.equal((await api("/api/replays/verify", fusedReplay)).data.matches, true);
  assert.equal((await api(`/api/sessions/${fusionId}`, null, "DELETE")).status, 200);
  const methods = (
    await api("/api/methods?problemId=skirmish&scenarioId=contact")
  ).data;
  assert.equal(methods.find((m) => m.id === "hill-climb").compatible, true);
  assert.equal(methods.find((m) => m.id === "metro.repair").compatible, false);
  assert.equal(
    (
      await api("/api/sessions", {
        problemId: "metro",
        methodId: "squad.focus",
      })
    ).status,
    400,
  );
  const created = await api("/api/sessions", {
    problemId: "skirmish",
    config: { scenarioId: "contact", horizon: 10 },
    methodId: "squad.focus",
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(
    (await api(`/api/sessions/${id}/step`, { steps: 5 })).data.tick,
    5,
  );
  assert.ok((await api(`/api/sessions/${id}/observe`)).data.own.length > 0);
  assert.equal(
    (await api(`/api/sessions/${id}/step`, { steps: 0 })).status,
    400,
  );
  const recording = (await api(`/api/sessions/${id}/replay`)).data;
  assert.equal(
    (await api("/api/replays/verify", recording)).data.matches,
    true,
  );
  assert.equal((await api(`/api/sessions/${id}`, null, "DELETE")).status, 200);
  const job = await api("/api/jobs", {
    problemId: "metro",
    scenarioIds: ["compact"],
    methodIds: ["constructive", "hill-climb"],
    seeds: [26],
    evaluations: 2,
    config: { horizon: 60 },
  });
  assert.equal(job.status, 202);
  let result;
  for (let i = 0; i < 100; i++) {
    result = (await api("/api/jobs/" + job.data.id)).data;
    if (result.status !== "running") break;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(result.status, "done");
  assert.equal(result.report.results.length, 2);
  const csv = await fetch(root + "/api/jobs/" + job.data.id + "/csv");
  assert.match(await csv.text(), /delivered/);
  const jointJob = await api("/api/jobs", {
    problemId: "fusion",
    scenarioIds: ["lumen--mixed", "growth--triad"],
    methodIds: ["constructive"],
    seeds: [26],
    evaluations: 1,
    config: { metroHorizon: 60, skirmishHorizon: 60, coupling: "both" },
  });
  assert.equal(jointJob.status, 202);
  const jointPath = "/api/jobs/" + jointJob.data.id;
  let jointResult;
  for (let i = 0; i < 100; i++) {
    jointResult = (await api(jointPath)).data;
    if (jointResult.status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(jointResult.status, "done");
  assert.equal(jointResult.report.results.length, 2);
  const jointCSV = await fetch(root + jointPath + "/csv");
  assert.match(await jointCSV.text(), /"supportUsed".*"coupling"/);
  assert.equal((await fetch(root + "/web/index.html")).status, 200);
  assert.equal((await fetch(root + "/package.json")).status, 404);
  assert.equal((await fetch(root + "/core/%2e%2e%5cpackage.json")).status, 404);
  const longJob = await api("/api/jobs", {
    problemId: "skirmish",
    scenarioIds: ["crossfire", "triad"],
    methodIds: ["annealing"],
    seeds: [26, 27],
    evaluations: 64,
  });
  assert.equal(longJob.status, 202);
  const cancelled = (await api("/api/jobs/" + longJob.data.id, null, "DELETE"))
    .data;
  assert.equal(cancelled.status, "cancelled");
});
