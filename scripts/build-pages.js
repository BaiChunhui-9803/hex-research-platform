import { cp, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const dist = path.join(root, "dist");
const evidence = "docs/evolutionary-baselines-20261115";
const design = "docs/design-reference-library-20261115";
const recorded = "experiments/2026-11-15-evolutionary-baselines";
const integration = "experiments/integration-20261115";
const fusionValidation = "experiments/fusion-validation";
const topologyStudy = "experiments/simple-track-fusion";

const existing = await lstat(dist).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});
if (existing) {
  if (!existing.isDirectory() || (await realpath(dist)) !== dist)
    throw new Error("The Pages build output must be a real dist directory");
  await rm(dist, { recursive: true });
}
await mkdir(dist);

async function copy(source, target = source, options = {}) {
  const destination = path.join(dist, target);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, source), destination, options);
}

for (const folder of ["core", "engines", "methods", "problems", "web"]) {
  await copy(folder, folder, {
    recursive: true,
    filter: (source) => !["web/index.html", "engines/provenance.json"].includes(
      path.relative(root, source).split(path.sep).join("/"),
    ),
  });
}

const index = await readFile(path.join(root, "web/index.html"), "utf8");
await writeFile(
  path.join(dist, "index.html"),
  index
    .replace('name="hex-runtime" content="server"', 'name="hex-runtime" content="browser"')
    .replace(/\b(href|src)="\/(?!\/)/g, '$1="./'),
);
await writeFile(path.join(dist, ".nojekyll"), "");

for (const file of ["api.md", "extensions.md", "fusion.md", "difficulty.md", "contracts.d.ts"]) {
  await copy(`docs/${file}`);
}
for (const file of [
  "index.html", "review.zh-CN.html", "review.zh-CN.md", "evidence.css",
  "journal-references.csv", "journal-references.bib", "catalogue.json",
  "citation-frequency.csv", "reference-index.json", "algorithm-catalogue.json",
]) {
  if (file.endsWith(".html")) {
    const html = await readFile(path.join(root, evidence, file), "utf8");
    await mkdir(path.join(dist, evidence), { recursive: true });
    await writeFile(path.join(dist, evidence, file), html.replaceAll('href="/"', 'href="../../"'));
  } else {
    await copy(`${evidence}/${file}`);
  }
}
for (const file of ["index.html", "report.zh-CN.html", "reference-table.csv"]) {
  await copy(`${design}/public/${file}`, `${design}/${file}`);
}
await copy(`${design}/library.css`);
await copy(`${design}/prototypes`, `${design}/prototypes`, { recursive: true });
await copy("web/assets/fonts", `${design}/assets/fonts`, { recursive: true });
for (const file of ["summary.zh-CN.md", "comparison-deltas.csv", "validation.json"]) {
  await copy(`${recorded}/${file}`);
}

const runs = [];
for (const problemId of ["metro", "skirmish"]) {
  const url = `${recorded}/${problemId}.json`;
  await copy(url);
  await copy(`${recorded}/${problemId}.csv`);
  await copy(`${integration}/${problemId}.json`);
  const report = JSON.parse(await readFile(path.join(root, url), "utf8"));
  runs.push({
    id: `evolutionary-${problemId}`,
    url,
    problemId,
    episodes: report.results.length,
    createdAt: report.createdAt,
  });
}
for (const file of ["summary.md", "rules.csv", "methods.csv", "methods.json", "verification.json"]) {
  await copy(`${fusionValidation}/${file}`);
}
for (const file of ["summary.zh-CN.md", "measurements.json"]) await copy(`${topologyStudy}/${file}`);
const fusionReportUrl = `${fusionValidation}/methods.json`;
const fusionReport = JSON.parse(await readFile(path.join(root, fusionReportUrl), "utf8"));
runs.push({
  id: "fusion-validation",
  url: fusionReportUrl,
  problemId: "fusion",
  episodes: fusionReport.results.length,
  createdAt: fusionReport.createdAt,
});
await writeFile(
  path.join(dist, "experiments/published-runs.json"),
  JSON.stringify(runs, null, 2) + "\n",
);
console.log("Built GitHub Pages site in dist/");
