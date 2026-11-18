import { difficultyCSV } from "../core/difficulty.js";
import { benchmarkSettings } from "../core/frozen-difficulty.js";

const labels = {
  selected: "Selected scenario",
  both: "Two-way coupling",
  none: "Coupling off",
  supply: "Metro supports squad",
  disruption: "Squad affects metro",
};
const methodLabels = { uniform: "Uniform random", ga: "Real-coded GA" };
const agentLabels = {
  constructive: "Constructive", annealing: "Simulated annealing",
  "pso-inertia": "Inertia PSO", "hill-climb": "Hill climbing", "de-rand": "DE/rand/1/bin",
};
const referenceStatus = {
  calibrated: "Target available", "no-reference": "Settings or seed outside catalog",
  "no-reference-gain": "No improvement in archived reference",
  "baseline-mismatch": "Initial score differs from archive", finished: "Episode finished",
};
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const escapeHTML = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (symbol) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[symbol],
  );
const fmt = (value) => (Number.isFinite(value) ? number.format(value) : "—");
const percent = (value) =>
  Number.isFinite(value) ? `${fmt(value * 100)}%` : "—";
const sampleRatio = (count, total) =>
  total ? `${count}/${total} · ${percent(count / total)}` : "—";

function countLabel(value) {
  if (!value) return "—";
  const recorded = BigInt(value).toLocaleString("en-US");
  return value.length <= 12
    ? recorded
    : `<span title="${recorded}">${value[0]}.${value.slice(1, 4)} × 10<sup>${value.length - 1}</sup></span>`;
}

function table(headers, rows) {
  const head = headers.map((field) => `<th scope="col">${field}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderFrozen(frozen, request) {
  const heading = "<h3>Frozen-target search difficulty</h3>";
  if (frozen?.status !== "loaded")
    return heading + '<p class="muted">The reference catalog is currently unavailable.</p>';
  const calibratedCount = frozen.profiles.flatMap(({ rows }) => rows)
    .filter(({ status }) => status === "calibrated").length;
  const probes = frozen.profiles.flatMap(({ label, curves }) =>
    curves.filter(({ eligible }) => eligible).map((curve) => [
      labels[label], `${curve.percent}%`, methodLabels[curve.method],
      ...curve.points.map((point) => sampleRatio(point.reached, curve.eligible)),
    ]),
  );
  const checkpoints = frozen.profiles[0].curves[0].points.map((point) => `≤ ${point.budget} evals`);
  const seedRows = frozen.profiles.flatMap((profile) => profile.rows.map((row) => [
    `${labels[profile.label]} / ${row.seed}`, referenceStatus[row.status],
    fmt(row.baseline), fmt(row.best), ...[50, 80, 95].map((q) =>
      fmt(row.targets.find(({ percent: target }) => target === q)?.score)),
  ]));
  const battleOnly = request.problemId === "skirmish";
  const outcomes = frozen.profiles.flatMap(({ label, wholeEpisodes }) =>
    wholeEpisodes.map((row) => [
      labels[label], escapeHTML(agentLabels[row.method] ?? row.method),
      row.budget, row.seeds.join(", "), row.episodes,
      ...(battleOnly ? [sampleRatio(row.goals[0].reached, row.episodes)] :
        row.goals.map((goal) => sampleRatio(goal.reached, row.episodes))),
    ]),
  );
  const goalHeaders = battleOnly ? ["Win and ≥ 20% HP"] :
    ["35% delivered", "50% delivered", "65% delivered"];
  return `
    ${heading}
    <p class="muted">Catalog ${escapeHTML(frozen.id)} · ${calibratedCount} calibrated profile-seeds.
    Targets use 50%, 80% and 95% of the improvement from the initial score to an independently archived reference. Rates count hits from this run.</p>
    ${probes.length ? table(["Profile", "Target", "Probe", ...checkpoints], probes) :
      '<p class="muted">No matched target. Try the benchmark setup and a catalog seed, or use the short-sample results below.</p>'}
    <details><summary>Frozen scores and seed coverage</summary>
      ${table(["Profile / seed", "Coverage", "Initial", "Reference", "50% target", "80% target", "95% target"], seedRows)}
    </details>
    <h3>Archived whole-episode outcomes</h3>
    ${outcomes.length ? `
      <p class="muted">Prior agent simulations for the matching scenario settings. The seeds shown here come from the archive. ${request.problemId === "fusion" ? "All three delivery gates also require a win with at least 20% health." : ""}</p>
      ${table(["Profile", "Agent", "Evals per plan", "Archive seeds", "Episodes", ...goalHeaders], outcomes)}` :
      '<p class="muted">Whole-episode outcomes are available for matching start-of-episode benchmark settings.</p>'}
  `;
}

function renderReport(report, name) {
  const { request, profiles, interaction } = report;
  const selected = profiles[0].summary;
  const ga = selected.probes.find((item) => item.id === "ga");
  const fixedGa = report.frozen?.profiles[0]?.curves.find((item) => item.percent === 80 && item.method === "ga");
  const hasFrozen = fixedGa?.eligible > 0;
  const misses = hasFrozen ? fixedGa.eligible - fixedGa.points.at(-1).reached : ga.eligible - ga.reached;
  const denom = hasFrozen ? fixedGa.eligible : ga.eligible;
  const label = (entry) => labels[entry.label];
  const rate = (probe) =>
    probe.eligible
      ? `<strong>${probe.reached}/${probe.eligible}</strong><progress aria-label="Target hit rate" value="${probe.reached}" max="${probe.eligible}"></progress>`
      : "—";
  const searchTable = table(
    [
      "Profile",
      "Probe",
      "Hits at half budget",
      "Hits at full budget",
      "Missed target",
      "Mean evaluations on hit",
    ],
    profiles.flatMap((item) =>
      item.summary.probes.map((probe) => [
        label(item),
        methodLabels[probe.id],
        probe.eligible ? `${probe.reachedAtHalf}/${probe.eligible}` : "—",
        rate(probe),
        percent(probe.missedShare),
        fmt(probe.meanCallsOnHit),
      ]),
    ),
  );
  const sampleTable = table(
    [
      "Profile",
      "Feasible uniform draws",
      "Decoded signatures",
      "Distinct score levels",
      "Local score unchanged",
    ],
    profiles.map((item) => {
      const s = item.summary;
      return [
        label(item),
        sampleRatio(s.uniformValid, s.uniformSamples),
        s.uniformSamples ? s.decodedSignatures : "—",
        s.uniformSamples ? s.uniformScoreLevels : "—",
        sampleRatio(s.localNeutral, s.localValid),
      ];
    }),
  );
  const structureTable = table(
    [
      "Profile / seed",
      "Checkpoint",
      "Dimensions",
      "Rail stations / track cap",
      "Rail plan count",
      "Squad traversable tiles",
      "Reference combinations",
    ],
    profiles.flatMap((item) =>
      item.rows.map((row) => {
        const { metro, skirmish } = row.space.components;
        return [
          `${label(item)} / ${row.seed}`,
          row.actualCheckpoint,
          row.space.dimensions,
          metro
            ? `${metro.activeStations} / ${metro.trackBudget}${metro.remainingEditBudget === null ? "" : ` · ${metro.remainingEditBudget} edits left`}`
            : "—",
          countLabel(metro?.orderedPlans),
          skirmish
            ? `${skirmish.terrainCells - skirmish.blockedCells}/${skirmish.terrainCells}${skirmish.done ? " · finished" : ""}`
            : "—",
          countLabel(row.space.referenceCombinations),
        ];
      }),
    ),
  );
  const seedsTable = table(
    [
      "Profile / seed",
      "Initial score",
      "Sampled best",
      "Target",
      "Random best",
      "GA best",
    ],
    profiles.flatMap((item) =>
      item.rows.map((row) => [
        `${label(item)} / ${row.seed}`,
        fmt(row.search?.baseline),
        fmt(row.search?.referenceBest),
        fmt(row.search?.target),
        fmt(row.search?.probes[0].best),
        fmt(row.search?.probes[1].best),
      ]),
    ),
  );
  let coupling = "";
  if (request.compareUncoupled) {
    const note =
      interaction.status === "initial-only"
        ? "At this checkpoint the two profiles have followed their own trajectories. Use checkpoint 0 for a matched candidate grid."
        : interaction.status === "insufficient-variation"
          ? "The sample did not contain enough distinct, feasible pairs for a matched grid."
          : "The same small grid of rail and squad candidates is evaluated with both rule settings. The residual is the share of score variation beyond additive row and column effects.";
    coupling = `<h3>Coupling check</h3><p class="muted">${note}</p>`;
    if (interaction.samples.length)
      coupling += table(
        [
          "Seed",
          "Matched grid",
          "Selected interaction",
          "Coupling off",
          "Max score double difference",
        ],
        interaction.samples.map((item) => [
          item.seed,
          `${item.rows} × ${item.columns}`,
          percent(item.active.residualShare),
          percent(item.uncoupled.residualShare),
          fmt(item.active.maxDoubleDifference),
        ]),
      );
  }
  const finished = profiles.some(
    (item) => item.summary.searched < item.summary.inspected,
  );
  const noTarget = profiles.some(
    (item) => item.summary.eligible < item.summary.searched,
  );
  const { metro, skirmish } = profiles[0].rows[0].space.components;
  const encoding = [
    metro ? `${metro.lines} keys per active station` : null,
    skirmish ? "4 continuous squad parameters + 2 switches" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `
    <p class="assessment-scope"><strong>${escapeHTML(name)}</strong> · Seeds ${request.seeds.join(", ")} · Budget ${request.evaluations} · Checkpoint ${request.checkpoint}</p>
    <div class="assessment-kpis">
      <div><span>Encoded dimensions</span><strong>${selected.dimensions.join(" / ")}</strong></div>
      <div><span>Uniform candidates feasible</span><strong>${selected.uniformSamples ? percent(selected.uniformValid / selected.uniformSamples) : "—"}</strong></div>
      <div><span>${hasFrozen ? "GA misses · frozen 80% target" : "GA misses · short-sample target"}</span><strong>${percent(denom ? misses / denom : null)}</strong><span>${denom ? `${misses} of ${denom} eligible seeds` : "No target available"}</span></div>
    </div>
    ${renderFrozen(report.frozen, request)}
    <h3>Exploratory short-sample probe</h3>
    <p class="muted">Target = initial score + ${request.targetPercent}% of the improvement found in an independent reference sample of ${request.evaluations} uniform and ${request.evaluations} local draws. Each seed and profile gets its own target.</p>
    ${searchTable}
    ${noTarget ? '<p class="muted">Seeds without sampled improvement have no target. They are excluded from hit and miss rates.</p>' : ""}
    ${finished ? '<p class="muted">An episode ended before or at the checkpoint. Its structure is included and its search is skipped.</p>' : ""}
    <h3>Encoding and feasible space</h3>
    ${encoding ? `<p class="muted">${encoding}</p>` : ""}
    ${sampleTable}
    <p class="muted">Signature and score counts are added across seeds. Local moves perturb 1–3 vector coordinates around the initial candidate.</p>
    ${structureTable}
    <p class="muted">Rail counts include track and stop constraints before the remaining edit budget. The squad reference uses two switches and ${request.gridLevels} levels for each of four continuous parameters.</p>
    ${coupling}
    <details><summary>Per-seed scores and settings</summary>${seedsTable}<pre>${escapeHTML(JSON.stringify(request.config, null, 2))}</pre></details>`;
}

export function mountDifficulty(problems, getWorkspace, download) {
  const $ = (name) => document.querySelector("#difficulty-" + name);
  const problemSelect = $("problem");
  const scenarioSelect = $("scenario");
  const couplingSelect = $("profile");
  let preset,
    report,
    worker,
    initialized = false;
  const status = (text, error = false) => {
    $("status").textContent = text;
    $("status").classList.toggle("assessment-error", error);
  };
  const current = () => problems.find(({ id }) => id === problemSelect.value);
  const updateControl = () => {
    $("control").disabled =
      current().id !== "fusion" || couplingSelect.value === "none";
  };
  function changeScope(scenarioId, config) {
    const problem = current();
    preset = config ?? benchmarkSettings(problem.id);
    scenarioSelect.replaceChildren(
      ...problem.scenarios.map(({ id, name }) => new Option(name, id)),
    );
    scenarioSelect.value = scenarioId ?? problem.defaultScenario;
    $("coupling").hidden = problem.id !== "fusion";
    couplingSelect.value = config?.coupling ?? "both";
    $("checkpoint").max = problem.id === "skirmish" ? 900 : 240;
    $("checkpoint").value = 0;
    $("clock").textContent =
      problem.id === "skirmish"
        ? "0 starts at setup. 10 steps equal one second."
        : "0 starts at setup. One step equals one metro minute.";
    $("context").textContent = config
      ? "Using captured workspace settings."
      : "Using benchmark settings · 180 metro minutes / 60 squad seconds where applicable.";
    updateControl();
  }
  function useWorkspace(resetSeeds) {
    const { problemId, config } = getWorkspace();
    problemSelect.value = problemId;
    changeScope(config.scenarioId, config);
    if (resetSeeds) $("seeds").value = config.seed;
  }
  function stop() {
    worker?.terminate();
    worker = null;
    $("run").disabled = false;
    $("cancel").disabled = true;
  }
  function run() {
    try {
      const seeds = $("seeds")
        .value.split(",")
        .map((part) => part.trim());
      if (seeds.some((seed) => !/^\d+$/.test(seed)))
        throw new Error(
          "Enter up to five distinct non-negative seeds, separated by commas.",
        );
      const problemId = problemSelect.value;
      const scenarioId = scenarioSelect.value;
      const config = {
        ...preset,
        ...(problemId === "fusion" ? { coupling: couplingSelect.value } : {}),
      };
      const input = {
        problemId,
        scenarioId,
        config,
        seeds: seeds.map(Number),
        evaluations: Number($("budget").value),
        checkpoint: Number($("checkpoint").value),
        gridLevels: Number($("levels").value),
        targetPercent: Number($("target").value),
        compareUncoupled: $("control").checked,
      };
      const name = `${current().name} · ${scenarioSelect.selectedOptions[0].textContent}`;
      const job = new Worker(
        new URL("./difficulty-worker.js", import.meta.url),
        { type: "module" },
      );
      worker = job;
      $("run").disabled = true;
      $("cancel").disabled = false;
      $("progress").value = 0;
      status("Evaluating the reference sample and both search probes…");
      job.onmessage = ({ data }) => {
        if (worker !== job) return;
        if (data.type === "progress") {
          $("progress").value = data.progress.done / data.progress.total;
          status(
            `${data.progress.done}/${data.progress.total} seeds complete.`,
          );
        } else if (data.type === "done") {
          report = data.report;
          $("output").innerHTML = renderReport(report, name);
          $("json").disabled = false;
          $("csv").disabled = false;
          $("progress").value = 1;
          status("Assessment complete.");
          stop();
        } else {
          status(data.message, true);
          stop();
        }
      };
      job.onerror = () => {
        if (worker !== job) return;
        status("Could not start the difficulty worker.", true);
        stop();
      };
      job.postMessage(input);
    } catch (error) {
      status(error.message, true);
      stop();
    }
  }
  problemSelect.replaceChildren(
    ...problems
      .filter((problem) =>
        problem.scenarios.some((scene) =>
          scene.capabilities.protocols.includes("vector-optimization/v1"),
        ),
      )
      .map(({ id, name }) => new Option(name, id)),
  );
  couplingSelect.replaceChildren(
    ...["both", "supply", "disruption", "none"].map(
      (id) => new Option(labels[id], id),
    ),
  );
  problemSelect.addEventListener("change", () => changeScope());
  scenarioSelect.addEventListener("change", () =>
    changeScope(scenarioSelect.value),
  );
  couplingSelect.addEventListener("change", updateControl);
  $("use-workspace").addEventListener("click", () => useWorkspace(true));
  $("use-benchmark").addEventListener("click", () => {
    const mode = couplingSelect.value;
    const checkpoint = $("checkpoint").value;
    changeScope(scenarioSelect.value);
    couplingSelect.value = mode;
    $("checkpoint").value = checkpoint;
    $("seeds").value = "26, 27, 28";
    updateControl();
  });
  $("run").addEventListener("click", run);
  $("cancel").addEventListener("click", () => {
    stop();
    status("Assessment cancelled.");
  });
  $("json").addEventListener("click", () =>
    download(
      `hex-difficulty-${report.request.scenarioId}.json`,
      JSON.stringify(report, null, 2),
    ),
  );
  $("csv").addEventListener("click", () =>
    download(
      `hex-difficulty-${report.request.scenarioId}.csv`,
      difficultyCSV(report),
      "text/csv;charset=utf-8",
    ),
  );
  return {
    show() {
      if (initialized) return;
      initialized = true;
      const { problemId, config } = getWorkspace();
      problemSelect.value = problemId;
      changeScope(config.scenarioId);
    },
    captureWorkspace() {
      useWorkspace(true);
    },
  };
}
