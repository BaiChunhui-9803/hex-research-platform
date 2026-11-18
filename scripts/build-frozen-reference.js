import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { FROZEN_SCHEMA, scenarioKey } from "../core/frozen-difficulty.js";
import { problemRegistry } from "../problems/index.js";

const older = new URL(
  "../experiments/difficulty-validation-20261119/",
  import.meta.url,
);
const fresh = new URL(
  "../experiments/difficulty-calibrated-20261120/",
  import.meta.url,
);
const load = async (dir, file) =>
  JSON.parse(await readFile(new URL(file, dir), "utf8"));
const [
  oldDesign,
  newDesign,
  oldPlans,
  newPlans,
  extra,
  oldEpisodes,
  newEpisodes,
] = await Promise.all([
  load(older, "design.json"),
  load(fresh, "design.json"),
  load(older, "planning.json"),
  load(fresh, "planning.json"),
  load(older, "additional-reference.json"),
  load(older, "episodes.json"),
  load(fresh, "episodes.json"),
]);
assert.equal(oldDesign.source, newDesign.source);
assert.equal(newDesign.errors.length, 0);
const methods = newDesign.referenceMethods;
const extraByKey = new Map(
  extra.map((entry) => [`${entry.key}:${entry.seed}`, entry]),
);
const references = [];
const keys = new Set();
for (const [rows, addOlderReference] of [
  [oldPlans, true],
  [newPlans, false],
]) {
  for (const row of rows) {
    if (!row.row.search) continue;
    const runs = addOlderReference
      ? [...row.reference, extraByKey.get(`${row.key}:${row.seed}`)]
      : row.reference;
    assert.deepEqual(
      runs.map((item) => item.method),
      methods,
    );
    assert.ok(
      runs.every(
        (item) =>
          item.budget === newDesign.referenceBudget &&
          Number.isFinite(item.best),
      ),
    );
    const baseline = row.row.search.baseline;
    // Test and quick probe outcomes are deliberately not used in reference construction.
    const best = Math.max(baseline, ...runs.map((item) => item.best));
    const problem = problemRegistry.get(row.problemId);
    const config = problem.validateConfig({
      ...row.config,
      seed: row.seed,
      scenarioId: row.scenarioId,
    });
    const key = scenarioKey(row.problemId, config, row.checkpoint);
    assert.ok(!keys.has(key), "Duplicate reference instance");
    keys.add(key);
    references.push({
      problemId: row.problemId,
      config,
      checkpoint: row.checkpoint,
      baseline,
      best,
    });
  }
}
const whole = new Map();
for (const row of [...oldEpisodes, ...newEpisodes]) {
  const problemId = row.problemId;
  const config = problemRegistry.get(problemId).validateConfig({
    ...row.config,
    scenarioId: row.scenarioId,
    seed: row.seed,
  });
  const key = scenarioKey(problemId, config, 0, true);
  if (!whole.has(key)) whole.set(key, { problemId, config, episodes: [] });
  const records = whole.get(key).episodes;
  const episode = {
    seed: row.seed,
    method: row.method,
    planningBudget: row.planningBudget,
    completion: row.completion,
    win: row.win,
    hp: row.hp,
  };
  assert.ok(
    !records.some(
      (item) => item.seed === episode.seed && item.method === episode.method,
    ),
  );
  records.push(episode);
}

const catalog = {
  version: FROZEN_SCHEMA,
  id: "HEX-20261120-A",
  source: newDesign.source,
  referenceMethods: methods,
  referenceBudget: newDesign.referenceBudget,
  references,
  wholeEpisodes: [...whole.values()],
};
const output = new URL("../core/frozen-difficulty-data.json", import.meta.url);
await writeFile(output, JSON.stringify(catalog) + "\n");
console.log(
  JSON.stringify(
    {
      id: catalog.id,
      references: references.length,
      wholeEpisodeSettings: whole.size,
      wholeEpisodes: [...whole.values()].reduce(
        (total, group) => total + group.episodes.length,
        0,
      ),
    },
    null,
    2,
  ),
);
