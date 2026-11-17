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
import {
  advanceJoint,
  couplingProfiles,
  newTimeline,
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
  return {
    metro: metro.validateConfig({
      scenarioId: pair.components.metro,
      seed: input.seed,
      horizon: input.metroHorizon,
      objective: input.metroObjective,
      editBudget: input.metroEditBudget,
    }),
    skirmish: skirmish.validateConfig({
      scenarioId: pair.components.skirmish,
      seed: input.seed,
      horizon: input.skirmishHorizon,
      opponent: input.skirmishOpponent,
      team: input.skirmishTeam,
    }),
  };
}

function memberSettings(problem, pair, label) {
  return problem.settings(pair.components[problem.id]).map((setting) => ({
    ...setting,
    key: problem.id + setting.key[0].toUpperCase() + setting.key.slice(1),
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

  settings(id) {
    const pair = getPair(id);
    return [
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
    const coupling = input.coupling ?? "both";
    if (!Object.hasOwn(couplingProfiles, coupling))
      throw new Error("Unknown coupling profile");
    const children = splitConfig(input, pair);
    return {
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
      metroHorizon: children.metro.horizon,
      metroObjective: children.metro.objective,
      metroEditBudget: children.metro.editBudget,
      skirmishHorizon: children.skirmish.horizon,
      skirmishOpponent: children.skirmish.opponent,
      skirmishTeam: children.skirmish.team,
    };
  },

  create(config) {
    const pair = getPair(config.scenarioId);
    const children = splitConfig(config, pair);
    const profile = couplingProfiles[config.coupling];
    const objectiveSchema = this.capabilities(pair.id).objectiveSchema;
    let parts = {
      metro: metro.create(children.metro),
      skirmish: skirmish.create(children.skirmish),
    };
    const clock = newTimeline();
    const { ownMax, enemyMax } = parts.skirmish.health();
    const weight = config.metroWeight / 100;
    const jointScore = (rail, squad) =>
      100 *
      (weight * normalize(rail.score, 10 * config.metroHorizon) +
        (1 - weight) * normalize(squad.score, 1000 + ownMax + enemyMax));
    const pressured = () =>
      profile.holds && underPressure(parts.skirmish, config.skirmishTeam);
    const links = () => ({
      mode: config.coupling,
      supplyEnabled: profile.supply,
      holdsEnabled: profile.holds,
      pressured: pressured(),
      prepRemaining: Math.max(0, config.prepMinutes - clock.cycle),
      ...clock,
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
      };
    };

    function taskContext(maxChange) {
      const rail = parts.metro.createSearchTask(maxChange);
      const squad = parts.skirmish.createSearchTask();
      const incumbent = parts.metro.currentPlan();
      const controller = parts.skirmish.currentController();
      const transit = parts.metro.fork({ forecast: true });
      const battle = parts.skirmish.fork({ forecast: true });
      const timeline = { ...clock };
      const observation = parts.metro.observe();
      const originalDelivered = parts.metro.delivered();
      if (controller) squad.initial = () => structuredClone(controller);
      rail.initial = () => structuredClone(incumbent);
      function evaluate(candidate) {
        const future = { metro: transit.fork(), skirmish: battle.fork() };
        const simulated = { ...timeline };
        let editUnits;
        try {
          install(future, candidate);
          editUnits = planChange(incumbent, candidate.metro).editUnits;
          if (editUnits > maxChange) return { valid: false, score: -Infinity };
        } catch {
          return { valid: false, score: -Infinity };
        }
        while (!future.metro.done()) advanceJoint(future, simulated, config);
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
        if (!this.done()) advanceJoint(parts, clock, config);
      },
    };
  },
};
