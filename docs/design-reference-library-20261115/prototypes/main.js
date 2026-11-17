import { problemRegistry, problemMetadata } from "../../../problems/index.js";
import { methodRegistry } from "../../../methods/index.js";
import { projectURL } from "../../../web/paths.js";
const $ = (selector) => document.querySelector(selector);
const metadata = problemRegistry.list().map(problemMetadata),
  methods = methodRegistry.list().filter((m) => ["constructive","random-search","hill-climb","annealing"].includes(m.id));
let problemId = "metro",
  view,
  display,
  worker,
  seq = 0,
  epoch = 0,
  pending = new Map(),
  running = false,
  busy = false,
  last = 0,
  shownResults = false;
const current = () => metadata.find((p) => p.id === problemId);
const notice = (text, error = false) => {
  $("#status").textContent = text;
  $("#status").classList.toggle("error", error);
};
const value = (number, metric) =>
  number === undefined
    ? "—"
    : metric.unit === "ratio"
      ? `${(number * 100).toFixed(1)}%`
      : Number(number).toLocaleString("en-US", { maximumFractionDigits: 1 });
const config = () => ({
  scenarioId: $("#scenario").value,
  seed: Number($("#seed").value),
});
function call(type, data = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...data });
  });
}
function pause() {
  running = false;
  $("#play").textContent = "Start";
}
function update(next) {
  view = next;
  display.update(next);
  $("#clock").textContent =
    `${next.time.toFixed(next.timeUnit === "s" ? 1 : 0)} ${next.timeUnit}`;
  $("#phase").textContent = next.done
    ? "FINISHED"
    : next.auto
      ? "METHOD ACTIVE"
      : "MANUAL";
  $("#controller").textContent = next.auto
    ? methodRegistry.get(next.methodId).name + " active"
    : "Manual control";
  $("#metrics").innerHTML = current()
    .metrics.slice(0, 4)
    .map(
      (m) =>
        `<div class="metric"><span>${m.name}</span><b>${value(next.metrics[m.id], m)}</b></div>`,
    )
    .join("");
  if (next.done) pause();
}
async function reset() {
  const generation = ++epoch;
  pause();
  busy = false;
  display?.dispose();
  worker?.terminate();
  for (const entry of pending.values())
    entry.reject(new Error("Episode reset"));
  pending.clear();
  try {
    const p = current(),
      module = await import(projectURL(p.view));
    if (generation !== epoch) return;
    display = module.mount({
      host: $("#arena"),
      controls: $("#problem-controls"),
      onPause: pause,
      notice,
      onAction: async (action) => {
        const next = await call("action", { action });
        if (generation === epoch) update(next);
        return next;
      },
    });
    worker = new Worker(projectURL("web/live-worker.js"), { type: "module" });
    worker.onmessage = (event) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      pending.delete(event.data.id);
      event.data.error
        ? entry.reject(new Error(event.data.error))
        : entry.resolve(event.data.payload);
    };
    worker.onerror = (error) => notice(error.message, true);
    const next = await call("init", {
      problemId,
      config: config(),
      evaluations: Number($("#budget").value),
    });
    if (generation !== epoch) return;
    update(next);
    notice(
      "Ready. Use the map controls, start the simulation, or run a shared method.",
    );
  } catch (error) {
    if (generation === epoch) notice(error.message, true);
  }
}
async function chooseProblem(id) {
  problemId = id;
  const p = current();
  $("#problem").value = id;
  $("#problem-name").textContent = p.name;
  $("#short-name").textContent = p.shortName;
  $("#scenario").innerHTML = p.scenarios
    .map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join("");
  $("#scenario").value = p.defaultScenario;
  await chooseScenario();
}
async function chooseScenario() {
  const s = current().scenarios.find((s) => s.id === $("#scenario").value);
  $("#scenario-name").textContent = s.name;
  $("#search-meaning").textContent = s.capabilities.searchMeaning;
  await reset();
  if (shownResults) renderResults();
}
function layout(name) {
  $("#layout").value = name;
  document.body.dataset.layout = name;
  document.body.dataset.screen = name === "cog" ? "home" : "workspace";
  $("#layout-caption").textContent = {
    cog: "Exhibition entrance · three font roles, restrained game motifs",
    paper: "Paper workspace · clear type, quiet borders, one main canvas",
    canvas: "Canvas focus · a compact method dock and a larger playfield",
  }[name];
}
async function advance(steps) {
  if (busy || !worker || view?.done) return;
  busy = true;
  const generation = epoch;
  try {
    const next = await call("step", { steps });
    if (generation === epoch) update(next);
  } catch (error) {
    if (generation === epoch) notice(error.message, true);
  } finally {
    if (generation === epoch) busy = false;
  }
}
function frame(now) {
  display?.render();
  const interval =
    (current().timeUnit === "s" ? 100 : 600) / Number($("#speed").value);
  if (running && !busy && now - last >= interval) {
    last = now;
    advance(1);
  }
  requestAnimationFrame(frame);
}
async function renderResults() {
  const response = await fetch(
    projectURL(`experiments/integration-20261115/${problemId}.json`),
  );
  if (!response.ok) throw new Error("Integration report unavailable");
  const report = await response.json();
  const primary = report.metricSchema[0];
  const rows = report.summary.filter(
    (r) => r.scenarioId === $("#scenario").value,
  );
  const table = document.createElement("table");
  table.innerHTML = `<thead><tr><th>Method</th><th>${primary.name}</th><th>Sample SD</th></tr></thead>`;
  const body = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const text of [
      methodRegistry.get(row.methodId).name,
      value(row.metrics[primary.id].mean, primary),
      row.metrics[primary.id].sd === null
        ? "—"
        : value(row.metrics[primary.id].sd, primary),
    ]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      tr.append(cell);
    }
    body.append(tr);
  }
  table.append(body);
  $("#result-table").replaceChildren(table);
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  try {
    if (button.dataset.open) {
      await chooseProblem(button.dataset.open);
      document.body.dataset.screen = "workspace";
      return;
    }
    if (["enter-workspace", "nav-workspace"].includes(button.id)) {
      document.body.dataset.screen = "workspace";
      return;
    }
    if (button.id === "nav-problems") {
      document.body.dataset.screen = "home";
      return;
    }
    if (button.id === "reset") await reset();
    if (button.id === "play" && view && !view.done) {
      running = !running;
      $("#play").textContent = running ? "Pause" : "Start";
    }
    if (button.id === "step") {
      pause();
      await advance(current().stepSize);
    }
    if (button.id === "run-method") {
      update(
        await call("method", {
          methodId: $("#method").value,
          evaluations: Number($("#budget").value),
        }),
      );
      running = true;
      $("#play").textContent = "Pause";
      notice(
        "Method running. The game and metrics use the platform’s existing adapters.",
      );
    }
    if (button.id === "manual") {
      update(await call("method", { methodId: null }));
      notice("Manual control enabled.");
    }
    if (button.id === "export") {
      const data = await call("export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `hex-${problemId}-replay.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if (button.id === "show-results") {
      shownResults = !shownResults;
      $("#results").hidden = !shownResults;
      if (shownResults) {
        document.body.dataset.screen = "workspace";
        await renderResults();
        $("#results").scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
      }
    }
  } catch (error) {
    notice(error.message, true);
  }
});
$("#layout").addEventListener("change", (event) => layout(event.target.value));
$("#problem").addEventListener("change", (event) =>
  chooseProblem(event.target.value),
);
$("#scenario").addEventListener("change", chooseScenario);
$("#method").addEventListener(
  "change",
  () =>
    ($("#method-description").textContent = methodRegistry.get(
      $("#method").value,
    ).description),
);
$("#problem").innerHTML = metadata
  .map((p) => `<option value="${p.id}">${p.name}</option>`)
  .join("");
$("#method").innerHTML = methods
  .map((m) => `<option value="${m.id}">${m.name}</option>`)
  .join("");
$("#method-description").textContent = methods[0].description;
layout(
  ["cog", "paper", "canvas"].includes(
    new URLSearchParams(location.search).get("layout"),
  )
    ? new URLSearchParams(location.search).get("layout")
    : "paper",
);
await chooseProblem("metro");
requestAnimationFrame(frame);
