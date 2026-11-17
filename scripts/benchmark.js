import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { problemRegistry } from "../problems/index.js";
import { methodRegistry } from "../methods/index.js";
import { runExperiment, resultCSV } from "../core/experiment.js";
const directory = new URL(
  "../experiments/integration-20261115/",
  import.meta.url,
);
await mkdir(directory, { recursive: true });
await mkdir(new URL("../experiments/runs/", import.meta.url), {
  recursive: true,
});
const seeds = process.argv[2]
  ? process.argv[2].split(",").map(Number)
  : [26, 27, 28];
let count = 0;
const summaries = [];
for (const problem of ["metro", "skirmish"].map((id) => problemRegistry.get(id))) {
  const report = runExperiment(
    {
      problemId: problem.id,
      scenarioIds: problem.scenarios.map((s) => s.id),
      methodIds: ["constructive", "random-search", "hill-climb", "annealing"],
      seeds,
      evaluations: 8,
    },
    problemRegistry,
    methodRegistry,
    {
      limitMs: 120000,
      progress: (p) => {
        if (p.completed % 12 === 0)
          console.log(`${problem.id}: ${p.completed}/${p.total}`);
      },
    },
  );
  count += report.results.length;
  await writeFile(
    new URL(problem.id + ".json", directory),
    JSON.stringify(report, null, 2),
  );
  await writeFile(new URL(problem.id + ".csv", directory), resultCSV(report));
  await writeFile(
    new URL("../experiments/runs/" + randomUUID() + ".json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  for (const row of report.summary) {
    const primary = row.metrics[problem.metrics[0].id];
    summaries.push(
      `| ${problem.id} | ${row.scenarioId} | ${row.methodId} | ${row.n} | ${primary.mean.toFixed(3)} | ${primary.sd?.toFixed(3) ?? "—"} |`,
    );
  }
}
await writeFile(
  new URL("summary.md", directory),
  `# 统一平台整合验证\n\n实际运行${count}局；11个场景；4种共享方法；种子${seeds.join(", ")}；每次规划最多8个候选评价。两种问题的指标和目标分别定义，表中地铁主指标为服务得分，小队主指标为胜率。\n\n本轮用于验证共享方法、问题适配和记录流程；3个种子不构成算法优越性或人的训练难度证据。动态地铁在当前可见站点上使用30分钟预测，搜索评价次数会随决策次数累计；小队搜索为完整仿真上的控制策略参数优化。\n\n| 问题 | 场景 | 方法 | n | 主指标均值 | 样本标准差 |\n|---|---|---|---|---|---|\n${summaries.join("\n")}\n`,
  "utf8",
);
console.log(
  JSON.stringify({ episodes: count, seeds, output: directory.pathname }),
);
