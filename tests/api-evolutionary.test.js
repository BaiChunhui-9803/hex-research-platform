import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "../server/index.js";
test("taxonomy API and vector/Pareto sessions expose actual encodings and controller parameters", async (t) => {
  const server = createServer({ persist: false });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const root = "http://127.0.0.1:" + server.address().port;
  const api = async (path, data) => {
    const response = await fetch(root + path, {
      method: data ? "POST" : "GET",
      ...(data
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        : {}),
    });
    const body = await response.json();
    assert.ok(response.ok, body.error);
    return body;
  };
  const methods = await api(
    "/api/methods?problemId=metro&family=Differential%20evolution",
  );
  assert.equal(methods.length, 6);
  assert.ok(methods.every((m) => m.objective === "single"));
  const session = await api("/api/sessions", {
    problemId: "skirmish",
    config: { scenarioId: "contact", horizon: 10 },
    methodId: "nsga2",
    evaluations: 12,
    populationSize: 6,
  });
  const state = await api("/api/sessions/" + session.id + "/step", {
    steps: 1,
  });
  assert.equal(state.searchDetail.dimension, 6);
  assert.ok(state.searchDetail.paretoArchive.length > 0);
  await api("/api/sessions/" + session.id + "/controller", {
    methodId: "ga",
    evaluations: 8,
    populationSize: 4,
  });
  const replay = await api("/api/sessions/" + session.id + "/replay");
  assert.equal(replay.options.evaluations, 8);
  assert.equal(replay.options.populationSize, 4);
});
