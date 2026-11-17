import { methodRegistry } from "../methods/index.js";
import { problemRegistry, problemMetadata } from "../problems/index.js";
import { compatibility } from "../core/registry.js";
import { resultCSV } from "../core/experiment.js";
import { applyTheme } from "./theme.js";
import { mountMethodLibrary } from "./method-library.js";
import {
  createBrowserExperimentRunner,
  createExperimentRunner,
} from "./experiment-runner.js";
import { evidenceURL, projectURL } from "./paths.js";
import { renderSearchDetails } from "./search-details.js";
applyTheme();
const $ = (selector) => document.querySelector(selector);
const browserOnly = $('meta[name="hex-runtime"]')?.content === "browser";
const problems = problemRegistry.list().map(problemMetadata);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let problemId = "metro",
  view,
  display,
  worker,
  epoch = 0,
  sequence = 0,
  pending = new Map(),
  running = false,
  stepping = false,
  lastTick = 0,
  report = null;
let methodLibrary,
  experimentRunner,
  experimentBusy = false;
const problem = () => problems.find((p) => p.id === problemId);
const scenario = () =>
  problem().scenarios.find((s) => s.id === $("#scenario").value);
function notice(message, error = false) {
  $("#notice").textContent = message;
  $("#notice").classList.toggle("error", error);
}
async function api(url, data, method) {
  const response = await fetch(projectURL(url), {
    method: method ?? (data ? "POST" : "GET"),
    ...(data
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? response.statusText);
  return value;
}
function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function tab(name) {
  if (name !== "problems") pause();
  for (const node of document.querySelectorAll(".tab"))
    node.classList.toggle("active", node.id === `tab-${name}`);
  for (const b of document.querySelectorAll(".topbar [data-tab]"))
    b.classList.toggle("active", b.dataset.tab === name);
  if (name === "experiments") refreshHistory();
}
function openWorkspace() {
  document.body.dataset.screen = "workspace";
  tab("problems");
}
function config() {
  return {
    scenarioId: $("#scenario").value,
    seed: Number($("#seed").value),
    ...Object.fromEntries(
      [...$("#settings").querySelectorAll("[data-setting]")].map((n) => [
        n.dataset.setting,
        n.type === "number" ? Number(n.value) : n.value,
      ]),
    ),
  };
}
function request(type, data = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error(
          "The live worker did not respond. Reset the episode to stop it.",
        ),
      );
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, type, ...data });
  });
}
function pause() {
  running = false;
  $("#play").textContent = "Start";
}
function metricText(value, schema) {
  if (value === null || value === undefined || !Number.isFinite(Number(value)))
    return "—";
  return schema.unit === "ratio"
    ? `${(Number(value) * 100).toFixed(1)}%`
    : Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function update(next) {
  view = next;
  display?.update(next);
  renderSearchDetails($("#search-details"), next.searchDetail);
  $("#clock").textContent =
    `${next.time.toFixed(next.timeUnit === "s" ? 1 : 0)} ${next.timeUnit}`;
  $("#episode-status").textContent = next.replay
    ? "REPLAY"
    : next.done
      ? "FINISHED"
      : next.auto
        ? "METHOD ACTIVE"
        : "MANUAL";
  $("#control-status").textContent = next.replay
    ? "Recorded decisions · read-only"
    : next.auto
      ? `${methodRegistry.get(next.methodId).name} active`
      : "Manual control";
  $("#metrics").innerHTML = problem()
    .metrics.slice(0, 5)
    .map(
      (m) =>
        `<div class="metric"><span>${esc(m.name)}</span><strong>${metricText(next.metrics[m.id], m)}</strong></div>`,
    )
    .join("");
  if (next.done) {
    pause();
    notice("Episode finished. Export the replay or reset to play again.");
  }
}
async function reset(recording = null) {
  const generation = ++epoch;
  pause();
  stepping = false;
  display?.dispose();
  display = null;
  worker?.terminate();
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error("Session reset"));
  }
  pending.clear();
  $("#arena").innerHTML = "";
  $("#problem-controls").innerHTML = "";
  notice("Preparing episode…");
  try {
    const module = await import(projectURL(problem().view));
    if (generation !== epoch) return;
    display = module.mount({
      host: $("#arena"),
      controls: $("#problem-controls"),
      onPause: pause,
      notice,
      onAction: async (action) => {
        const next = await request("action", { action });
        if (generation === epoch) update(next);
        return next;
      },
    });
    worker = new Worker(new URL("./live-worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e) => {
      const entry = pending.get(e.data.id);
      if (!entry) return;
      pending.delete(e.data.id);
      clearTimeout(entry.timer);
      e.data.error
        ? entry.reject(new Error(e.data.error))
        : entry.resolve(e.data.payload);
    };
    worker.onerror = (e) => notice(e.message, true);
    const next = await request(
      recording ? "load-replay" : "init",
      recording
        ? { recording }
        : {
            problemId,
            config: config(),
            evaluations: Number($("#budget").value),
            populationSize: Number($("#population-size").value),
          },
    );
    if (generation !== epoch) return;
    update(next);
    notice(
      recording
        ? "Replay loaded. Start to watch the recorded decisions."
        : "Ready. Take manual control or activate a method.",
    );
  } catch (error) {
    if (generation === epoch) notice(error.message, true);
  }
}
function settings() {
  const current = scenario();
  $("#settings").innerHTML = current.settings
    .filter(
      (s) => !s.feature || current.capabilities.features.includes(s.feature),
    )
    .map(
      (s) =>
        `<label>${esc(s.name)}${s.choices ? `<select data-setting="${s.key}">${s.choices.map((c) => `<option value="${esc(c.value)}" ${c.value === s.default ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>` : `<input data-setting="${s.key}" type="number" min="${s.min}" max="${s.max}" value="${s.default}">`}</label>`,
    )
    .join("");
  $("#arena-title").textContent = current.name;
  $("#arena-description").textContent = current.description;
  $("#search-meaning").textContent = current.capabilities.searchMeaning;
  methods();
  experimentSetup();
  methodLibrary?.setScope(problemId, current.id);
}
async function selectProblem(id, configOverride) {
  problemId = id;
  const p = problem();
  for (const b of document.querySelectorAll("[data-problem]"))
    b.classList.toggle("active", b.dataset.problem === id);
  $("#scenario").innerHTML = p.scenarios
    .map(
      (s) =>
        `<option value="${s.id}">${esc(s.name)}${s.dynamic ? " · Dynamic" : ""}</option>`,
    )
    .join("");
  $("#scenario").value = configOverride?.scenarioId ?? p.defaultScenario;
  settings();
  if (configOverride) {
    $("#seed").value = configOverride.seed;
    for (const n of $("#settings").querySelectorAll("[data-setting]"))
      if (configOverride[n.dataset.setting] !== undefined)
        n.value = configOverride[n.dataset.setting];
  }
}
function methods() {
  const previous = $("#method").value,
    caps = scenario().capabilities;
  $("#method").innerHTML = methodRegistry
    .list()
    .map((m) => {
      const check = compatibility(m, caps);
      return `<option value="${m.id}" ${check.compatible ? "" : "disabled"} title="${esc(check.reasons.join("; "))}">${esc(m.name)}${check.compatible ? "" : " · unavailable"}</option>`;
    })
    .join("");
  if (previous && compatibility(methodRegistry.get(previous), caps).compatible)
    $("#method").value = previous;
  methodDescription();
}
function methodDescription() {
  const method = methodRegistry.get($("#method").value);
  $("#method-description").textContent = method.description;
  $("#method-tags").innerHTML = [
    method.objective,
    method.family,
    method.variant,
  ]
    .filter(Boolean)
    .map((tag) => `<span class="tag">${esc(tag)}</span>`)
    .join("");
  $("#implementation-note").textContent =
    method.implementationNotes ??
    "Native domain heuristic using the current observation.";
  $("#method-sources").innerHTML = (method.referenceKeys ?? [])
    .map(
      (key) =>
        `<a href="${esc(evidenceURL(key))}" target="_blank">${esc(key)}</a>`,
    )
    .join(" · ");
  $("#population-size").disabled = method.protocol !== "vector-optimization/v1";
}
function library() {
  methodLibrary = mountMethodLibrary(problems, async (id, scope) => {
    try {
      pause();
      if (problemId !== scope.problemId || scenario().id !== scope.scenarioId) {
        await selectProblem(scope.problemId, {
          scenarioId: scope.scenarioId,
          seed: Number($("#seed").value),
        });
        await reset();
      }
      openWorkspace();
      $("#method").value = id;
      methodDescription();
      update(
        await request("method", {
          methodId: id,
          evaluations: Number($("#budget").value),
          populationSize: Number($("#population-size").value),
        }),
      );
      notice("Method selected. Start or step the episode.");
    } catch (error) {
      notice(error.message, true);
    }
  });
  document
    .querySelectorAll(".method-total")
    .forEach((node) => (node.textContent = methodRegistry.list().length));
}

function experimentSetup() {
  const runtimeMessage = browserOnly
    ? "Comparisons run in this browser. Export your results to keep them."
    : "Comparisons run as local server jobs.";
  $("#experiment-context").textContent =
    `${problem().name} · uses the workspace episode settings. ${runtimeMessage}`;
  $("#experiment-scenarios").innerHTML = problem()
    .scenarios.map(
      (s) =>
        `<label class="check-label"><input type="checkbox" data-experiment-scenario="${s.id}" ${s.id === scenario().id ? "checked" : ""}>${esc(s.name)}</label>`,
    )
    .join("");
  experimentMethods();
  $("#api-example").textContent = JSON.stringify(
    {
      problemId,
      scenarioIds: [scenario().id],
      methodIds: ["random-search", "hill-climb", "annealing"],
      seeds: [26, 27, 28],
      evaluations: 16,
      config: config(),
    },
    null,
    2,
  );
}
const presets = {
  reference: ["constructive", "random-search", "hill-climb", "annealing"],
  classic: ["random-search", "ga", "de-rand", "pso-constriction", "cmaes"],
  adaptive: ["jde", "jade", "shade", "lshade"],
  pareto: ["nsga2", "spea2", "moead"],
};
function experimentMethods() {
  const chosen = [
    ...$("#experiment-scenarios").querySelectorAll("input:checked"),
  ].map((n) => n.dataset.experimentScenario);
  const selected = [
    ...$("#experiment-methods").querySelectorAll("input:checked"),
  ].map((n) => n.dataset.experimentMethod);
  const defaults = selected.length
    ? selected
    : (presets[$("#experiment-preset").value] ?? []);
  const groups = new Map();
  for (const method of methodRegistry.list()) {
    const eligible =
      chosen.length &&
      chosen.every(
        (id) =>
          compatibility(
            method,
            problem().scenarios.find((s) => s.id === id).capabilities,
          ).compatible,
      );
    const group = groups.get(method.category) ?? [];
    group.push({ method, eligible });
    groups.set(method.category, group);
  }
  $("#experiment-methods").innerHTML = [...groups]
    .map(
      ([name, entries]) =>
        `<details class="method-group" ${entries.some((e) => e.eligible && defaults.includes(e.method.id)) ? "open" : ""}><summary>${esc(name)} <small>${entries.filter((e) => e.eligible).length}</small></summary>${entries.map(({ method: m, eligible }) => `<label class="check-label"><input type="checkbox" data-experiment-method="${m.id}" ${eligible ? "" : "disabled"} ${eligible && defaults.includes(m.id) ? "checked" : ""}>${esc(m.name)}${eligible ? "" : " · unavailable"}</label>`).join("")}</details>`,
    )
    .join("");
  experimentSize();
}
function experimentPreset() {
  const name = $("#experiment-preset").value,
    ids = presets[name];
  for (const input of $("#experiment-methods").querySelectorAll("input"))
    input.checked =
      !input.disabled &&
      (name === "all-compatible" ||
        ids?.includes(input.dataset.experimentMethod));
  for (const group of $("#experiment-methods").querySelectorAll("details"))
    group.open = Boolean(group.querySelector("input:checked"));
  experimentSize();
}
function seedValues() {
  const raw = $("#seeds")
    .value.split(",")
    .map((s) => s.trim());
  if (raw.some((s) => !s))
    throw new Error("Enter comma-separated seeds without empty entries");
  const values = raw.map(Number);
  if (
    values.length > 10 ||
    new Set(values).size !== values.length ||
    values.some((v) => !Number.isSafeInteger(v) || v < 0 || v > 9999999)
  )
    throw new Error("Use 1 to 10 distinct integer seeds from 0 to 9999999");
  return values;
}
function experimentSize() {
  try {
    const count =
      $("#experiment-methods").querySelectorAll("input:checked").length *
      $("#experiment-scenarios").querySelectorAll("input:checked").length *
      seedValues().length;
    $("#experiment-size").textContent =
      `${count} episodes · at most 120 per batch`;
  } catch {
    $("#experiment-size").textContent = "Check the seed list.";
  }
}
async function runComparison() {
  if (experimentBusy) return;
  const input = {
    problemId,
    scenarioIds: [
      ...$("#experiment-scenarios").querySelectorAll("input:checked"),
    ].map((n) => n.dataset.experimentScenario),
    methodIds: [
      ...$("#experiment-methods").querySelectorAll("input:checked"),
    ].map((n) => n.dataset.experimentMethod),
    seeds: seedValues(),
    evaluations: Number($("#budget").value),
    populationSize: Number($("#population-size").value),
    config: config(),
  };
  if (!input.methodIds.length || !input.scenarioIds.length)
    throw new Error("Select at least one scenario and method");
  experimentBusy = true;
  $("#run-experiment").disabled = true;
  $("#cancel-experiment").disabled = false;
  $("#progress").value = 0;
  const onProgress = (state) => {
    $("#progress").value = state.progress;
    $("#run-state").textContent = state.status.toUpperCase();
    $("#run-message").textContent = state.message;
  };
  const onPartial = (partial) => {
    report = partial;
    resultTable();
  };
  experimentRunner = browserOnly
    ? createBrowserExperimentRunner(onProgress, onPartial)
    : createExperimentRunner(api, onProgress, onPartial);
  try {
    const outcome = await experimentRunner.run(input);
    if (outcome.report) {
      report = outcome.report;
      resultTable();
    }
    $("#run-state").textContent = outcome.cancelled ? "CANCELLED" : "DONE";
    notice(
      outcome.cancelled
        ? `Comparison cancelled after ${outcome.completed} completed episodes.`
        : `Comparison complete: ${outcome.completed} episodes.`,
    );
    refreshHistory();
  } finally {
    experimentBusy = false;
    $("#run-experiment").disabled = false;
    $("#cancel-experiment").disabled = true;
  }
}

async function step(steps) {
  if (stepping || !worker || view?.done) return;
  const generation = epoch;
  stepping = true;
  try {
    const next = await request("step", { steps });
    if (generation === epoch) update(next);
  } catch (error) {
    if (generation === epoch) {
      pause();
      notice(error.message, true);
    }
  } finally {
    if (generation === epoch) stepping = false;
  }
}
function frame(now) {
  if (
    document.body.dataset.screen === "workspace" &&
    $("#tab-problems").classList.contains("active")
  )
    display?.render();
  const interval =
    (problem()?.timeUnit === "s" ? 100 : 600) / Number($("#speed").value);
  if (running && !stepping && now - lastTick >= interval) {
    lastTick = now;
    step(1);
  }
  requestAnimationFrame(frame);
}
function resultTable() {
  if (!report) return;
  const p = problems.find((p) => p.id === report.request.problemId),
    schema = report.metricSchema;
  $("#summary").innerHTML =
    '<h3>Per-scenario summary</h3><p class="muted">Mean ± sample SD; “—” SD means a single trial. Values are comparable within the same problem and settings.</p><div class="table-scroll"><table><thead><tr><th>Scenario / method</th><th>n</th>' +
    schema.map((m) => `<th>${esc(m.name)}</th>`).join("") +
    "</tr></thead><tbody>" +
    report.summary
      .map(
        (row) =>
          `<tr><td>${esc(row.scenarioId)} / ${esc(methodRegistry.get(row.methodId).name)}</td><td>${row.n}</td>${schema
            .map((m) => {
              const stat = row.metrics[m.id];
              return `<td>${metricText(stat?.mean, m)}${stat?.sd === null ? "" : " ± " + metricText(stat?.sd, m)}</td>`;
            })
            .join("")}</tr>`,
      )
      .join("") +
    "</tbody></table></div>";
  $("#results").innerHTML =
    '<h3>Individual episodes</h3><div class="table-scroll"><table><thead><tr><th>Scenario</th><th>Method</th><th>Seed</th>' +
    schema.map((m) => `<th>${esc(m.name)}</th>`).join("") +
    "<th>Search evals</th><th>Compute ms</th><th></th></tr></thead><tbody>" +
    report.results
      .map(
        (row, index) =>
          `<tr><td>${esc(row.scenarioId)}</td><td>${esc(methodRegistry.get(row.methodId).name)}</td><td>${esc(row.seed)}</td>${schema.map((m) => `<td>${metricText(row.metrics[m.id], m)}</td>`).join("")}<td>${esc(row.evaluations)}</td><td>${esc(row.elapsedMs)}</td><td><button data-replay="${index}">Replay</button></td></tr>`,
      )
      .join("") +
    "</tbody></table></div>";
  $("#run-message").textContent =
    `${p.name} · ${report.results.length} completed episodes · ${report.request.evaluations} candidate budget · ${(report.elapsedMs / 1000).toFixed(2)}s total compute`;
  $("#export-json").disabled = false;
  $("#export-csv").disabled = false;
}
async function refreshHistory() {
  try {
    const runs = await api(
      browserOnly ? "experiments/published-runs.json" : "/api/runs",
    );
    $("#history").innerHTML = runs.length
      ? runs
          .slice(0, 8)
          .map(
            (r) =>
              `<div class="history-row"><span>${esc(problems.find((p) => p.id === r.problemId)?.name ?? r.id.slice(0, 12))}${r.episodes ? " · " + r.episodes + " episodes" : ""}${r.createdAt ? " · " + esc(new Date(r.createdAt).toLocaleString()) : ""}</span><button data-history="${esc(r.url)}">Load report</button></div>`,
          )
          .join("")
      : browserOnly
        ? '<p class="muted">Use Export JSON to save a comparison and Import report to load it again.</p>'
        : '<p class="muted">Completed experiments are saved locally.</p>';
  } catch (error) {
    notice(error.message, true);
  }
}
document.addEventListener("click", async (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.tab) {
      tab(b.dataset.tab);
      return;
    }
    if (b.dataset.problem) {
      await selectProblem(b.dataset.problem);
      await reset();
      openWorkspace();
      return;
    }
    if (b.dataset.replay !== undefined) {
      const recording = report.results[Number(b.dataset.replay)].replay;
      await selectProblem(recording.problemId, recording.config);
      openWorkspace();
      await reset(recording);
      return;
    }
    if (b.dataset.history) {
      report = await api(b.dataset.history);
      resultTable();
      $("#run-state").textContent = "SAVED REPORT";
      return;
    }
    if (b.id === "open-workspace") openWorkspace();
    if (b.id === "back-problems") {
      pause();
      document.body.dataset.screen = "home";
    }
    if (b.id === "reset") await reset();
    if (b.id === "play") {
      if (!view || view.done) return;
      running = !running;
      $("#play").textContent = running ? "Pause" : "Start";
    }
    if (b.id === "step") {
      pause();
      await step(problem().stepSize);
    }
    if (b.id === "autopilot" || b.id === "manual") {
      pause();
      update(
        await request("method", {
          methodId: b.id === "manual" ? null : $("#method").value,
          evaluations: Number($("#budget").value),
          populationSize: Number($("#population-size").value),
        }),
      );
      notice(
        b.id === "manual"
          ? "Manual control enabled."
          : "Method armed. Start or step the episode.",
      );
    }
    if (b.id === "export-replay")
      download(
        `hex-${problemId}-replay.json`,
        JSON.stringify(await request("export"), null, 2),
      );
    if (b.id === "run-experiment") await runComparison();
    if (b.id === "cancel-experiment" && experimentBusy)
      await experimentRunner.cancel();
    if (b.id === "export-json" && report)
      download(
        `hex-${report.request.problemId}-comparison.json`,
        JSON.stringify(report, null, 2),
      );
    if (b.id === "export-csv" && report)
      download(
        `hex-${report.request.problemId}-comparison.csv`,
        resultCSV(report),
        "text/csv;charset=utf-8",
      );
    if (b.id === "import-report") $("#report-file").click();
  } catch (error) {
    notice(error.message, true);
  }
});
$("#report-file").addEventListener("change", async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 20000000)
      throw new Error("Choose a JSON file smaller than 20 MB");
    const parsed = JSON.parse(await file.text());
    if (parsed.version !== "hex-research/v1")
      throw new Error("Unsupported report version");
    if (
      Array.isArray(parsed.results) &&
      parsed.request &&
      problems.some((p) => p.id === parsed.request.problemId)
    ) {
      report = parsed;
      resultTable();
      $("#run-state").textContent = "IMPORTED";
    } else if (
      Array.isArray(parsed.actions) &&
      problems.some((p) => p.id === parsed.problemId)
    ) {
      await selectProblem(parsed.problemId, parsed.config);
      tab("problems");
      await reset(parsed);
    } else throw new Error("Choose a platform comparison or replay file");
  } catch (error) {
    notice(error.message, true);
  } finally {
    event.target.value = "";
  }
});
$("#scenario").addEventListener("change", () => {
  settings();
  reset();
});
$("#method").addEventListener("change", methodDescription);
$("#experiment-scenarios").addEventListener("change", experimentMethods);
$("#experiment-methods").addEventListener("change", experimentSize);
$("#seeds").addEventListener("input", experimentSize);
$("#experiment-preset").addEventListener("change", experimentPreset);
window.addEventListener("keydown", (event) => {
  if (
    event.code === "Space" &&
    !event.defaultPrevented &&
    !event.repeat &&
    !["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(
      document.activeElement?.tagName,
    )
  ) {
    event.preventDefault();
    $("#play").click();
  }
});
try {
  $("#hosted-api-note").hidden = !browserOnly;
  $("#problem-cards").innerHTML = problems
    .map(
      (p) =>
        `<button data-problem="${p.id}" class="problem-choice"><small>${esc(p.shortName)}</small><strong>${esc(p.name)}</strong><small>${p.scenarios.length} SCENARIOS</small></button>`,
    )
    .join("");
  library();
  await selectProblem(
    new URLSearchParams(location.search).get("problem") === "skirmish"
      ? "skirmish"
      : "metro",
  );
  await reset();
  if (new URLSearchParams(location.search).has("problem")) openWorkspace();
  fetch(projectURL("docs/evolutionary-baselines-20261115/catalogue.json"))
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.stats?.journalArticles)
        $("#paper-total").textContent = data.stats.journalArticles;
    })
    .catch(() => {});
  requestAnimationFrame(frame);
} catch (error) {
  notice(error.message, true);
}
