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
  assert.equal((await api("/api/problems")).data.length, 2);
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
