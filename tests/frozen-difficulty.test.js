import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  addFrozenDifficulty,
  scenarioKey,
  summarizeWholeEpisodes,
} from "../core/frozen-difficulty.js";
import { assessDifficulty, difficultyCSV } from "../core/difficulty.js";
import { methodRegistry } from "../methods/index.js";
import { problemRegistry } from "../problems/index.js";

const archive = JSON.parse(
  await readFile(
    new URL("../core/frozen-difficulty-data.json", import.meta.url),
    "utf8",
  ),
);

test("archive keys require the exact configuration and separate planning from episode cohorts", () => {
  const a = { seed: 26, horizon: 60, scenarioId: "contact" };
  const b = { scenarioId: "contact", horizon: 60, seed: 27 };
  assert.equal(
    scenarioKey("skirmish", a, 0, true),
    scenarioKey("skirmish", b, 0, true),
  );
  assert.notEqual(scenarioKey("skirmish", a, 0), scenarioKey("skirmish", b, 0));
  assert.notEqual(
    scenarioKey("skirmish", a, 0),
    scenarioKey("skirmish", a, 10),
  );
  assert.equal(
    new Set(
      archive.references.map((r) =>
        scenarioKey(r.problemId, r.config, r.checkpoint),
      ),
    ).size,
    393,
  );
  assert.equal(
    archive.wholeEpisodes.reduce((sum, row) => sum + row.episodes.length, 0),
    846,
  );
});

test("frozen targets rescore actual probe traces and preserve missing seed coverage", () => {
  const raw = assessDifficulty(
    {
      problemId: "metro",
      scenarioId: "compact",
      config: { trackTopology: "legacy" },
      seeds: [26, 1000],
      evaluations: 12,
    },
    problemRegistry,
    methodRegistry,
  );
  const report = addFrozenDifficulty(raw, archive);
  const [profile] = report.frozen.profiles;
  assert.equal(profile.rows[0].status, "calibrated");
  assert.equal(profile.rows[1].status, "no-reference");
  assert.equal(profile.curves.length, 6);
  assert.ok(profile.curves.every((item) => item.eligible === 1));
  assert.deepEqual(
    profile.curves[0].points.map((item) => item.budget),
    [8, 12],
  );
  assert.ok(profile.wholeEpisodes.some((item) => item.seeds.includes(29)));
  assert.match(difficultyCSV(report), /"frozen_target_80"/);
  assert.deepEqual(addFrozenDifficulty(raw, null).frozen, {
    status: "unavailable",
    profiles: [],
  });
});

test("joint whole-episode success requires both game goals", () => {
  const input = [
    {
      seed: 26,
      method: "a",
      planningBudget: 16,
      completion: 0.6,
      win: 1,
      hp: 0.3,
    },
    {
      seed: 27,
      method: "a",
      planningBudget: 16,
      completion: 0.8,
      win: 1,
      hp: 0.1,
    },
    {
      seed: 28,
      method: "a",
      planningBudget: 16,
      completion: 0.4,
      win: 0,
      hp: 0.9,
    },
  ];
  assert.deepEqual(
    summarizeWholeEpisodes(input)[0].goals.map((item) => item.reached),
    [1, 1, 0],
  );
});
