import {
  combineScenarios,
  combineSearchTasks,
  combineVectorTasks,
  sharedSearchCapabilities,
} from "../../core/fusion.js";
import { integer } from "../../core/random.js";
import { planChange } from "../../engines/metro/shared/edit-cost.js";
import { metro } from "../metro/index.js";
import { routeVectorTask } from "../metro/vector.js";
import { skirmish } from "../skirmish/index.js";
import { createSharedParts } from "./shared-map.js";
import {
  advanceSpatial,
  compileSpatialRules,
  SPATIAL_RULE_VERSION,
  spatialVariants,
} from "./spatial-rules.js";
import { selectSpatialVariant } from "./spatial-pilot.js";
import { DESIGN_GOALS, FEATURE_RULE_VERSION, RULE_CANDIDATE_CHOICES, compileFeatureRules } from "../../core/rule-composition.js";
import { createFeatureFusion, evaluateFeatureDesign, featureTables } from "./feature-fusion.js";
import {
  advanceJoint,
  couplingProfiles,
  hasSupply,
  newTimeline,
  SUPPORT_CAP,
  underPressure,
} from "./rules.js";

const sources = [metro, skirmish];
const pairs = combineScenarios(sources);
const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
const defaultScenario = `${metro.defaultScenario}--${skirmish.defaultScenario}`;
const RULE_VERSION = 1;

function getPair(id) {
  const pair = pairById.get(id);
  if (!pair) throw new Error(`Unknown fusion pair: ${id}`);
  return pair;
}

const compositionFields = [
  { key: "supplyCap", name: "Stored supply limit (HP)", min: 0, max: 180, default: SUPPORT_CAP },
  { key: "squadOffsetQ", name: "Squad offset Q (hexes)", min: -4, max: 4, default: 0, sharedOnly: true },
  { key: "squadOffsetR", name: "Squad offset R (hexes)", min: -4, max: 4, default: 0, sharedOnly: true },
  { key: "stationRadius", name: "Supply radius (0 = automatic)", min: 0, max: 4, default: 0, sharedOnly: true },
  { key: "pressureRadius", name: "Pressure radius (0 = automatic)", min: 0, max: 4, default: 0, sharedOnly: true },
  { key: "supplyReachTarget", name: "Target friendly coverage (%)", min: 0, max: 100, default: 50, adaptiveOnly: true },
  { key: "pressureReachTarget", name: "Target segment coverage (%)", min: 0, max: 100, default: 30, adaptiveOnly: true },
];
const childKey = (id, key) => id + key[0].toUpperCase() + key.slice(1);

const prefixed = (schema, prefix, label) =>
  schema.map((metric) => ({
    ...metric,
    id: `${prefix}.${metric.id}`,
    name: `${label} · ${metric.name}`,
  }));
const metroMetrics = prefixed(metro.metrics, "metro", "Metro");
const squadMetrics = prefixed(skirmish.metrics, "skirmish", "Squad");
const metricSchema = [
  { id: "score", name: "Joint score", direction: "max", unit: "points" },
  metroMetrics.find((metric) => metric.id === "metro.delivered"),
  squadMetrics.find((metric) => metric.id === "skirmish.hpRatio"),
  {
    id: "supportUsed",
    name: "Squad HP restored",
    direction: "context",
    unit: "HP",
  },
  {
    id: "heldMinutes",
    name: "Rail dispatch holds",
    direction: "min",
    unit: "min",
  },
  ...metroMetrics.filter((metric) => metric.id !== "metro.delivered"),
  ...squadMetrics.filter((metric) => metric.id !== "skirmish.hpRatio"),
  {
    id: "supportProduced",
    name: "Supply produced",
    direction: "context",
    unit: "HP",
  },
];

function splitConfig(input, pair) {
  return Object.fromEntries(sources.map((source) => {
    const scenarioId = pair.components[source.id];
    const fields = source.settings(scenarioId);
    const overrides = Object.fromEntries(fields.map(({ key }) => [key, input[childKey(source.id, key)]]));
    return [source.id, source.validateConfig({ ...overrides, scenarioId, seed: input.seed })];
  }));
}

function memberSettings(problem, pair, label) {
  return problem.settings(pair.components[problem.id]).map((setting) => ({
    ...setting,
    key: childKey(problem.id, setting.key),
    group: problem.id,
    name: `${label} · ${setting.name}`,
  }));
}

const normalize = (score, scale) => score / (scale + Math.abs(score));
const round = (value) => Math.round(value * 100) / 100;
function namespaced(prefix, record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [`${prefix}.${key}`, value]),
  );
}

function install(parts, candidate) {
  if (!candidate?.metro || !candidate?.skirmish)
    throw new Error(
      "A fusion solution needs a route plan and squad controller",
    );
  parts.metro.acceptSolution(candidate.metro);
  parts.skirmish.acceptSolution(candidate.skirmish);
}

export const fusion = {
  id: "fusion",
  name: "Problem Fusion",
  shortName: "METRO + SQUAD",
  description:
    "Build a joint scenario with passenger supply and rail disruption.",
  sourceProblems: sources.map((source) => source.id),
  view: "/web/views/fusion.js",
  timeUnit: "cycle",
  stepSize: 1,
  defaultScenario,
  scenarios: pairs.map((pair) => ({
    ...pair,
    description: "Plan the metro and command the squad in the same episode.",
  })),
  metrics: metricSchema,
  components(config) {
    return splitConfig(config, getPair(config.scenarioId));
  },
  restoreRecordingConfig(config) {
    return { ...config, metroTrackTopology: metro.restoreRecordingConfig({ trackTopology: config.metroTrackTopology }).trackTopology };
  },
  sourceFeatureTables(config) {
    return featureTables(this.components(config));
  },
  design(input, check) {
    const goal = input.designGoal ?? "agency";
    if (!Object.hasOwn(DESIGN_GOALS, goal)) throw new Error("Unknown fusion design goal");
    const base = this.validateConfig({ ...input, ruleMode: "preset", layout: "shared",
      coupling: "both", spatialVariant: "auto" });
    const report = evaluateFeatureDesign(base, this.components(base), goal, check);
    return {
      ...report, config: report.selected ? {
        ...base, ruleMode: "features", featureRuleVersion: FEATURE_RULE_VERSION,
        ruleCandidate: report.selected, designGoal: goal,
      } : null,
    };
  },

  settings(id) {
    const pair = getPair(id);
    return [
      {
        key: "ruleMode", name: "Rule source", default: "preset",
        choices: [{ value: "preset", label: "Spatial preset" }, { value: "features", label: "Feature compiler" }],
      },
      {
        key: "designGoal", name: "Composition goal", default: "agency", generatedOnly: true,
        choices: Object.entries(DESIGN_GOALS).map(([value, label]) => ({ value, label })),
      },
      {
        key: "ruleCandidate", name: "Compiled construction", default: "auto", generatedOnly: true,
        choices: [{ value: "auto", label: "Select by pilot simulation" }, ...RULE_CANDIDATE_CHOICES],
      },
      {
        key: "coupling",
        name: "Coupling rules",
        default: "both",
        choices: Object.entries(couplingProfiles).map(([value, profile]) => ({
          value,
          label: profile.label,
        })),
      },
      {
        key: "layout",
        name: "Map layout",
        default: "dual",
        choices: [
          { value: "dual", label: "Independent maps" },
          { value: "shared", label: "Shared axial grid" },
        ],
      },
      {
        key: "spatialVariant",
        name: "Spatial rules (shared grid)",
        default: "auto",
        choices: [
          { value: "auto", label: "Automatic · capability priority" },
          { value: "adaptive", label: "Automatic · fit to assembled map" },
          { value: "pilot", label: "Automatic · six pilot rollouts" },
          ...Object.keys(spatialVariants).map((value) => ({ value, label: value })),
        ],
      },
      {
        key: "metroWeight",
        name: "Metro score weight (%)",
        min: 0,
        max: 100,
        default: 50,
      },
      {
        key: "supportPerPassenger",
        name: "Supply (HP per arrival)",
        min: 0,
        max: 20,
        default: 6,
      },
      {
        key: "holdEvery",
        name: "Dispatch hold interval",
        min: 2,
        max: 12,
        default: 3,
      },
      {
        key: "prepMinutes",
        name: "Rail preparation (min)",
        min: 0,
        max: 30,
        default: 20,
      },
      ...compositionFields,
      ...memberSettings(metro, pair, "Metro"),
      ...memberSettings(skirmish, pair, "Squad"),
    ];
  },

  capabilities(id) {
    const pair = getPair(id);
    const [rail, squad] = sources.map((source) =>
      source.capabilities(pair.components[source.id]),
    );
    const shared = sharedSearchCapabilities([rail, squad]);
    return {
      ...shared,
      features: [
        ...shared.features,
        ...(pair.dynamic ? ["dynamic-stations"] : []),
      ],
      encoding:
        "A route plan and squad controller, with their native or concatenated vector encodings.",
      searchMeaning:
        "Candidates are evaluated in a joint rollout. Growing cities and mid-episode replans use up to 30 minutes of current-station demand forecasts.",
      objectiveSchema: [
        ...prefixed(rail.objectiveSchema, "metro", "Metro"),
        ...prefixed(squad.objectiveSchema, "skirmish", "Squad"),
      ],
    };
  },

  validateConfig(input = {}) {
    const scenarioId = input.scenarioId ?? defaultScenario;
    const pair = getPair(scenarioId);
    if (
      input.fusionRuleVersion !== undefined &&
      input.fusionRuleVersion !== RULE_VERSION
    )
      throw new Error("Unsupported fusion rule version");
    const ruleMode = input.ruleMode ?? "preset";
    if (!["preset", "features"].includes(ruleMode)) throw new Error("Unknown rule source");
    const generated = ruleMode === "features";
    const coupling = input.coupling ?? "both";
    if (!Object.hasOwn(couplingProfiles, coupling))
      throw new Error("Unknown coupling profile");
    if (generated && !["both", "none"].includes(coupling))
      throw new Error("The compiled public network supports its public stock or a stock-off control");
    const layout = generated ? "shared" : input.layout ?? "dual";
    if (layout !== "dual" && layout !== "shared") throw new Error("Unknown fusion layout");
    const spatialVariant = generated ? "auto" : input.spatialVariant ?? "auto";
    if (layout === "shared" && !["auto", "pilot", "adaptive"].includes(spatialVariant) &&
        !Object.hasOwn(spatialVariants, spatialVariant))
      throw new Error("Unknown spatial variant");
    if (layout === "shared" && input.spatialRuleVersion != null && input.spatialRuleVersion !== SPATIAL_RULE_VERSION)
      throw new Error("Unsupported shared-grid rule version");
    const children = splitConfig(input, pair);
    const childSettings = Object.entries(children).flatMap(([id, { scenarioId, seed, ...settings }]) =>
      Object.entries(settings).map(([key, value]) => [childKey(id, key), value]));
    const extraSettings = {};
    for (const field of compositionFields) {
      if (field.sharedOnly && layout !== "shared") continue;
      if (field.adaptiveOnly && !(layout === "shared" && spatialVariant === "adaptive")) continue;
      const value = integer(input[field.key], field.default, field.min, field.max, field.name);
      if (value !== field.default) extraSettings[field.key] = value;
    }
    const validated = {
      scenarioId,
      seed: children.metro.seed,
      fusionRuleVersion: RULE_VERSION,
      coupling,
      metroWeight: integer(input.metroWeight, 50, 0, 100, "Metro score weight"),
      supportPerPassenger: integer(
        input.supportPerPassenger,
        6,
        0,
        20,
        "Supply per arrival",
      ),
      holdEvery: integer(input.holdEvery, 3, 2, 12, "Dispatch hold interval"),
      prepMinutes: integer(input.prepMinutes, 20, 0, 30, "Rail preparation"),
      ...Object.fromEntries(childSettings),
      ...extraSettings,
      ...(layout === "shared" ? { layout, spatialVariant, spatialRuleVersion: SPATIAL_RULE_VERSION } : {}),
    };
    if (generated) {
      const designGoal = input.designGoal ?? "agency";
      if (!Object.hasOwn(DESIGN_GOALS, designGoal)) throw new Error("Unknown fusion design goal");
      if (input.featureRuleVersion != null && input.featureRuleVersion !== FEATURE_RULE_VERSION)
        throw new Error("Unsupported feature rule version");
      let ruleCandidate = input.ruleCandidate ?? "auto";
      if (ruleCandidate === "auto") ruleCandidate = evaluateFeatureDesign(validated, children, designGoal).selected;
      const chosen = compileFeatureRules(featureTables(children)).candidates.find(({ id }) => id === ruleCandidate);
      if (!chosen?.admissible) throw new Error("No compatible compiled construction");
      return { ...validated, ruleMode, featureRuleVersion: FEATURE_RULE_VERSION, ruleCandidate, designGoal };
    }
    if (layout === "shared" && spatialVariant === "pilot") {
      if (coupling !== "both") throw new Error("Pilot selection requires both spatial feedback directions");
      const outcome = selectSpatialVariant((candidate) => this.create(candidate), validated);
      return { ...validated, spatialVariant: outcome.variant, spatialSelector: "pilot" };
    }
    if (layout === "shared" && Object.hasOwn(spatialVariants, spatialVariant) && input.spatialSelector === "pilot")
      return { ...validated, spatialSelector: "pilot" };
    return validated;
  },

  create(config) {
    const pair = getPair(config.scenarioId);
    const children = splitConfig(config, pair);
    if (config.ruleMode === "features") {
      const selected = compileFeatureRules(featureTables(children)).candidates
        .find(({ id }) => id === config.ruleCandidate);
      if (!selected?.program) throw new Error("The selected construction cannot be compiled for this scenario");
      return createFeatureFusion(config, children, selected.program);
    }
    const profile = couplingProfiles[config.coupling];
    const objectiveSchema = this.capabilities(pair.id).objectiveSchema;
    const shared = config.layout === "shared" ? createSharedParts(children, config) : null;
    const spatial = shared ? compileSpatialRules(config, shared.capabilities, shared.geometry) : null;
    let parts = shared?.parts ?? {
      metro: metro.create(children.metro),
      skirmish: skirmish.create(children.skirmish),
    };
    const clock = newTimeline();
    if (spatial) Object.assign(clock, { stationStocks: {}, heldTrainMinutes: 0, movingTrainMinutes: 0, lastHeldLines: [] });
    const copyClock = (value) => spatial ? structuredClone(value) : { ...value };
    const advance = (environments, timeline) => spatial
      ? advanceSpatial(environments, timeline, config, spatial)
      : advanceJoint(environments, timeline, config);
    const { ownMax, enemyMax } = parts.skirmish.health();
    const weight = config.metroWeight / 100;
    const jointScore = (rail, squad) =>
      100 *
      (weight * normalize(rail.score, 10 * config.metroHorizon) +
        (1 - weight) * normalize(squad.score, 1000 + ownMax + enemyMax));
    const pressured = () => spatial
      ? clock.lastHold
      : profile.holds && underPressure(parts.skirmish, config.skirmishTeam);
    const links = () => ({
      mode: config.coupling,
      supplyEnabled: spatial ? spatial.supply : hasSupply(config),
      holdsEnabled: spatial ? spatial.holds : profile.holds,
      supplyPerPassenger: config.supportPerPassenger,
      supplyCap: config.supplyCap ?? SUPPORT_CAP,
      dispatchInterval: spatial?.holdEvery ?? config.holdEvery,
      pressured: pressured(),
      prepRemaining: Math.max(0, config.prepMinutes - clock.cycle),
      ...copyClock(clock),
      ...(spatial ? { spatial, sharedMap: shared.layout } : {}),
    });
    const measured = (environments, timeline) => {
      const rail = environments.metro.metrics();
      const squad = environments.skirmish.metrics();
      return {
        score: jointScore(rail, squad),
        ...namespaced("metro", rail),
        ...namespaced("skirmish", squad),
        supportProduced: timeline.supportProduced,
        supportUsed: round(timeline.supportUsed),
        heldMinutes: timeline.heldMinutes,
        ...(spatial ? {
          heldTrainMinutes: timeline.heldTrainMinutes,
          movingTrainMinutes: timeline.movingTrainMinutes,
          ownStartingHp: ownMax,
        } : {}),
      };
    };

    function taskContext(maxChange) {
      const rail = parts.metro.createSearchTask(maxChange);
      const squad = parts.skirmish.createSearchTask();
      const incumbent = parts.metro.currentPlan();
      const controller = parts.skirmish.currentController();
      const transit = parts.metro.fork({ forecast: true });
      const battle = parts.skirmish.fork({ forecast: true });
      const timeline = copyClock(clock);
      const observation = parts.metro.observe();
      const originalDelivered = parts.metro.delivered();
      if (controller) squad.initial = () => structuredClone(controller);
      rail.initial = () => structuredClone(incumbent);
      function evaluate(candidate) {
        const future = { metro: transit.fork(), skirmish: battle.fork() };
        const simulated = copyClock(timeline);
        let editUnits;
        try {
          install(future, candidate);
          editUnits = planChange(incumbent, candidate.metro).editUnits;
          if (editUnits > maxChange) return { valid: false, score: -Infinity };
        } catch {
          return { valid: false, score: -Infinity };
        }
        while (!future.metro.done()) advance(future, simulated);
        const railMetrics = future.metro.metrics();
        const squadMetrics = future.skirmish.metrics();
        const health = future.skirmish.health();
        return {
          valid: true,
          score: jointScore(railMetrics, squadMetrics),
          objectives: [
            -(railMetrics.delivered - originalDelivered),
            pair.dynamic ? editUnits : railMetrics.track,
            1 - health.ownHp / Math.max(1, ownMax),
            health.enemyHp / Math.max(1, enemyMax),
          ],
          metrics: {
            metro: railMetrics,
            skirmish: squadMetrics,
            supportUsed: round(simulated.supportUsed - timeline.supportUsed),
            heldMinutes: simulated.heldMinutes - timeline.heldMinutes,
          },
        };
      }
      return { evaluate, rail, squad, incumbent, observation };
    }

    return {
      observe: () => ({
        cycle: clock.cycle,
        links: links(),
        components: {
          metro: parts.metro.observe(),
          skirmish: parts.skirmish.observe(),
        },
      }),
      metrics: () => measured(parts, clock),
      renderState: () => ({
        links: links(),
        components: Object.fromEntries(
          Object.entries(parts).map(([key, part]) => [
            key,
            {
              config: children[key],
              time: part.time(),
              done: part.done(),
              metrics: part.metrics(),
              renderState: part.renderState(),
            },
          ]),
        ),
      }),
      tick: () => clock.cycle,
      time: () => clock.cycle,
      done: () => parts.metro.done() && parts.skirmish.done(),
      clearSolution() {
        for (const part of Object.values(parts)) part.clearSolution();
      },
      decisionDue(mode, last) {
        return (
          !last ||
          (!parts.metro.done() &&
            (parts.metro.decisionDue(mode, last.metro) ||
              (last.pressured !== pressured() &&
                clock.cycle - last.cycle >= 15)))
        );
      },
      decisionStamp: () => ({
        cycle: clock.cycle,
        pressured: pressured(),
        metro: parts.metro.decisionStamp(),
      }),
      createSearchTask(maxChange = Infinity) {
        const { evaluate, rail, squad } = taskContext(maxChange);
        return combineSearchTasks(
          { metro: rail, skirmish: squad },
          evaluate,
          objectiveSchema,
        );
      },
      createVectorTask(maxChange = Infinity) {
        const { evaluate, rail, incumbent, observation } =
          taskContext(maxChange);
        const scales = [
          Math.max(
            1,
            (config.metroHorizon / 10) * observation.scenario.stations.length,
          ),
          Math.max(
            1,
            pair.dynamic
              ? config.metroEditBudget
              : observation.scenario.resources.trackBudget,
          ),
          1,
          1,
        ];
        return combineVectorTasks(
          {
            metro: routeVectorTask(rail, observation, incumbent),
            skirmish: parts.skirmish.createVectorTask(maxChange, {
              useCurrent: true,
            }),
          },
          evaluate,
          objectiveSchema,
          scales,
        );
      },
      acceptSolution(candidate) {
        const staged = {
          metro: parts.metro.fork(),
          skirmish: parts.skirmish.fork(),
        };
        install(staged, candidate);
        parts = staged;
      },
      apply(action) {
        if (
          action?.type !== "component" ||
          !Object.hasOwn(parts, action.component)
        )
          throw new Error(
            "Fusion requires an action addressed to metro or skirmish",
          );
        const part = parts[action.component];
        if (part.done()) throw new Error("This component has finished");
        part.apply(action.action);
      },
      advance() {
        if (!this.done()) advance(parts, clock);
      },
    };
  },
};
