import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { railPlanReference } from "../core/difficulty-space.js";
import { runExperiment } from "../core/experiment.js";
import { rankRuleCandidates } from "../core/rule-composition.js";
import { createReplayCursor } from "../core/session.js";
import { trackCell } from "../engines/metro/shared/track-geometry.js";
import { methodRegistry } from "../methods/index.js";
import { problemRegistry } from "../problems/index.js";

const output = new URL("../experiments/simple-track-fusion/", import.meta.url);
const archive = new URL("../web/archive/simple-metro.json", import.meta.url);
const metro = problemRegistry.get("metro");
const fusion = problemRegistry.get("fusion");
const seeds = [28, 30];
const methodIds = ["constructive", "annealing", "nsga2"];
const evaluations = 12;
const horizon = 180;
const pairs = ["compact--contact", "lumen--contact", "lumen--mixed", "growth--triad", "growth-rush--asymmetric"];
const modes = ["legacy", "simple"];
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const percent = (value) => `${(100 * value).toFixed(2)}%`;

function overlappingLineCount(paths) {
  return Object.values(paths).filter((segments) => {
    const cells = segments.flatMap((segment, index) => index ? segment.cells.slice(1) : segment.cells).map(trackCell);
    return new Set(cells).size < cells.length;
  }).length;
}

function auditMetro(replay) {
  const cursor = createReplayCursor(metro, replay);
  const times = [...new Set([0, ...replay.actions.map(({ step }) => step + 1), replay.finalStep])]
    .filter((tick) => tick <= replay.finalStep).sort((a, b) => a - b);
  const violations = times.map((tick) => overlappingLineCount(cursor.seek(tick).environment.trackPaths()));
  assert.deepEqual(cursor.seek().environment.metrics(), replay.finalMetrics);
  return Math.max(...violations);
}

const structure = [], episodes = [], recordings = [], compositions = [];
for (const { id: scenarioId } of metro.scenarios) {
  for (const seed of seeds) {
    const counts = modes.map((trackTopology) => {
      const env = metro.create(metro.validateConfig({ scenarioId, seed, trackTopology }));
      const { count, kind } = railPlanReference(env.observe().scenario);
      return { trackTopology, count: count.toString(), kind };
    });
    structure.push({ scenarioId, seed, counts });
  }
  for (const trackTopology of modes) {
    const report = runExperiment({
      problemId: "metro", scenarioId, methodIds, seeds, evaluations,
      config: { horizon, trackTopology },
    }, problemRegistry, methodRegistry);
    for (const { replay, metrics } of report.results) {
      const overlappingLines = auditMetro(replay);
      if (trackTopology === "simple") {
        assert.equal(overlappingLines, 0);
        recordings.push(replay);
      }
      episodes.push({ scenarioId, seed: replay.config.seed, method: replay.methodId, trackTopology, overlappingLines,
        delivered: metrics.delivered, completion: metrics.completion, track: metrics.track });
    }
  }
}

for (const scenarioId of pairs) {
  for (const metroTrackTopology of modes) {
    const report = fusion.design({ scenarioId, seed: 28, metroHorizon: horizon, skirmishHorizon: 60,
      metroTrackTopology, designGoal: "agency" });
    assert.ok(report.config);
    const candidates = report.candidates.map(({ id, name, supplyName, accepted, status, summary, samples, sensitivity }) => ({
      id, name, supplyName, accepted, status, summary, samples, sensitivity,
    }));
    compositions.push({ scenarioId, metroTrackTopology, seeds: report.seeds, agency: report.selected,
      service: rankRuleCandidates(candidates, "service").selected, candidates });
  }
}

const result = {
  protocol: {
    metro: { seeds, methodIds, evaluations, horizon },
    fusion: { pairs, seeds: [28, 29], metroHorizon: horizon, skirmishHorizon: 60,
      construction: "constructive", engagement: "focus", rotation: "all starting factions",
      control: "the supply-off control has the same construction actions, rail plan and service outcome" },
  },
  structure, episodes, compositions,
};
const legacy = episodes.filter(({ trackTopology }) => trackTopology === "legacy");
const strict = episodes.filter(({ trackTopology }) => trackTopology === "simple");
const matched = strict.map((row) => {
  const previous = legacy.find((x) => x.scenarioId === row.scenarioId && x.seed === row.seed && x.method === row.method);
  return { ...row, deliveryDelta: row.delivered - previous.delivered, trackDelta: row.track - previous.track };
});
const perMap = metro.scenarios.map(({ id, name }) => {
  const rows = matched.filter(({ scenarioId }) => scenarioId === id);
  return `| ${name} | ${rows.length} | ${mean(rows.map(({ deliveryDelta }) => deliveryDelta)).toFixed(2)} | ${mean(rows.map(({ trackDelta }) => trackDelta)).toFixed(2)} |`;
});
const candidateRows = compositions.filter(({ metroTrackTopology }) => metroTrackTopology === "simple").map((entry) => {
  const selected = entry.candidates.find(({ id }) => id === entry.agency);
  return `| ${entry.scenarioId} | ${entry.agency} | ${entry.service} | ${percent(selected.summary.participation)} | ${percent(selected.summary.delivery)} | ${(100 * selected.summary.hpGain).toFixed(2)} |`;
});
const lumen = structure.find(({ scenarioId, seed }) => scenarioId === "lumen" && seed === 28);
const summary = `# 简单路径约束与融合验证

## 地铁规则对照

使用五张地铁地图、种子 28 和 30、Constructive、Annealing 和 NSGA-II。两种轨道规则的每组规划预算均为 12，运行 180 分钟，共 ${matched.length} 对、${episodes.length} 局。每局重建并检查开局、提交规划后的状态和终局。

- 旧规则下有 ${legacy.filter(({ overlappingLines }) => overlappingLines > 0).length}/${legacy.length} 局实际出现单线轨迹重访。简单路径规则下为 ${strict.filter(({ overlappingLines }) => overlappingLines > 0).length}/${strict.length}。
- Lumen City 的 seed 28 在开局有 ${lumen.counts[0].count} 个旧规则下的有序线路计划，简单路径规则下有 ${lumen.counts[1].count} 个。计数包含空线路、正反方向和跨线共享轨道。
- 新旧规则采用各自的可行空间重新规划。送达变化反映这批方法在两种可行空间内的表现。

| 地图 | 配对局数 | 简单路径送达人数变化 | 轨道用量变化 |
|---|---:|---:|---:|
${perMap.join("\n")}

## 特性表驱动融合

三种施工权限与两种公共补给分配组合成六个候选。五组地图使用种子 28、29，按阵营轮换首手。每次关闭补给的对照保留相同的轨道方案、种子和首手。下表采用简单路径规则。HP 差为与对应关闭补给对照相比，各阵营终局剩余 HP 比例的平均百分点变化。

| 地图组合 | 参与优先选中 | 送达优先选中 | 参与率 | 送达率 | HP 差（百分点） |
|---|---|---|---:|---:|---:|
${candidateRows.join("\n")}

实验记录包括每次试跑的线路、占用轨道、配对生命值变化及首段换线的结果。样本采用构造式施工与相同原生交战策略。
`;
await mkdir(output, { recursive: true });
await writeFile(new URL("measurements.json", output), JSON.stringify(result) + "\n");
await writeFile(new URL("summary.zh-CN.md", output), summary);
await writeFile(archive, JSON.stringify(recordings) + "\n");
console.log(`${episodes.length} metro episodes, ${compositions.length} composition screens, and ${recordings.length} simple-track benchmark replays.`);
