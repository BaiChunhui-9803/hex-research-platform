import { DESIGN_GOALS } from "../../core/rule-composition.js";
import { fusion } from "../../problems/fusion/index.js";
import { node, table } from "./charts.js";
import { configForScope, factionName, fillOptions, format, mountScope, normalizeScope, scopeFromConfig, setupOverrides } from "./data.js";

const operations = [
  ["add", "Add"], ["remove", "Remove / consume"], ["change", "Change"],
  ["move", "Move"], ["fixed", "Fixed / constrained"],
];
const headings = {
  participation: "Factions with meaningful placement choices",
  delivery: "Delivered passenger share",
  orderStability: "Stability when rotating the starting seat",
  hpGain: "Remaining HP effect versus supply off",
  recovery: "Public HP restored",
};

function matrix(feature) {
  function cell(entries) {
    if (!entries.length) return "—";
    const container = node("div", undefined, "rule-cell");
    for (const entry of entries) {
      const details = node("details");
      details.dataset.featureId = entry.id;
      const summary = node("summary", entry.effect);
      details.append(summary, node("code", entry.id), node("p", `${entry.actor} · ${entry.phase}`, "muted"));
      if (entry.condition) details.append(node("p", entry.condition, "muted"));
      if (entry.binding) details.append(node("pre", JSON.stringify(entry.binding, null, 2)));
      container.append(details);
    }
    return container;
  }
  return table(["Element", ...operations.map(([, label]) => label)], feature.rows.map((row) => {
    const label = node("div", undefined, "rule-element");
    label.append(node("small", row.dimension), node("strong", row.element));
    return [label, ...operations.map(([op]) => cell(row.operations.filter((entry) => entry.op === op)))];
  }));
}

function inference(findings, showEvidence) {
  return findings.map((finding) => {
    const panel = node("article", undefined, "rule-finding");
    const title = node("div");
    title.append(node("h3", finding.title), node("span", finding.matched ? "Matched" : "Missing", "badge"));
    panel.append(title, node("p", finding.matched ? finding.conclusion : "The required bindings are incomplete.", "muted"));
    const links = node("div", undefined, "rule-evidence");
    for (const id of finding.evidence) {
      const button = node("button", id, "subtle");
      button.addEventListener("click", () => showEvidence(id));
      links.append(button);
    }
    panel.append(links);
    return panel;
  });
}

const percent = (value) => format(value, "ratio");

function candidateResults(report, replay, play) {
  const selected = report.candidates.find(({ id }) => id === report.selected);
  const intro = node("p",
    `Seeds ${report.seeds.join(", ")} · each faction-led candidate was tested with every faction as first seat. Engagement uses the same native policy for all factions.`,
    "muted");
  const priority = node("p", `Ranking priority · ${report.criteria.map((criterion) => headings[criterion]).join(" → ")}`, "muted");
  const selectedCard = node("div", undefined, "rule-selection");
  if (selected) {
    const { phases, stock } = selected.program;
    const supply = stock.allocation === "proportional-unmet-hp"
      ? "Allocate in proportion to missing HP." : "Split stock equally, then redistribute unused shares.";
    selectedCard.append(node("h3", selected.name),
      node("p", `${selected.description} Tracks lock at the end of construction. Arrivals credit ${stock.authority} station stock. ${supply}`));
    if (selected.turns) selectedCard.append(node("p", `${phases[0].rounds} construction rounds · snake order · equal per-faction track allowance`, "muted"));
    const actions = node("div", undefined, "button-row");
    const run = node("button", "Run selected design", "primary");
    run.id = "rule-replay-selected";
    run.addEventListener("click", () => replay(selected.id));
    const open = node("button", "Open in Play", "subtle");
    open.addEventListener("click", () => play(selected.id));
    const control = node("button", "Run same design with supply off", "subtle");
    control.addEventListener("click", () => replay(selected.id, "none"));
    actions.append(run, control, open);
    const program = node("details", undefined, "portal-details");
    program.append(node("summary", "Compiled program"), node("pre", JSON.stringify(selected.program, null, 2)));
    selectedCard.append(actions, program);
  } else selectedCard.append(node("p", "No candidate passed verification.", "portal-error"));

  const results = table(["Construction / allocation", "Runs", "Factions with choices", "Delivered share", "HP restored",
    "Contested draws", "HP effect vs supply off (pp)", "Mean HP swing by seat", "Replay"], report.candidates.map((candidate) => {
    const { summary } = candidate;
    const name = node("div", undefined, "rule-candidate-name");
    name.append(node("strong", candidate.name), node("small", candidate.supplyName), node("small", candidate.id === report.selected ? "Selected" : candidate.status));
    if (candidate.missing.length) name.append(node("small", candidate.missing.join(", ")));
    const button = node("button", "Run seed", "subtle");
    button.disabled = !candidate.accepted;
    button.addEventListener("click", () => replay(candidate.id));
    return [name, candidate.samples?.length ?? 0, percent(summary?.participation), percent(summary?.delivery),
      format(summary?.recovery), format(summary?.contested), summary ? format(summary.hpGain * 100) : "—",
      candidate.turns && summary ? percent(1 - summary.orderStability) : "—", button];
  }));
  const explanation = node("p", "A faction counts toward participation when it has two distinct legal links on a turn. Supply-off controls use the same rail plan, seed and starting seat. HP effect averages final HP fractions across factions.", "muted");
  const detail = node("details", undefined, "portal-details");
  detail.append(node("summary", "Inspect pilot runs and first-placement changes"));
  for (const candidate of report.candidates.filter(({ accepted }) => accepted)) {
    detail.append(node("h3", `${candidate.name} · ${candidate.supplyName}`), table(["Seed", "First seat", "Placed links per faction", "Passengers delivered",
      "Public supply generated", "HP restored", "HP effect vs supply off (pp)"], candidate.samples.map((sample) => [
      sample.seed, candidate.turns ? factionName(sample.first) : "Neutral planner",
      Object.entries(sample.contributions).map(([team, count]) => `${factionName(team)} ${count}`).join(" · "),
      sample.delivered, format(sample.produced), format(sample.recovery), format(sample.hpGain * 100),
    ])));
    if (candidate.sensitivity) {
      const { delivered, produced, recovered, original, alternate } = candidate.sensitivity;
      detail.append(node("p", `Seed ${report.seeds[0]} · first choice “${original}” → “${alternate}”. Change in delivered passengers ${format(delivered)}, generated supply ${format(produced)} HP, and restored HP ${format(recovered)}.`, "muted"));
    }
  }
  return [selectedCard, intro, priority, results, explanation, detail];
}

export function mountRuleFusion(root, navigation) {
  const $ = (selector) => root.querySelector(selector);
  const status = $("#rule-status"), seed = $("#rule-seed"), goal = $("#rule-goal");
  const compile = $("#rule-compile"), cancel = $("#rule-cancel");
  const featureView = $("#rule-feature-matrix"), diagnostics = $("#rule-findings"), output = $("#rule-candidates");
  let featureId = "metro", tables, worker;
  const picker = mountScope($("#rule-scope"), {}, refresh, { split: true, fixedProblem: "fusion", hideTemplate: true });

  function featureTab(id) {
    featureId = id;
    for (const button of root.querySelectorAll("[data-feature-view]"))
      button.setAttribute("aria-pressed", String(button.dataset.featureView === id));
    const active = tables?.find((entry) => entry.id === id);
    if (active) featureView.replaceChildren(matrix(active));
  }
  for (const button of root.querySelectorAll("[data-feature-view]"))
    button.addEventListener("click", () => featureTab(button.dataset.featureView));

  function showEvidence(id) {
    const source = tables.find((entry) => entry.rows.some((row) => row.operations.some((operation) => operation.id === id)));
    if (!source) return;
    featureTab(source.id);
    const cell = [...featureView.querySelectorAll("[data-feature-id]")].find((item) => item.dataset.featureId === id);
    if (!cell) return;
    cell.open = true;
    cell.querySelector("summary").focus();
    cell.scrollIntoView({ block: "center", inline: "nearest" });
  }

  function stop() {
    worker?.terminate();
    worker = null;
    compile.disabled = false;
    cancel.hidden = true;
  }

  function refresh() {
    if (!seed.reportValidity()) return;
    stop();
    status.classList.remove("portal-error");
    const scope = picker.get();
    navigation.replace("rule-fusion", { ...scope, seed: seed.value, goal: goal.value });
    const input = { ...configForScope(scope, Number(seed.value)), designGoal: goal.value };
    tables = fusion.sourceFeatureTables(input);
    featureTab(featureId);
    diagnostics.replaceChildren();
    output.replaceChildren();
    const task = new Worker(new URL("./rule-fusion-worker.js", import.meta.url), { type: "module" });
    worker = task;
    compile.disabled = true;
    cancel.hidden = false;
    status.textContent = "Compiling features and running pilot simulations…";
    const fail = (message) => {
      if (task !== worker) return;
      stop();
      status.textContent = message;
      status.classList.add("portal-error");
    };
    task.onerror = () => fail("The rule compiler worker could not start.");
    task.onmessage = ({ data }) => {
      if (task !== worker) return;
      if (data.error) return fail(data.error);
      stop();
      const { report } = data;
      status.textContent = `${report.candidates.filter(({ accepted }) => accepted).length} candidate programs passed.`;
      diagnostics.replaceChildren(...inference(report.findings, showEvidence));
      const params = (id, coupling = "both") => ({
        ...scopeFromConfig("fusion", { ...report.config, ruleCandidate: id, coupling }), seed: input.seed,
      });
      output.replaceChildren(...candidateResults(report,
        (id, coupling) => navigation.go("trajectory", { ...params(id, coupling), method: "constructive", run: "1" }),
        (id) => navigation.go("problems", params(id)),
      ));
    };
    task.postMessage(input);
  }

  compile.addEventListener("click", refresh);
  cancel.addEventListener("click", () => { stop(); status.textContent = "Candidate testing canceled."; });
  seed.addEventListener("change", refresh);
  goal.addEventListener("change", refresh);
  return {
    hide: stop,
    show(params) {
      const defaults = fusion.scenarios.find((item) => item.id === fusion.defaultScenario).components;
      const components = { ...defaults, ...(["metro", "skirmish"].includes(params.problem) ? { [params.problem]: params.scenario } : {}) };
      const requested = params.problem === "fusion" && params.scenario ? params.scenario : `${components.metro}--${components.skirmish}`;
      const previous = setupOverrides(params.setup);
      const setup = params.problem === "fusion" ? previous : Object.fromEntries(Object.entries(previous).map(([key, value]) =>
        [params.problem + key[0].toUpperCase() + key.slice(1), value]));
      const scope = normalizeScope({ problem: "fusion", scenario: requested, profile: "compiled", setup });
      picker.set(scope);
      featureId = params.problem === "skirmish" ? "skirmish" : "metro";
      seed.value = /^\d{1,7}$/.test(params.seed ?? "") ? params.seed : 28;
      fillOptions(goal, Object.entries(DESIGN_GOALS), params.goal ?? previous.designGoal ?? "agency");
      refresh();
    },
  };
}
