import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resultCSV, runExperiment, summarize } from "../core/experiment.js";
import { replaySession } from "../core/session.js";
import { compatibility } from "../core/registry.js";
import { problemRegistry } from "../problems/index.js";
import { methodRegistry } from "../methods/index.js";
import { couplingProfiles, SUPPORT_CAP } from "../problems/fusion/rules.js";

const fusion = problemRegistry.get("fusion");
const folder = new URL("../experiments/fusion-validation/", import.meta.url);
const seeds = [26, 27];
const pairs = fusion.scenarios.map(({ id }) => id);
const modes = Object.keys(couplingProfiles);
const ruleConfig = { metroHorizon: 60, skirmishHorizon: 60 };
let replays = 0;

function check(report) {
  for (const episode of report.results) {
    const replay = JSON.parse(JSON.stringify(episode.replay));
    const restored = replaySession(fusion, replay).environment;
    const m = episode.metrics;
    assert.deepEqual(restored.metrics(), m, episode.id);
    assert.equal(restored.tick(), episode.config.metroHorizon);
    assert.ok(restored.done());
    assert.equal(
      m["metro.spawned"],
      m["metro.delivered"] + m["metro.waiting"] + m["metro.riding"],
    );
    assert.ok(m["metro.completion"] >= 0 && m["metro.completion"] <= 1);
    assert.ok(m["skirmish.hpRatio"] >= 0 && m["skirmish.hpRatio"] <= 1);
    assert.ok(
      m.heldMinutes <=
        Math.floor(episode.config.metroHorizon / episode.config.holdEvery),
    );
    assert.ok(restored.observe().links.stock <= SUPPORT_CAP);
    assert.ok(m.supportUsed <= m.supportProduced + 1e-9);
    if (episode.config.coupling === "none")
      assert.equal(m.supportUsed + m.heldMinutes, 0);
    if (fusion.scenarios.find(({ id }) => id === episode.scenarioId).dynamic)
      assert.ok(m["metro.editUnits"] <= episode.config.metroEditBudget);
    if (episode.searchDetail?.paretoArchive)
      assert.ok(
        episode.searchDetail.paretoArchive.every(
          ({ objectives }) => objectives.length === 4,
        ),
      );
    replays++;
  }
}

const reports = new Map();
for (const coupling of modes) {
  const report = runExperiment(
    {
      problemId: "fusion",
      scenarioIds: pairs,
      methodIds: ["constructive"],
      seeds,
      evaluations: 1,
      config: { ...ruleConfig, coupling },
    },
    problemRegistry,
    methodRegistry,
  );
  check(report);
  reports.set(coupling, report);
  console.log(`${coupling}: ${report.results.length} episodes verified`);
}
const combined = [...reports.values()].flatMap((report) => report.results);
const baseline = reports.get("none").results.length;
function effect(from, to, keys) {
  const source = new Map(
    reports.get(from).results.map(({ id, metrics }) => [id, metrics]),
  );
  return reports
    .get(to)
    .results.filter((episode) =>
      keys.some((key) => episode.metrics[key] !== source.get(episode.id)[key]),
    ).length;
}
const battleMeasures = ["skirmish.win", "skirmish.hpMargin", "skirmish.time"];
const railMeasures = [
  "metro.delivered",
  "metro.meanJourney",
  "metro.averageQueue",
];
const supplyChangesBattle = effect("none", "supply", battleMeasures);
const disruptionChangesMetro = effect("none", "disruption", railMeasures);
const disruptionFeedsBackToBattle = effect("supply", "both", battleMeasures);
const supplyFeedsBackToRail = effect("disruption", "both", [
  ...railMeasures,
  "heldMinutes",
]);
const twoWayActive = reports
  .get("both")
  .results.filter(
    ({ metrics }) => metrics.supportUsed > 0 && metrics.heldMinutes > 0,
  ).length;
assert.ok(
  supplyChangesBattle > 0 && disruptionChangesMetro > 0 && twoWayActive > 0,
);
assert.ok(disruptionFeedsBackToBattle > 0 && supplyFeedsBackToRail > 0);

const methodPairs = [
  "lumen--contact",
  "growth--triad",
  "growth-rush--asymmetric",
];
const methods = methodRegistry
  .list()
  .filter((method) =>
    methodPairs.every(
      (id) => compatibility(method, fusion.capabilities(id)).compatible,
    ),
  )
  .map(({ id }) => id);
const methodConfig = {
  metroHorizon: 180,
  skirmishHorizon: 60,
  coupling: "both",
};
const methodReport = runExperiment(
  {
    problemId: "fusion",
    scenarioIds: methodPairs,
    methodIds: methods,
    seeds,
    evaluations: 8,
    config: methodConfig,
  },
  problemRegistry,
  methodRegistry,
  {
    progress: ({ completed, total }) => {
      if (completed % 40 === 0)
        console.log(`Shared methods: ${completed}/${total}`);
    },
  },
);
check(methodReport);
assert.equal(methods.length, 20);
const audit = {
  ruleEpisodes: combined.length,
  methodEpisodes: methodReport.results.length,
  replayMatches: replays,
  mapPairs: pairs.length,
  modes,
  seeds,
  methods,
  methodPairs,
  ruleConfig,
  methodConfig,
  evaluationsPerPlanningDecision: methodReport.request.evaluations,
  pairedCasesPerMode: baseline,
  supplyChangesBattle,
  disruptionChangesMetro,
  twoWayActive,
  disruptionFeedsBackToBattle,
  supplyFeedsBackToRail,
};
await mkdir(folder, { recursive: true });
await writeFile(
  new URL("rules.csv", folder),
  resultCSV({ metricSchema: fusion.metrics, results: combined }),
);
await writeFile(
  new URL("methods.json", folder),
  JSON.stringify(methodReport, null, 2) + "\n",
);
await writeFile(new URL("methods.csv", folder), resultCSV(methodReport));
await writeFile(
  new URL("verification.json", folder),
  JSON.stringify(audit, null, 2) + "\n",
);

const summaries = summarize(methodReport.results, fusion.metrics);
const mapRows = methodPairs.map((pair) => {
  const rows = summaries.filter(({ scenarioId }) => scenarioId === pair);
  const range = (key) => {
    const values = rows.map(({ metrics }) => metrics[key].mean);
    return `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`;
  };
  return `| ${pair} | ${rows.length} | ${range("metro.delivered")} | ${range("skirmish.hpRatio")} | ${range("score")} |`;
});
await writeFile(
  new URL("summary.md", folder),
  [
    "# 问题融合器验证",
    "",
    `共运行 ${replays} 局并逐局回放。规则对照覆盖 ${pairs.length} 个地图组合、四种联动设置和两个种子。共享算法矩阵覆盖 3 个地图组合、${methods.length} 种方法和两个种子，每次规划预算为 8 个候选。`,
    "",
    `与关闭联动相比，仅补给在 ${supplyChangesBattle}/${baseline} 个配对条件下改变了小队胜负、生命差或持续时间，仅停运在 ${disruptionChangesMetro}/${baseline} 个条件下改变了送达、平均耗时或队列。双向设置中，${twoWayActive}/${baseline} 局同时用到了补给和停运。`,
    "",
    `在仅补给的基础上加入停运，${disruptionFeedsBackToBattle}/${baseline} 个条件下的小队结果变化。在仅停运的基础上加入补给，${supplyFeedsBackToRail}/${baseline} 个条件下的地铁结果或停运时间变化。`,
    "",
    "| 地图组合 | 方法数 | 各方法平均送达范围 | 各方法平均己方生命比例范围 | 各方法平均联合分范围 |",
    "|---|---:|---:|---:|---:|",
    ...mapRows,
    "",
    "用途是检验联动规则、适配范围和可复现性。两个种子的轻预算结果适合功能核验。",
    "",
    "[规则对照 CSV](rules.csv) · [方法矩阵 CSV](methods.csv) · [含回放的完整方法矩阵](methods.json) · [核验记录](verification.json)",
    "",
  ].join("\n"),
);
console.log(JSON.stringify(audit, null, 2));
