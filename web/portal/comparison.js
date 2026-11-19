import { bars, node, table } from "./charts.js";
import {
  cohortName, factionName, fillOptions, format, getCatalog, methodName, metricOptions,
  mountScope, opponentName, scopedCohorts,
} from "./data.js";

function matchingRows(rows, methods, metric, seed) {
  const byMethod = new Map(methods.map((method) => [method, new Map()]));
  for (const row of rows)
    if (Number.isFinite(row.metrics[metric]) && (!seed || Number(seed) === row.seed))
      byMethod.get(row.method)?.set(row.seed, row);
  const matched = [...(byMethod.values().next().value?.keys() ?? [])]
    .filter((candidate) => [...byMethod.values()].every((runs) => runs.has(candidate)))
    .sort((a, b) => a - b);
  return {
    seeds: matched,
    groups: methods.map((method) => ({ method, runs: matched.map((seed) => byMethod.get(method).get(seed)) })),
  };
}

function summarize(runs, metric) {
  if (!runs.length) return { mean: null, sd: null };
  const values = runs.map((run) => run.metrics[metric]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = values.length > 1
    ? Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1))
    : null;
  return { mean, sd };
}

export function mountComparison(root, navigation) {
  const $ = (selector) => root.querySelector(selector);
  const source = $("#comparison-source"), team = $("#comparison-team"), opponent = $("#comparison-opponent");
  const cohortPicker = $("#comparison-cohort"), metric = $("#comparison-metric"), seed = $("#comparison-seed");
  const controls = $("#comparison-methods"), output = $("#comparison-output"), status = $("#comparison-status");
  const next = $("#comparison-next");
  let catalog, state, version = 0;
  const picker = mountScope($("#comparison-scope"), {}, (scope) => {
    state = { ...scope, ...(state.problem === scope.problem ? { source: state.source, metric: state.metric, methods: state.methods } : {}) };
    render();
  });

  function setField(select, options, value, hidden = false) {
    fillOptions(select, options, value);
    select.parentElement.hidden = hidden;
    select.disabled = !options.length;
    return select.value;
  }

  function trajectoryButton(label, cohort, method, seed) {
    const button = node("button", label, "subtle");
    button.type = "button";
    button.addEventListener("click", () => navigation.go("trajectory", {
      ...picker.get(), cohort: cohort.id, method, seed,
    }));
    return button;
  }

  function render() {
    const scope = picker.get();
    const cohorts = scopedCohorts(catalog, scope);
    const requested = cohorts.find(({ id }) => id === state.cohort);
    const sources = [...new Set(cohorts.map(({ source }) => source))];
    const currentSource = setField(source, sources.map((id) => [id, catalog.sources[id].name]),
      requested?.source ?? state.source ?? (sources.includes("shared") ? "shared" : undefined));
    const sourceCohorts = cohorts.filter(({ source }) => source === currentSource);
    const legacy = currentSource === "legacy";
    const teams = [...new Set(sourceCohorts.map(({ config }) => config.team))].filter(Boolean);
    const currentTeam = setField(team, teams.map((id) => [id, factionName(id)]),
      requested?.config.team ?? state.team, !legacy);
    const teamCohorts = legacy ? sourceCohorts.filter(({ config }) => config.team === currentTeam) : sourceCohorts;
    const opponents = [...new Set(teamCohorts.map(({ config }) => config.opponent))].filter(Boolean);
    const currentOpponent = setField(opponent, opponents.map((id) => [id, opponentName(id)]),
      requested?.config.opponent ?? state.opponent ?? "focus", !legacy);
    const visible = legacy ? teamCohorts.filter(({ config }) => config.opponent === currentOpponent) : teamCohorts;
    const cohortId = setField(cohortPicker, visible.map((item) => [item.id, cohortName(catalog, item)]),
      requested?.id, visible.length <= 1);
    const activeCohort = visible.find(({ id }) => id === cohortId);
    const rows = catalog.rows.filter((row) => row.cohort === cohortId);
    const metrics = metricOptions[scope.problem].filter(([key]) => rows.some((row) => Number.isFinite(row.metrics[key])));
    const metricId = setField(metric, metrics.map(([key, label]) => [key, label]), state.metric);
    const seeds = [...new Set(rows.map((row) => row.seed))].sort((a, b) => a - b);
    const seedKey = setField(seed, [["", "All matched seeds"], ...seeds.map((number) => [String(number), `Seed ${number}`])], state.seed);
    seed.disabled = !seeds.length;
    const allMethods = [...new Set(rows.map((row) => row.method))];
    const selected = state.methods ? state.methods.split(",").filter((method) => allMethods.includes(method)) : allMethods;
    const methods = selected.length || !state.methods ? selected : allMethods;
    const params = {
      ...scope,
      ...(activeCohort ? { cohort: activeCohort.id } : {}),
      ...(metricId ? { metric: metricId } : {}),
      ...(seedKey ? { seed: seedKey } : {}),
      ...(methods.length < allMethods.length ? { methods: methods.join(",") } : {}),
    };
    state = { ...params, source: currentSource, team: currentTeam, opponent: currentOpponent };
    navigation.replace("comparison", params);

    output.replaceChildren();
    controls.parentElement.hidden = !rows.length;
    next.hidden = Boolean(rows.length);
    if (!rows.length) {
      status.textContent = "No archived comparison matches these settings. The trajectory module can run a new seed with this setup.";
      return;
    }
    status.textContent = legacy
      ? `${factionName(currentTeam)} vs ${opponentName(currentOpponent)} · ${activeCohort.config.horizon} s maximum · native policies decide every 0.5 s`
      : cohortName(catalog, activeCohort);
    renderMethods(allMethods, methods);
    if (!metrics.length) return;

    const [, label, unit] = metrics.find(([key]) => key === metricId);
    const matched = matchingRows(rows, methods, metricId, seedKey);
    if (!matched.seeds.length) {
      output.append(node("p", "No seeds with this metric are shared by all selected methods.", "muted"));
      return;
    }
    const groups = matched.groups.map((entry) => ({ ...entry, ...summarize(entry.runs, metricId) }));
    output.append(
      node("h2", label),
      node("p", `${matched.seeds.length} matched ${matched.seeds.length === 1 ? "seed" : "seeds"} per method · means and sample standard deviations`, "muted"),
      bars(groups.map(({ method, mean }) => ({ name: methodName(method), value: mean })), unit),
    );
    const hasOutcome = groups.every(({ runs }) => runs.every(({ metrics }) => Number.isFinite(metrics.draw)));
    output.append(table(["Method", "Seeds", ...(hasOutcome ? ["Win / draw / loss"] : []), "Mean", "SD", "Trajectory"],
      groups.map(({ method, runs, mean, sd }) => {
        const wins = runs.filter(({ metrics }) => metrics.win === 1).length;
        const draws = runs.filter(({ metrics }) => metrics.draw === 1).length;
        const recorded = runs.find(({ recording }) => recording);
        return [methodName(method), runs.length,
          ...(hasOutcome ? [`${wins} / ${draws} / ${runs.length - wins - draws}`] : []),
          format(mean, unit), format(sd, unit),
          trajectoryButton(recorded ? "Open replay" : "Open seed", activeCohort, method, (recorded ?? runs[0]).seed)];
      })));
    const detail = node("details", undefined, "portal-details");
    detail.append(node("summary", "Individual seed results"),
      table(["Method", "Seed", label, "Trajectory"], groups.flatMap(({ method, runs }) => runs.map((run) => [
        methodName(method), run.seed, format(run.metrics[metricId], unit),
        trajectoryButton(run.recording ? "Open replay" : "Open seed", activeCohort, method, run.seed),
      ]))));
    output.append(detail);
    if (legacy) output.append(node("p", "Other factions share the selected opponent policy. Different seeds can produce identical maps or outcomes. Archived results describe controller performance.", "muted"));
  }

  function renderMethods(all, selected) {
    controls.replaceChildren(...all.map((method) => {
      const label = node("label", undefined, "check-label");
      const check = node("input");
      check.type = "checkbox";
      check.value = method;
      check.checked = selected.includes(method);
      label.append(check, methodName(method));
      return label;
    }));
    controls.closest("details").querySelector("summary").textContent = `Methods (${selected.length}/${all.length})`;
  }
  controls.addEventListener("change", ({ target }) => {
    const chosen = [...controls.querySelectorAll("input:checked")].map(({ value }) => value);
    if (!chosen.length) {
      target.checked = true;
      return;
    }
    state.methods = chosen.join(",");
    render();
    const nextInput = [...controls.querySelectorAll("input")].find(({ value }) => value === target.value);
    nextInput?.focus();
  });
  source.addEventListener("change", () => { state = { ...state, source: source.value, cohort: "" }; render(); });
  team.addEventListener("change", () => { state = { ...state, source: source.value, team: team.value, opponent: opponent.value, cohort: "" }; render(); });
  opponent.addEventListener("change", () => { state = { ...state, source: source.value, team: team.value, opponent: opponent.value, cohort: "" }; render(); });
  cohortPicker.addEventListener("change", () => { state.cohort = cohortPicker.value; render(); });
  metric.addEventListener("change", () => { state.metric = metric.value; render(); });
  seed.addEventListener("change", () => { state.seed = seed.value; render(); });
  next.addEventListener("click", () => navigation.go("trajectory", picker.get()));

  return {
    async show(params) {
      const current = ++version;
      picker.set(params);
      state = { ...params };
      $("#comparison-scope").inert = true;
      status.textContent = "Loading comparison archive…";
      output.replaceChildren();
      $("#comparison-filters").hidden = true;
      controls.parentElement.hidden = true;
      next.hidden = true;
      try {
        catalog = await getCatalog();
        if (current !== version) return;
        $("#comparison-filters").hidden = false;
        render();
      } catch (error) {
        if (current === version) {
          status.textContent = error.message;
          next.hidden = false;
        }
      } finally {
        if (current === version) $("#comparison-scope").inert = false;
      }
    },
    hide() { version++; },
  };
}
