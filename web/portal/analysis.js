import { bars, node, table } from "./charts.js";
import {
  configForScope, fillOptions, format, getCatalog, methodName, mountScope,
  pairedFusionEpisodes, profiles, scopeFields, setupOverrides,
} from "./data.js";
import { renderScenarioPreview } from "./scenario-preview.js";

const exact = (value) => value ? BigInt(value).toLocaleString("en-US") : "—";
const reference = (value, kind) => value && kind === "upper-bound" ? `≤ ${exact(value)}` : exact(value);
const share = (n, total) => total ? n / total : null;

function structure(rows) {
  const labels = rows.map(({ label }) => label);
  const series = (value, detail) => rows.map((row) => ({
    name: row.label, value: value(row.space), detail: detail?.(row.space),
  }));
  const rail = (space, key) => space.components.metro?.[key];
  const squad = (space, key) => space.components.skirmish?.[key];
  const structureTable = [
    ["Ordered rail plans", ...rows.map(({ space }) => reference(rail(space, "orderedPlans"), rail(space, "countKind")))],
    ["Track topology", ...rows.map(({ space }) => rail(space, "trackTopology") ?? "—")],
    ["Example controller combinations", ...rows.map(({ space }) => exact(squad(space, "discreteExample")))],
    ["Rail stations / lines", ...rows.map(({ space }) => rail(space, "lines") === undefined
      ? "—" : `${rail(space, "activeStations")} / ${rail(space, "lines")}`)],
    ["Track budget / edit budget", ...rows.map(({ space }) =>
      [rail(space, "trackBudget"), rail(space, "remainingEditBudget")].map(formatValue).join(" / "))],
    ["Stops per line / seats per train", ...rows.map(({ space }) =>
      [rail(space, "maxStopsPerLine"), rail(space, "trainCapacity")].map(formatValue).join(" / "))],
    ["Passenger demand multiplier", ...rows.map(({ space }) => formatValue(rail(space, "demandMultiplier")))],
    ["Rail tiles / blocked", ...rows.map(({ space }) =>
      [rail(space, "terrainCells"), rail(space, "blockedTrackCells")].map(formatValue).join(" / "))],
    ["Squad tiles / blocked", ...rows.map(({ space }) =>
      [squad(space, "terrainCells"), squad(space, "blockedCells")].map(formatValue).join(" / "))],
    ["Squad units / opposing units", ...rows.map(({ space }) =>
      [squad(space, "livingOwn"), squad(space, "livingOpponents")].map(formatValue).join(" / "))],
  ];
  const details = node("details", undefined, "portal-details");
  details.append(node("summary", "Counts, budgets and terrain"), table(["Measure", ...labels], structureTable));
  const includesSquad = rows.some(({ space }) => Boolean(space.components.skirmish));
  const explanation = [
    ...(rows.some(({ preview }) => preview.links?.ruleDesign)
      ? ["Compiled scenarios count legal moves, including pass, for the active construction turn."] : []),
    ...(rows.some(({ space }) => space.components.metro) ? [
      "Rail counts include ordered stops, the selected track topology and the total track budget. A ≤ symbol marks an upper bound.",
    ] : []),
    ...(includesSquad ? [`Squad counts use ${rows[0].space.gridLevels} levels per continuous parameter and two binary switches.`] : []),
  ];
  return [
    node("h3", "Decision vector dimensions"),
    bars(series((space) => space.dimensions)),
    node("h3", "Encoded reference combinations · log₁₀ scale"),
    bars(series((space) => Math.log10(Number(space.referenceCombinations)),
      (space) => reference(space.referenceCombinations, space.referenceKind))),
    node("p", explanation.join(" "), "muted"),
    details,
  ];
}

const formatValue = (value) => format(value);
const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

function pairedEvidence(catalog, scope) {
  if (scope.problem !== "fusion") return [];
  const pairs = pairedFusionEpisodes(catalog, scope);
  if (!pairs.length)
    return [node("p", "No archived pairs match this scenario setup. Run probes to measure its search behavior.", "muted")];
  const title = node("h3", "Linked vs uncoupled episodes");
  const seeds = [...new Set(pairs.map(({ linked }) => linked.seed))].join(", ");
  const settings = node("p", `${pairs.length} matched method–seed pairs · seeds ${seeds} · 180 metro minutes / 60 squad seconds · 12 evaluations per plan`, "muted");
  const measures = [
    ["completion", "Passenger delivery share", "ratio"],
    ["survival", "Squad HP remaining", "ratio"],
    ["win", "Squad win rate", "ratio"],
  ];
  const summaries = measures.map(([metric, label, type]) => {
    const width = bars(["control", "linked"].map((key) => ({
      name: key === "control" ? "Uncoupled" : "Linked",
      value: mean(pairs.map((pair) => pair[key].metrics[metric]).filter(Number.isFinite)),
    })), type);
    const panel = node("div", undefined, "paired-stat");
    panel.append(node("h4", label), width);
    return panel;
  });
  const panels = node("div", undefined, "paired-grid");
  panels.append(...summaries);
  const details = node("details", undefined, "portal-details");
  details.append(node("summary", "Inspect each paired episode"),
    table(["Method", "Seed", "Delivered share off → on", "Squad HP off → on", "HP restored", "Delay (train-min / min)"],
      pairs.map(({ control, linked }) => [
        methodName(linked.method), linked.seed,
        `${format(control.metrics.completion, "ratio")} → ${format(linked.metrics.completion, "ratio")}`,
        `${format(control.metrics.survival, "ratio")} → ${format(linked.metrics.survival, "ratio")}`,
        format(linked.metrics.supply), format(linked.metrics.delay ?? linked.metrics.holdMinutes),
      ])));
  return [title, settings, panels, details];
}

function scoreMatrices(samples) {
  const details = node("details", undefined, "portal-details");
  const label = node("label", "Map seed");
  const select = node("select");
  const panels = node("div", undefined, "portal-matrices");
  label.append(select);
  details.append(node("summary", "Candidate score matrices"), label,
    node("p", "Rows are rail plans. Columns are squad controllers. Both matrices use the same score scale for a given seed.", "muted"), panels);
  select.append(...samples.map(({ seed }) => new Option(seed, seed)));
  function update() {
    const { matrices, rows, columns } = samples.find(({ seed }) => seed === Number(select.value));
    const scores = [...matrices.active.flat(), ...matrices.uncoupled.flat()];
    const min = Math.min(...scores), max = Math.max(...scores);
    panels.replaceChildren(...[["Uncoupled", matrices.uncoupled], ["Linked", matrices.active]]
      .map(([title, values]) => {
        const box = node("div");
        const grid = table(["Rail / squad", ...Array.from({ length: columns }, (_, i) => i + 1)],
          Array.from({ length: rows }, (_, i) => [i + 1, ...values[i].map((score) => {
            const cell = node("span", format(score), "portal-score-cell");
            cell.style.backgroundColor = `rgba(39, 128, 105, ${0.09 + (score - min) / (max - min || 1) * 0.38})`;
            return cell;
          })]));
        box.append(node("h4", title), grid);
        return box;
      }));
  }
  select.addEventListener("change", update);
  update();
  return details;
}

function probes(reports) {
  const { request, interaction } = reports.at(-1).report;
  const groups = reports.flatMap(({ label, report }) => report.profiles.map((group, index) => ({
    ...group, frozen: report.frozen.profiles[index],
    name: ({ both: "Fusion · linked", none: "Fusion · uncoupled", supply: "Fusion · supply only",
      disruption: "Fusion · delay only" })[group.label] ?? label,
  })));
  const title = node("h3", "Search probes");
  const checkpoint = request.checkpoint === 0 ? "initial decision" : `checkpoint ${request.checkpoint}`;
  const note = node("p", `Seeds ${request.seeds.join(", ")} · ${request.evaluations} evaluations per probe · ${checkpoint} · sampled target at ${request.targetPercent}% of improvement over the starting candidate`, "muted");
  const feasibility = bars(groups.map(({ name, summary }) => ({
    name, value: share(summary.uniformValid, summary.uniformSamples),
    detail: `${format(share(summary.uniformValid, summary.uniformSamples), "ratio")} (${summary.uniformValid}/${summary.uniformSamples})`,
  })), "ratio");
  const hits = table(["Profile / probe", "Target hits", "Mean calls on hits"], groups.flatMap(({ name, summary }) =>
    summary.probes.map((probe) => [
      `${name} / ${probe.id === "ga" ? "Genetic algorithm" : "Uniform"}`,
      `${probe.reached} / ${probe.eligible} eligible`, format(probe.meanCallsOnHit),
    ]),
  ));
  const frozenLevel = [50, 80, 95].includes(request.targetPercent) ? request.targetPercent : 80;
  const available = groups.flatMap((group) => (group.frozen?.curves ?? []).filter(({ percent, eligible }) => percent === frozenLevel && eligible)
    .map((curve) => [group.name, curve.method, `${curve.points.at(-1).reached} / ${curve.eligible}`]));
  const calibration = available.length
    ? table([`Frozen target (${frozenLevel}%)`, "Probe", "Hits / calibrated seeds"], available)
    : node("p", "No frozen targets match these settings and seeds. The sampled search results are exploratory.", "muted");
  const coupling = interaction.samples.length
    ? table(["Seed", "Candidate grid", "Interaction share (off → on)", "Largest score interaction (off → on)"],
      interaction.samples.map(({ seed, rows, columns, active, uncoupled }) => [
        seed, `${rows} × ${columns}`,
        `${format(uncoupled.residualShare, "ratio")} → ${format(active.residualShare, "ratio")}`,
        `${format(uncoupled.maxDoubleDifference)} → ${format(active.maxDoubleDifference)}`,
      ]))
    : null;
  return [title, note, node("h3", "Feasible decoded samples"), feasibility, hits,
    node("p", "Each sampled target is relative to its own problem and seed. Frozen target results apply to the listed profiles with matching archive settings.", "muted"),
    calibration,
    ...(coupling ? [
      node("h3", "Measured interaction between metro plans and squad controllers"),
      node("p", "The same rail plans and squad controllers are crossed on the same map with links off and on. The interaction share measures score variation beyond the separate effects of rail plans and squad controllers.", "muted"),
      coupling,
      scoreMatrices(interaction.samples),
    ] : []),
  ];
}

export function mountAnalysis(root, navigation) {
  const $ = (selector) => root.querySelector(selector);
  const controls = $("#analysis-scope");
  const space = $("#analysis-space");
  const empirical = $("#analysis-empirical");
  const output = $("#analysis-probes");
  const status = $("#analysis-status");
  const run = $("#analysis-run");
  const cancel = $("#analysis-cancel");
  const seed = $("#analysis-seed");
  const preview = $("#analysis-preview");
  const design = $("#analysis-problem-settings");
  const fit = $("#analysis-fit");
  const measure = {
    checkpoint: $("#analysis-checkpoint"),
    gridLevels: $("#analysis-grid-levels"),
    evaluations: $("#analysis-evaluations"),
    targetPercent: $("#analysis-target"),
  };
  const defaults = { checkpoint: 0, gridLevels: 5, evaluations: 12, targetPercent: 80 };
  let worker, activeScope, activeRequest;
  const picker = mountScope(controls, {}, (scope) => {
    show({ ...scope, ...activeRequest, seed: seed.value });
  }, { split: true });

  function bounds() {
    const config = configForScope(activeScope, Number(seed.value));
    const squad = activeScope.problem === "skirmish";
    const unit = squad ? "0.1 s ticks" : activeScope.problem === "fusion" ? "cycles" : "min";
    measure.checkpoint.max = squad ? config.horizon * 10 : config.metroHorizon ?? config.horizon;
    $("#analysis-checkpoint-label").textContent = `Planning checkpoint (${unit})`;
    $("#analysis-grid-field").hidden = activeScope.problem === "metro";
  }

  function readMeasurements(params) {
    return Object.fromEntries(Object.entries(measure).map(([key, input]) => {
      const number = Number(params[key] ?? defaults[key]);
      const value = Number.isInteger(number)
        ? Math.max(Number(input.min), Math.min(Number(input.max), number)) : defaults[key];
      input.value = value;
      return [key, value];
    }));
  }

  function renderSettings() {
    const fields = scopeFields(activeScope)
      .filter((field) => !(field.key === "coupling" && activeScope.profile === "pilot"));
    const groups = new Map();
    const setup = setupOverrides(activeScope.setup);
    for (const field of fields) {
      const group = field.group ?? activeScope.problem;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(field);
    }
    design.replaceChildren(...[...groups].map(([group, entries]) => {
      const fieldset = node("fieldset", undefined, "analysis-settings-group");
      const grid = node("div", undefined, "analysis-settings-fields");
      fieldset.append(node("legend", { fusion: "Fusion rules", metro: "Metro", skirmish: "Squad" }[group]), grid);
      for (const field of entries) {
        const label = node("label", field.name.replace(/^(Metro|Squad) · /, ""));
        const input = node(field.choices ? "select" : "input");
        input.dataset.setting = field.key;
        const value = setup[field.key] ?? field.default;
        if (field.choices)
          fillOptions(input, field.choices.map((choice) => [String(choice.value), choice.label]), String(value));
        else {
          input.type = "number";
          input.min = field.min;
          input.max = field.max;
          input.value = value;
          input.required = true;
        }
        label.append(input);
        grid.append(label);
      }
      return fieldset;
    }));
  }
  function stop() {
    worker?.terminate();
    worker = null;
    run.disabled = false;
    cancel.disabled = true;
  }
  function calculate(type) {
    if (!seed.reportValidity()) return;
    worker?.terminate();
    const task = new Worker(new URL("./analysis-worker.js", import.meta.url), { type: "module" });
    worker = task;
    run.disabled = true;
    cancel.disabled = type !== "probes";
    status.textContent = type === "probes" ? "Running matched search probes…" : "Measuring the encoded space…";
    const fail = (message) => {
      if (worker !== task) return;
      stop();
      status.textContent = message;
      if (type === "structure") preview.replaceChildren(node("p", message, "muted portal-error"));
    };
    task.onmessage = ({ data }) => {
      if (worker !== task) return;
      if (data.type === "error") return fail(data.message);
      if (data.type === "progress") {
        status.textContent = `Completed ${data.progress.done} / ${data.progress.total} scenario–seed assessments.`;
        return;
      }
      stop();
      status.textContent = "";
      if (data.type === "structure") {
        space.replaceChildren(...structure(data.rows));
        renderScenarioPreview(preview, data.rows);
      }
      else output.replaceChildren(...probes(data.reports));
    };
    task.onerror = () => fail("The analysis worker could not start.");
    task.postMessage({ scope: activeScope, type, seed: Number(seed.value), request: activeRequest });
  }
  function show(input, { rebuild = true } = {}) {
    stop();
    picker.set(input);
    activeScope = picker.get();
    seed.value = /^\d{1,7}$/.test(input.seed ?? "") ? input.seed : 28;
    bounds();
    activeRequest = readMeasurements(input);
    if (rebuild) renderSettings();
    const params = Object.fromEntries(Object.entries(activeRequest).filter(([key, value]) => value !== defaults[key]));
    navigation.replace("analysis", { ...activeScope, seed: seed.value, ...params });
    fit.hidden = activeScope.problem !== "fusion" || ["adaptive", "compiled"].includes(activeScope.profile);
    $("#analysis-context").textContent = activeScope.profile
      ? `${profiles[activeScope.profile].name}${activeScope.setup ? " · custom settings" : ""}`
      : activeScope.setup ? "Custom scenario settings" : "Benchmark settings";
    space.replaceChildren();
    empirical.replaceChildren();
    output.replaceChildren();
    preview.replaceChildren(node("p", "Building the selected scenario…", "muted"));
    const snapshot = activeScope;
    getCatalog().then((catalog) => {
      if (activeScope === snapshot && !root.hidden)
        empirical.replaceChildren(...pairedEvidence(catalog, activeScope));
    }).catch(() => {
      if (activeScope === snapshot && activeScope.problem === "fusion" && !root.hidden)
        empirical.replaceChildren(node("p", "Paired episode archive unavailable.", "muted"));
    });
    calculate("structure");
  }
  seed.addEventListener("change", () => {
    if (seed.reportValidity()) show({ ...activeScope, ...activeRequest, seed: seed.value }, { rebuild: false });
  });
  design.addEventListener("change", ({ target }) => {
    if (!target.matches("[data-setting]") || !target.reportValidity()) return;
    const setup = { ...setupOverrides(activeScope.setup), [target.dataset.setting]: target.value };
    show({ ...activeScope, ...activeRequest, seed: seed.value, setup }, { rebuild: false });
  });
  for (const [key, input] of Object.entries(measure)) input.addEventListener("change", () => {
    if (input.reportValidity())
      show({ ...activeScope, ...activeRequest, seed: seed.value, [key]: input.value }, { rebuild: false });
  });
  $("#analysis-reset-settings").addEventListener("click", () => {
    show({ ...activeScope, ...activeRequest, seed: seed.value, setup: "" });
  });
  fit.addEventListener("click", () => {
    show({ ...activeScope, ...activeRequest, seed: seed.value, profile: "adaptive" });
  });
  run.addEventListener("click", () => {
    output.replaceChildren();
    calculate("probes");
  });
  cancel.addEventListener("click", () => {
    stop();
    status.textContent = "Search probes canceled.";
  });
  $("#analysis-next").addEventListener("click", () => navigation.go("comparison", activeScope));
  return { show, hide: stop };
}
