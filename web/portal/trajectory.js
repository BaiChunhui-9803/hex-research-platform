import { problemRegistry } from "../../problems/index.js";
import { projectURL } from "../paths.js";
import { drawSeries, node } from "./charts.js";
import {
  availableMethods, cohortName, configForScope, factionName, fillOptions, format, getCatalog, loadRecording, methodName,
  mountScope, pairedFusionCohorts, profileFromConfig, scopedCohorts, scopeFromConfig,
} from "./data.js";
import { legacyReplay } from "./legacy-replay.js";

const metroMetrics = [["delivered", "Passengers delivered"], ["waiting", "Waiting"], ["riding", "Onboard"], ["track", "Track used"]];
const squadMetrics = [["survival", "Squad HP remaining", "ratio"], ["hpMargin", "Squad HP margin"]];

function metricsFor(problem, shared) {
  if (problem === "metro") return metroMetrics;
  if (problem === "skirmish") return squadMetrics;
  return [...metroMetrics, ...squadMetrics, ["supply", "Squad HP restored"], ["produced", "Supply produced"],
    ["delay", shared ? "Delayed train-minutes" : "Dispatch hold minutes"]];
}

const validSeed = (value) => /^\d{1,7}$/.test(value ?? "");

export function mountTrajectory(root, navigation, download) {
  const $ = (selector) => root.querySelector(selector);
  const cohortSelect = $("#trajectory-cohort"), methodSelect = $("#trajectory-method");
  const seed = $("#trajectory-seed"), archiveSeeds = $("#trajectory-archive-seeds");
  const budget = $("#trajectory-budget"), setup = $("#trajectory-setup");
  const open = $("#trajectory-open"), run = $("#trajectory-run"), cancel = $("#trajectory-cancel");
  const paired = $("#trajectory-matched");
  const replay = $("#trajectory-replay"), status = $("#trajectory-status"), sourceLabel = $("#trajectory-source");
  const play = $("#trajectory-play"), scrub = $("#trajectory-scrub"), stepBack = $("#trajectory-previous");
  const stepForward = $("#trajectory-next"), chartMetric = $("#trajectory-metric"), canvas = $("#trajectory-chart");
  const arena = $("#trajectory-arena"), metrics = $("#trajectory-metrics"), feed = $("#trajectory-events");
  const mapMode = $("#trajectory-map-mode");
  const generated = new Map(), imported = new Map();
  let importedIndex = 0;
  let catalog, state, cohort, rows = [], matching, cached, readable, worker, player, analysis, display;
  let eventRows, schema, view, counterpart, framePending, wanted = 0, generation = 0;
  let playing = false, frameHandle = 0, lastAdvance = 0;

  const picker = mountScope($("#trajectory-scope"), {}, (scope) => {
    state = { ...scope, method: methodSelect.value, seed: seed.value };
    refresh(true);
  });

  function route() {
    navigation.replace("trajectory", state);
  }

  function statusText(message, error = false) {
    status.textContent = message;
    status.classList.toggle("portal-error", error);
  }

  function pause() {
    playing = false;
    play.textContent = "Play";
  }

  function clear() {
    ++generation;
    pause();
    cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    worker?.terminate();
    worker = null;
    display?.dispose();
    display = null;
    player = analysis = readable = view = null;
    counterpart = null;
    wanted = 0;
    framePending = false;
    replay.hidden = true;
    paired.hidden = true;
    mapMode.hidden = true;
    delete arena.dataset.mapMode;
    open.disabled = run.disabled = false;
    cancel.hidden = true;
  }

  function key() {
    return JSON.stringify([state.problem, state.scenario, state.profile, state.setup, state.cohort, state.method, Number(state.seed), state.budget]);
  }

  function selectSeed() {
    const values = rows.filter(({ method }) => method === methodSelect.value);
    fillOptions(archiveSeeds, [["", values.length ? "Choose from this archive" : "No archive seeds"], ...values
      .sort((a, b) => a.seed - b.seed)
      .map((row) => [String(row.seed), `${row.seed} · ${row.recording ? "recorded" : "result only"}`])], seed.value);
    archiveSeeds.disabled = !values.length;
    matching = values.find((row) => validSeed(seed.value) && row.seed === Number(seed.value));
    cached = imported.get(state.record) ?? generated.get(key());
    open.hidden = !matching?.recording && !cached;
    run.hidden = Boolean(matching?.recording || imported.has(state.record));
    if (cached) statusText(cached.type === "legacy" && state.record ? "Imported squad trace available." : "A trajectory is available for this selection.");
    else if (matching?.recording) statusText("A recording matches this scenario, method and seed.");
    else statusText(matching ? "This seed has an archived result. Run it here to generate a trajectory."
      : "No recording matches this selection. Run the seed in your browser.");
  }

  function refresh(autoLoad = false) {
    clear();
    const scope = picker.get();
    const eligible = scopedCohorts(catalog, scope);
    const sourceOptions = eligible.map((row) => [row.id, cohortName(catalog, row)]);
    const defaultCohort = eligible.find(({ source }) => ["shared", "simple-fusion"].includes(source)) ?? eligible[0];
    fillOptions(cohortSelect, [...sourceOptions, ["browser", scope.setup ? "Custom setup · browser run" : "Browser run"]],
      state.cohort ?? (state.record ? "browser" : defaultCohort?.id ?? "browser"));
    cohort = eligible.find(({ id }) => id === cohortSelect.value);
    rows = catalog.rows.filter((row) => row.cohort === cohort?.id);
    const legacy = cohort?.source === "legacy";
    const archivedMethods = [...new Set(rows.map(({ method }) => method))];
    const methods = availableMethods(scope).map(({ id }) => id);
    const allowed = legacy ? archivedMethods : [...new Set([...archivedMethods, ...methods])];
    const methodOptions = allowed.map((id) => [id, methodName(id)]);
    const opened = imported.get(state.record);
    if (opened && state.method === "manual") methodOptions.unshift(["manual", "Manual control (recorded)"]);
    fillOptions(methodSelect, methodOptions, state.method);
    const first = rows.find((row) => row.method === methodSelect.value && row.recording) ??
      rows.find((row) => row.method === methodSelect.value);
    seed.value = validSeed(state.seed) ? state.seed : first?.seed ?? 28;
    budget.value = cohort?.budget ?? (/^(?:[1-9]|[1-5]\d|6[0-4])$/.test(state.budget ?? "") ? state.budget : 12);
    budget.parentElement.hidden = Boolean(cohort);
    budget.disabled = Boolean(cohort);
    state = { ...scope, cohort: cohortSelect.value, method: methodSelect.value, seed: seed.value,
      ...(!cohort ? { budget: budget.value } : {}),
      ...(opened ? { record: state.record } : {}),
      ...(/^\d{1,4}$/.test(state.at ?? "") ? { at: state.at } : {}),
    };
    const selected = opened?.recording.config ?? cohort?.config ?? configForScope(scope, Number(seed.value));
    const evaluations = opened?.recording.options.evaluations ?? budget.value;
    setup.textContent = legacy
      ? `${factionName(selected.team)} · native squad decisions · ${selected.horizon} s maximum`
      : scope.problem === "fusion"
        ? `${selected.metroHorizon} min metro · ${selected.skirmishHorizon} s squad · ${evaluations} evaluations per plan`
        : `${selected.horizon} ${scope.problem === "metro" ? "min" : "s"} · ${evaluations} evaluations per plan`;
    route();
    selectSeed();
    if (autoLoad && (matching?.recording || cached)) start(false);
  }

  async function start(online) {
    if (!seed.reportValidity() || !budget.reportValidity()) return;
    clear();
    const token = generation;
    open.disabled = run.disabled = true;
    cancel.hidden = false;
    const selectedKey = key();
    try {
      if (online) {
        const config = cohort ? { ...cohort.config, seed: Number(seed.value) } : configForScope(picker.get(), Number(seed.value));
        statusText("Running one seed in the browser…");
        const input = {
          problem: state.problem, method: state.method, config, legacy: cohort?.source === "legacy",
          options: { evaluations: Number(budget.value), populationSize: cohort?.population ?? 0 },
        };
        const task = makeWorker(token);
        task.postMessage({ type: "generate", input });
      } else {
        statusText("Loading the recorded trajectory…");
        const source = cached ?? await loadRecording(matching.recording);
        if (token !== generation) return;
        await prepare(source, token, cached?.label ?? (source.type === "legacy" ? "Archived squad frames" : "Archived platform decisions"));
      }
    } catch (error) {
      if (token === generation) failure(error.message);
    }

    function makeWorker(version) {
      const task = new Worker(new URL("./trajectory-worker.js", import.meta.url), { type: "module" });
      worker = task;
      task.onerror = () => { if (version === generation) failure("The trajectory worker could not start."); };
      task.onmessage = async ({ data }) => {
        if (version !== generation) return;
        try {
          if (data.type === "error") failure(data.message);
          else if (data.type === "progress") statusText(`Running seed ${state.seed} · ${format(data.time)} / ${data.expected} ${data.unit}`);
          else if (data.type === "generated") {
            const source = { ...data.source, team: cohort?.config.team, label: "Generated in this browser" };
            if (generated.size >= 12) generated.delete(generated.keys().next().value);
            generated.set(selectedKey, source);
            cached = source;
            open.hidden = false;
            await prepare(source, version, source.label);
          } else if (data.type === "ready") await ready(data.analysis, data.analysis.view, version);
          else if (data.type === "frame") {
            framePending = false;
            paint(data.view);
            if (data.view.tick !== wanted) requestFrame();
          }
        } catch (error) {
          if (version === generation) failure(error.message);
        }
      };
      return task;
    }

    async function prepare(source, version, label) {
      readable = source;
      sourceLabel.textContent = label;
      if (source.type === "legacy") {
        worker?.terminate();
        worker = null;
        player = legacyReplay(source.trace, source.team);
        await ready(player, player.view(0), version);
      } else {
        statusText("Reconstructing the timeline from recorded actions…");
        const task = worker ?? makeWorker(version);
        task.postMessage({ type: "prepare", recording: source.recording });
      }
    }
  }

  function failure(message) {
    clear();
    run.hidden = Boolean(imported.has(state.record));
    statusText(message, true);
  }

  async function ready(result, first, token) {
    const problem = problemRegistry.get(first.problemId);
    const module = await import(projectURL(problem.view));
    if (token !== generation) return;
    analysis = result;
    schema = metricsFor(first.problemId, first.config.layout === "shared");
    if (first.config.ruleMode === "features") schema = schema.filter(([key]) => key !== "delay");
    eventRows = result.events;
    fillOptions(chartMetric, schema.map(([key, label]) => [key, label]));
    scrub.max = result.max;
    scrub.value = 0;
    $("#trajectory-duration").textContent = `/ ${format(result.max * result.step)} ${result.unit}`;
    $("#trajectory-title").textContent =
      `${problem.scenarios.find(({ id }) => id === state.scenario)?.name ?? problem.name} · ${methodName(state.method)} · seed ${state.seed}`;
    if (readable.type === "legacy") {
      const m = readable.trace.metrics[readable.team];
      $("#trajectory-outcome").textContent = `${factionName(readable.team)} perspective · ${m.won ? "Win" : m.draw ? "Draw" : "Loss"} · ${m.survivors} survivors · ${m.orders} effective orders`;
    } else {
      const conditions = readable.recording.config;
      $("#trajectory-outcome").textContent = conditions.ruleMode === "features"
        ? `Feature-compiled public network · ${readable.recording.options.evaluations} evaluations per construction turn · ${methodName(`squad.${conditions.skirmishOpponent}`)} engagement policy`
        : first.problemId === "fusion"
          ? `${conditions.layout === "shared" ? "Shared grid" : "Dual maps"} · ${conditions.coupling} coupling · ${readable.recording.options.evaluations} evaluations per plan`
          : `${readable.recording.options.evaluations} evaluations per plan`;
    }
    replay.hidden = false;
    if (first.config.layout === "shared") {
      mapMode.hidden = false;
      setMapMode("shared");
    }
    display = module.mount({
      host: arena, controls: $("#trajectory-controls"), help: $("#trajectory-help"), readOnly: true,
      onPause: pause, onAction() { throw new Error("The trajectory is read-only."); }, notice: statusText,
    });
    $("#trajectory-export").hidden = readable.type === "legacy";
    const pair = cohort && pairedFusionCohorts(catalog, picker.get());
    counterpart = pair && (pair.linked.id === cohort.id ? pair.control
      : pair.control.id === cohort.id ? pair.linked : null);
    paired.hidden = !counterpart || !catalog.rows.some((row) =>
      row.cohort === counterpart.id && row.method === state.method && row.seed === Number(state.seed) && row.recording);
    if (!paired.hidden) paired.textContent = counterpart.config.coupling === "none"
      ? "Replay same seed with links off" : "Replay same seed with links on";
    paint(first);
    if (Number(state.at)) seek(Number(state.at));
    open.disabled = run.disabled = false;
    cancel.hidden = true;
    statusText(
      readable.type === "legacy" ? "Playback uses the stored frame positions."
        : result.matches ? "Recorded actions reconstruct the stored final metrics."
        : "Reconstructed metrics differ from the recording. The current engine may use a different version of the rules.",
      result.matches === false,
    );
    frameHandle = requestAnimationFrame(frame);
  }

  function paint(next) {
    view = next;
    display.update(next);
    if (next.tick === wanted) scrub.value = next.tick;
    $("#trajectory-clock").textContent = `${format(next.tick * analysis.step)} ${analysis.unit}`;
    stepBack.disabled = next.tick === 0;
    stepForward.disabled = next.tick >= analysis.max;
    play.disabled = analysis.max === 0;
    if (next.tick >= analysis.max) pause();
    const row = analysis.timeline[next.tick];
    metrics.replaceChildren(...schema.map(([key, label, unit]) => {
      const box = node("div", undefined, "metric");
      box.append(node("span", label), node("strong", format(row[key], unit)));
      return box;
    }));
    draw();
    const recent = eventRows.filter(({ tick }) => tick <= next.tick).slice(-7).reverse();
    feed.replaceChildren(...(recent.length ? recent.map((event) => {
      const button = node("button", `${format(event.tick * analysis.step)} ${analysis.unit} · ${event.label}`);
      button.addEventListener("click", () => { pause(); seek(event.tick); });
      return button;
    }) : [node("p", "No events yet.", "muted")]));
  }

  function draw() {
    if (!view || !analysis || replay.hidden) return;
    const selected = chartMetric.value;
    canvas.setAttribute("aria-label", `${chartMetric.selectedOptions[0].text} over time`);
    drawSeries(canvas, analysis.timeline, selected, view.tick, analysis.unit, analysis.step);
  }

  function setMapMode(value) {
    arena.dataset.mapMode = value;
    for (const button of mapMode.querySelectorAll("[data-map-mode]"))
      button.setAttribute("aria-pressed", String(button.dataset.mapMode === value));
  }

  function requestFrame() {
    if (framePending || !analysis || wanted === view.tick) return;
    if (player) paint(player.view(wanted));
    else {
      framePending = true;
      worker.postMessage({ type: "seek", tick: wanted });
    }
  }

  function seek(tick) {
    if (!analysis) return;
    wanted = Math.max(0, Math.min(analysis.max, tick));
    scrub.value = wanted;
    requestFrame();
  }

  function frame(now) {
    if (!display) return;
    display.render();
    const interval = (analysis.unit === "s" ? 100 : 230) / Number($("#trajectory-speed").value);
    if (playing && !framePending && now - lastAdvance >= interval) {
      lastAdvance = now;
      seek(wanted + 1);
    }
    frameHandle = requestAnimationFrame(frame);
  }

  const change = (patch, autoLoad = true) => {
    state = { ...state, record: undefined, at: undefined, ...patch };
    refresh(autoLoad);
  };
  cohortSelect.addEventListener("change", () => change({ cohort: cohortSelect.value }));
  methodSelect.addEventListener("change", () => change({ method: methodSelect.value }));
  seed.addEventListener("change", () => {
    if (seed.reportValidity()) change({ seed: seed.value });
  });
  archiveSeeds.addEventListener("change", () => {
    if (archiveSeeds.value) change({ seed: archiveSeeds.value });
  });
  budget.addEventListener("change", () => {
    if (budget.reportValidity()) change({ budget: budget.value });
  });
  open.addEventListener("click", () => start(false));
  run.addEventListener("click", () => start(true));
  cancel.addEventListener("click", () => {
    clear();
    statusText("Trajectory preparation canceled.");
  });
  play.addEventListener("click", () => {
    if (playing) return pause();
    if (wanted === analysis.max) seek(0);
    playing = true;
    play.textContent = "Pause";
    lastAdvance = performance.now();
  });
  stepBack.addEventListener("click", () => { pause(); seek(wanted - 1); });
  stepForward.addEventListener("click", () => { pause(); seek(wanted + 1); });
  scrub.addEventListener("input", () => { pause(); seek(Number(scrub.value)); });
  chartMetric.addEventListener("change", draw);
  new ResizeObserver(draw).observe(canvas);
  mapMode.addEventListener("click", (event) => {
    const button = event.target.closest("[data-map-mode]");
    if (button) setMapMode(button.dataset.mapMode);
  });
  paired.addEventListener("click", () => {
    if (!counterpart) return;
    navigation.go("trajectory", {
      ...picker.get(), profile: profileFromConfig(counterpart.config), cohort: counterpart.id,
      method: state.method, seed: state.seed, at: wanted,
    });
  });
  $("#trajectory-export").addEventListener("click", () => {
    if (readable?.type === "platform") download(`hex-${state.problem}-${state.method}-s${state.seed}.json`, JSON.stringify(readable.recording, null, 2));
  });
  $("#trajectory-comparison").addEventListener("click", () => navigation.go("comparison", { ...picker.get(), ...(cohort ? { cohort: cohort.id } : {}) }));

  return {
    async show(params) {
      clear();
      const token = generation;
      picker.set(params);
      state = { ...params };
      $("#trajectory-filters").inert = true;
      open.hidden = run.hidden = true;
      statusText("Loading available recordings…");
      try {
        catalog = await getCatalog();
      } catch {
        catalog = { cohorts: [], rows: [] };
      }
      if (token !== generation) return;
      $("#trajectory-filters").inert = false;
      refresh(true);
      if (params.run === "1" && !run.hidden && !run.disabled) start(true);
    },
    hide: clear,
    open(recording) {
      const id = `imported-${++importedIndex}`;
      if (imported.size >= 12) imported.delete(imported.keys().next().value);
      imported.set(id, { type: "platform", recording, label: "Imported platform decisions" });
      const problem = problemRegistry.get(recording.problemId);
      const scopeConfig = problem.restoreRecordingConfig?.(recording.config) ?? recording.config;
      navigation.go("trajectory", {
        ...scopeFromConfig(recording.problemId, scopeConfig),
        cohort: "browser", method: recording.methodId ?? "manual", seed: recording.config.seed, record: id,
      });
    },
  };
}
