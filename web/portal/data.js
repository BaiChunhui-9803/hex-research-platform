import { problemRegistry } from "../../problems/index.js";
import { methodRegistry } from "../../methods/index.js";
import { compatibility } from "../../core/registry.js";
import { benchmarkSettings, scenarioKey } from "../../core/frozen-difficulty.js";
import { projectURL } from "../paths.js";

export const profiles = {
  dual: { name: "Dual maps · linked", config: { coupling: "both" } },
  "dual-off": { name: "Dual maps · uncoupled", config: { coupling: "none" } },
  shared: { name: "Shared grid · standard benchmark", config: { layout: "shared", coupling: "both", spatialVariant: "auto" } },
  "shared-off": { name: "Shared grid · uncoupled", config: { layout: "shared", coupling: "none", spatialVariant: "auto" } },
  gentle: { name: "Shared grid · gentle", config: { layout: "shared", coupling: "both", spatialVariant: "gentle" } },
  wide: { name: "Shared grid · wide", config: { layout: "shared", coupling: "both", spatialVariant: "wide" } },
  adaptive: { name: "Shared grid · layout-adaptive", config: { layout: "shared", coupling: "both", spatialVariant: "adaptive" } },
  pilot: { name: "Shared grid · pilot selection", config: { layout: "shared", coupling: "both", spatialVariant: "pilot" } },
  compiled: { name: "Feature-compiled public network", config: { layout: "shared", coupling: "both", ruleMode: "features" } },
};

export const metricOptions = {
  metro: [
    ["completion", "Delivered share", "ratio"], ["delivered", "Delivered passengers", "count"],
    ["track", "Track used", "count"], ["score", "Service score", "count"],
  ],
  skirmish: [
    ["win", "Win rate", "ratio"], ["survival", "Remaining HP", "ratio"],
    ["hpMargin", "HP margin", "count"], ["time", "Duration (s)", "count"],
    ["draw", "Draw rate", "ratio"], ["survivalTime", "Survival time (s)", "count"],
    ["orders", "Effective unit commands", "count"],
  ],
  fusion: [
    ["completion", "Delivered share", "ratio"], ["win", "Squad win rate", "ratio"],
    ["survival", "Remaining squad HP", "ratio"], ["score", "Joint score", "count"],
    ["supply", "HP restored", "count"], ["delay", "Delayed train-minutes", "count"],
    ["holdMinutes", "Minutes with dispatch holds", "count"],
  ],
};

const numeric = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
export const format = (value, type) => Number.isFinite(value)
  ? type === "ratio" ? `${numeric.format(100 * value)}%` : numeric.format(value) : "—";

export const methodName = (id) => methodRegistry.list().find((method) => method.id === id)?.name ?? id;

export function profileFromConfig(config = {}) {
  if (config.ruleMode === "features") return "compiled";
  if (config.layout !== "shared") return config.coupling === "none" ? "dual-off" : "dual";
  if (config.spatialVariant === "adaptive") return "adaptive";
  if (config.spatialVariant === "pilot" || config.spatialSelector === "pilot") return "pilot";
  if (config.spatialVariant === "gentle" || config.spatialVariant === "wide") return config.spatialVariant;
  return config.coupling === "none" ? "shared-off" : "shared";
}

export function setupOverrides(setup) {
  try {
    const data = typeof setup === "string" ? JSON.parse(setup) : setup;
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function scopeFields(scope) {
  const problem = problemRegistry.get(scope.problem);
  const capabilities = problem.capabilities(scope.scenario);
  const preset = profiles[scope.profile]?.config ?? {};
  const defaults = { ...benchmarkSettings(scope.problem), ...preset };
  return problem.settings(scope.scenario)
    .filter((field) =>
      !["layout", "spatialVariant", "ruleMode"].includes(field.key) &&
      (!field.generatedOnly || preset.ruleMode === "features") &&
      (preset.ruleMode !== "features" || !["holdEvery", "pressureRadius"].includes(field.key)) &&
      (!field.feature || capabilities.features.includes(field.feature)) &&
      (!field.sharedOnly || preset.layout === "shared") &&
      (!field.adaptiveOnly || preset.spatialVariant === "adaptive"),
    )
    .map((field) => ({
      ...field, default: defaults[field.key] ?? field.default,
      ...(preset.ruleMode === "features" && field.key === "coupling" ?
        { choices: [{ value: "both", label: "Public station supply" }, { value: "none", label: "Public supply off" }] } : {}),
    }));
}

function validOverride(field, raw) {
  if (field.choices) return field.choices.find(({ value }) => String(value) === String(raw))?.value;
  if (raw === "" || raw == null) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= field.min && value <= field.max ? value : undefined;
}

export function normalizeScope(input = {}) {
  const problem = problemRegistry.list().find((entry) => entry.id === input.problem) ?? problemRegistry.get("fusion");
  const scenario = problem.scenarios.find((item) => item.id === input.scenario) ??
    problem.scenarios.find((item) => item.id === problem.defaultScenario);
  const scope = {
    problem: problem.id,
    scenario: scenario.id,
    ...(problem.id === "fusion" ? { profile: Object.hasOwn(profiles, input.profile) ? input.profile : "shared" } : {}),
  };
  const requested = setupOverrides(input.setup);
  const setup = Object.fromEntries(scopeFields(scope).flatMap((field) => {
    if (!Object.hasOwn(requested, field.key)) return [];
    const value = validOverride(field, requested[field.key]);
    if (scope.profile === "pilot" && field.key === "coupling") return [];
    return value !== undefined && value !== field.default ? [[field.key, value]] : [];
  }));
  if (Object.keys(setup).length) scope.setup = JSON.stringify(setup);
  return scope;
}

export function scopeFromConfig(problem, config) {
  return normalizeScope({ problem, scenario: config.scenarioId, profile: profileFromConfig(config), setup: config });
}

export function configForScope(scope, seed) {
  return {
    ...benchmarkSettings(scope.problem), scenarioId: scope.scenario, seed,
    ...(scope.problem === "fusion" ? profiles[scope.profile].config : {}),
    ...setupOverrides(scope.setup),
  };
}

export function scopedCohorts(catalog, scope) {
  const trackField = scope.problem === "metro" ? "trackTopology" : scope.problem === "fusion" ? "metroTrackTopology" : null;
  const requested = setupOverrides(scope.setup);
  const trackTopology = trackField ? requested[trackField] ?? "simple" : null;
  const cohorts = catalog.cohorts.filter((cohort) =>
    cohort.problemId === scope.problem && cohort.scenarioId === scope.scenario &&
    (!trackField || (cohort.config[trackField] ?? "legacy") === trackTopology) &&
    (scope.problem !== "fusion" || (
      (cohort.config.coupling === "both" || cohort.config.coupling === "none") &&
      profileFromConfig(cohort.config) === scope.profile
    )),
  );
  if (!cohorts.length || Object.keys(requested).every((key) => key === trackField)) return cohorts;
  const problem = problemRegistry.get(scope.problem);
  const key = (config) => scenarioKey(scope.problem, config, 0, true);
  const selected = key(problem.validateConfig(configForScope(scope, 26)));
  return cohorts.filter(({ config }) => key(config) === selected);
}

export function pairedFusionCohorts(catalog, scope) {
  if (Object.keys(setupOverrides(scope.setup)).some((key) => key !== "metroTrackTopology") ||
      !["shared", "shared-off", "dual", "dual-off"].includes(scope.profile)) return null;
  const base = scope.profile.startsWith("shared") ? "shared" : "dual";
  const paired = (profile) => scopedCohorts(catalog, { ...scope, profile })
    .find((cohort) => ["shared", "simple-fusion"].includes(cohort.source));
  const linked = paired(base), control = paired(`${base}-off`);
  if (!linked || !control) return null;
  const comparable = ({ source, budget, population, config }) => {
    const { coupling, ...settings } = config;
    return JSON.stringify([source, budget, population, Object.entries(settings).sort()]);
  };
  return comparable(linked) === comparable(control) ? { linked, control } : null;
}

export function pairedFusionEpisodes(catalog, scope) {
  const cohorts = pairedFusionCohorts(catalog, scope);
  if (!cohorts) return [];
  const { linked, control } = cohorts;
  const byCondition = new Map(catalog.rows.filter((row) => row.cohort === control.id)
    .map((row) => [`${row.method}:${row.seed}`, row]));
  return catalog.rows.filter((row) => row.cohort === linked.id).flatMap((row) => {
    const match = byCondition.get(`${row.method}:${row.seed}`);
    return match ? [{ linked: row, control: match }] : [];
  });
}

export const factionName = (team) => ({ blue: "Azure", orange: "Ember", violet: "Violet" })[team] ?? team;
export const opponentName = (policy) => methodName(`squad.${policy}`).replace(/^Squad · /, "");

export function cohortName(catalog, cohort) {
  const c = cohort.config;
  const sides = c.team ? [factionName(c.team), `vs ${opponentName(c.opponent)}`, `${c.horizon} s`] :
    c.skirmishHorizon ? [`${c.metroHorizon} min / ${c.skirmishHorizon} s`] : [`${c.horizon} min`];
  if (cohort.source === "legacy") return [catalog.sources.legacy.name, ...sides].join(" · ");
  const trackRule = cohort.problemId === "skirmish" ? [] : [
    (c.trackTopology ?? c.metroTrackTopology) === "simple" ? "simple tracks" : "legacy tracks",
  ];
  return [catalog.sources[cohort.source].name, ...sides, ...trackRule, `${cohort.budget} evals/plan`].join(" · ");
}

export function availableMethods(scope) {
  const capabilities = problemRegistry.get(scope.problem).capabilities(scope.scenario);
  return methodRegistry.list().filter((method) => compatibility(method, capabilities).compatible);
}

export function fillOptions(select, entries, value) {
  select.replaceChildren(...entries.map(([key, title]) => new Option(title, key)));
  if (entries.some(([key]) => key === value)) select.value = value;
}

export function mountScope(container, initial, onChange, { split = false, fixedProblem, hideTemplate = false } = {}) {
  function field(name, label) {
    const wrapper = document.createElement("label");
    const select = document.createElement("select");
    select.dataset.scope = name;
    wrapper.append(label, select);
    container.append(wrapper);
    return select;
  }
  const type = field("problem", "Problem");
  const scenario = field("scenario", "Scenario");
  const metro = split ? field("metro", "Metro scenario") : null;
  const squad = split ? field("skirmish", "Squad scenario") : null;
  const profile = field("profile", "Fusion template");
  let scope;
  function set(input) {
    scope = normalizeScope({ ...input, problem: fixedProblem ?? input.problem });
    fillOptions(type, problemRegistry.list().map((entry) => [entry.id, entry.name]), scope.problem);
    type.parentElement.hidden = Boolean(fixedProblem);
    const problem = problemRegistry.get(scope.problem);
    const splitFusion = split && scope.problem === "fusion";
    scenario.parentElement.hidden = splitFusion;
    if (split) {
      metro.parentElement.hidden = squad.parentElement.hidden = !splitFusion;
      if (splitFusion) {
        const pair = problem.scenarios.find(({ id }) => id === scope.scenario);
        fillOptions(metro, problemRegistry.get("metro").scenarios.map(({ id, name }) => [id, name]), pair.components.metro);
        fillOptions(squad, problemRegistry.get("skirmish").scenarios.map(({ id, name }) => [id, name]), pair.components.skirmish);
      }
    }
    if (!splitFusion) fillOptions(scenario, problem.scenarios.map(({ id, name }) => [id, name]), scope.scenario);
    profile.parentElement.hidden = hideTemplate || scope.problem !== "fusion";
    fillOptions(profile, Object.entries(profiles).map(([id, data]) => [id, data.name]), scope.profile);
  }
  type.addEventListener("change", () => {
    set({ problem: type.value });
    onChange(scope);
  });
  scenario.addEventListener("change", () => {
    set({ ...scope, scenario: scenario.value });
    onChange(scope);
  });
  profile.addEventListener("change", () => {
    set({ ...scope, profile: profile.value });
    onChange(scope);
  });
  function selectPair() {
    set({ ...scope, scenario: `${metro.value}--${squad.value}` });
    onChange(scope);
  }
  metro?.addEventListener("change", selectPair);
  squad?.addEventListener("change", selectPair);
  set(initial);
  return { get: () => scope, set };
}

const promises = new Map();
function fetchJSON(path) {
  if (!promises.has(path)) {
    const request = fetch(projectURL(path)).then((res) => {
      if (!res.ok) throw new Error(`Archive file unavailable (${res.status})`);
      return res.json();
    }).catch((error) => {
      promises.delete(path);
      throw error;
    });
    promises.set(path, request);
  }
  return promises.get(path);
}
export const getCatalog = () => fetchJSON("web/archive/catalog.json");

export async function loadRecording(pointer) {
  if (!pointer) throw new Error("No recording for this seed");
  if (pointer.type === "legacy") {
    const resp = await fetch(projectURL(pointer.path));
    if (!resp.ok) throw new Error(`Legacy trace unavailable (${resp.status})`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const decoded = bytes[0] === 31 && bytes[1] === 139
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json()
      : JSON.parse(new TextDecoder().decode(bytes));
    return { type: "legacy", trace: decoded, team: pointer.team };
  }
  const data = await fetchJSON(pointer.path);
  const recording = pointer.type === "bundle" ? data[pointer.index] : data.results[pointer.index]?.replay;
  if (!recording) throw new Error("Invalid recording pointer");
  return { type: "platform", recording };
}
