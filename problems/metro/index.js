import {
  SCENARIOS,
  createScenario,
  scenarioAt,
} from "../../engines/metro/shared/scenarios.js";
import {
  createState,
  applyPlan,
  step,
  metrics,
  demandSchedule,
} from "../../engines/metro/shared/simulation.js";
import {
  createProblem,
  evaluatePlan,
  serviceScore,
  OBJECTIVES,
} from "../../engines/metro/shared/problem.js";
import { compilePlan } from "../../engines/metro/shared/network.js";
import { planChange } from "../../engines/metro/shared/edit-cost.js";
import { greedyPlan } from "../../engines/metro/algorithms/greedy.js";
import randomPlan from "../../engines/metro/algorithms/random.js";
import { mutate } from "../../engines/metro/algorithms/operators.js";
import {
  observeState,
  extensionPlan,
} from "../../engines/metro/algorithms/adaptive.js";
import { integer } from "../../core/random.js";
import { routeVectorTask } from "./vector.js";

function forecastTransit(state, visible, seed) {
  const simulated = structuredClone(state);
  const lookahead = Math.min(30, state.horizon - state.time);
  simulated.scenario = visible;
  simulated.stations = Object.fromEntries(
    Object.entries(simulated.stations).filter(([, station]) => station.active),
  );
  simulated.schedule = demandSchedule(
    visible,
    lookahead,
    (seed ^ state.time ^ 0x6fe21d) >>> 0,
  ).map((event) => ({ ...event, t: event.t + state.time }));
  simulated.eventIndex = 0;
  simulated.horizon = state.time + lookahead;
  return simulated;
}

export const metro = {
  id: "metro",
  name: "Metro Network",
  shortName: "HEXLINE",
  description:
    "Connect stations, serve passengers and adapt to a growing city.",
  view: "/web/views/metro.js",
  timeUnit: "min",
  stepSize: 1,
  defaultScenario: "lumen",
  scenarios: SCENARIOS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.subtitle,
    dynamic: Boolean(s.dynamic),
  })),
  metrics: [
    { id: "score", name: "Service score", direction: "max", unit: "points" },
    {
      id: "completion",
      name: "Delivered share",
      direction: "max",
      unit: "ratio",
    },
    {
      id: "delivered",
      name: "Delivered",
      direction: "max",
      unit: "passengers",
    },
    {
      id: "averageQueue",
      name: "Average queue",
      direction: "min",
      unit: "passengers",
    },
    { id: "editUnits", name: "Edit effort", direction: "min", unit: "units" },
    { id: "track", name: "Track used", direction: "min", unit: "hexes" },
  ],
  settings() {
    return [
      {
        key: "horizon",
        name: "Episode duration (min)",
        choices: [60, 120, 180, 240].map((value) => ({
          value,
          label: String(value),
        })),
        default: 180,
      },
      {
        key: "objective",
        name: "Objective",
        choices: [
          { value: "service", label: "Service first" },
          { value: "balanced", label: "Balanced" },
          { value: "effort", label: "Low disruption" },
        ],
        default: "balanced",
      },
      {
        key: "editBudget",
        name: "Edit budget",
        type: "integer",
        min: 0,
        max: 300,
        default: 60,
        feature: "dynamic-stations",
      },
    ];
  },
  capabilities(id) {
    const scenario = this.scenarios.find((s) => s.id === id);
    if (!scenario) throw new Error("Unknown metro scenario");
    return {
      protocols: [
        "optimization/v1",
        "vector-optimization/v1",
        ...(scenario.dynamic ? ["metro-policy/v1"] : []),
      ],
      features: [
        "hex-grid",
        "manual-plan",
        "unit-box-encoding",
        "pareto-objectives",
        ...(scenario.dynamic ? ["dynamic-stations"] : []),
      ],
      searchMeaning: scenario.dynamic
        ? "Rolling 30-minute forecast; future stations and realized demand are unavailable."
        : "Offline route optimization with a fixed, known demand schedule.",
      encoding:
        "Native route plans or active-station random keys; route membership and order are discontinuous.",
      objectiveSchema: scenario.dynamic
        ? [
            {
              id: "forecastDelivered",
              name: "Forecast delivered (negative)",
              direction: "min",
              unit: "passengers",
            },
            {
              id: "editEffort",
              name: "Decision edit effort",
              direction: "min",
              unit: "units",
            },
          ]
        : [
            {
              id: "delivered",
              name: "Delivered (negative)",
              direction: "min",
              unit: "passengers",
            },
            {
              id: "track",
              name: "Track used",
              direction: "min",
              unit: "hexes",
            },
          ],
    };
  },
  validateConfig(input = {}) {
    const scenarioId = input.scenarioId ?? this.defaultScenario;
    this.capabilities(scenarioId);
    const horizon = integer(input.horizon, 180, 60, 240, "Metro horizon");
    if (![60, 120, 180, 240].includes(horizon))
      throw new Error("Metro horizon must be 60, 120, 180 or 240 minutes");
    const objective = input.objective ?? "balanced";
    if (!Object.hasOwn(OBJECTIVES, objective))
      throw new Error("Unknown metro objective");
    return {
      scenarioId,
      seed: integer(input.seed, 26, 0, 9999999, "Seed"),
      horizon,
      objective,
      editBudget: integer(input.editBudget, 60, 0, 300, "Edit budget"),
    };
  },
  create(config, initialState = null) {
    const scenario = initialState?.scenario ?? createScenario(config.scenarioId, config.seed);
    let state = initialState ?? createState(
      scenario,
      greedyPlan({ scenario: scenarioAt(scenario, 0) }),
      {
        seed: config.seed,
        horizon: config.horizon,
        editBudget: scenario.dynamic ? config.editBudget : null,
      },
    );
    const measured = () => {
      const m = metrics(state);
      return {
        ...m,
        score:
          Math.round(
            (serviceScore(m) -
              OBJECTIVES[config.objective].editWeight * m.editUnits) *
              100,
          ) / 100,
      };
    };
    const count = () => metrics(state).activeStations;
    function task(maxChange = Infinity) {
      const observation = observeState(state),
        visible = observation.scenario;
      const offline = !scenario.dynamic && state.time === 0;
      const model = offline
        ? createProblem(visible, { seed: config.seed, horizon: config.horizon })
        : null;
      const evaluate = (plan) => {
        if (offline) {
          const result = evaluatePlan(model, plan);
          return {
            ...result,
            objectives: result.valid ? [-result.delivered, result.track] : null,
          };
        }
        const change = planChange(state.plan, plan);
        if (
          change.editUnits > observation.remainingEditBudget ||
          change.editUnits > maxChange ||
          !compilePlan(visible, plan).valid
        )
          return { valid: false, score: -Infinity };
        const simulated = forecastTransit(state, visible, config.seed);
        const lookahead = simulated.horizon - state.time;
        applyPlan(simulated, plan, {
          charge: state.time > 0,
          reason: "Forecast candidate",
        });
        step(simulated, lookahead, { stopOnFailure: false });
        const projected = metrics(simulated);
        projected.delivered -= state.delivered;
        projected.averageQueue =
          (simulated.queueExposure - state.queueExposure) /
          Math.max(1, lookahead);
        projected.overflow -= state.overflowExposure;
        return {
          valid: true,
          objectives: [-projected.delivered, change.editUnits],
          metrics: { ...projected, decisionEditUnits: change.editUnits },
          score:
            serviceScore(projected) -
            OBJECTIVES[config.objective].editWeight * change.editUnits,
        };
      };
      return {
        protocol: "optimization/v1",
        temperature: 65,
        objectiveSchema: metro.capabilities(config.scenarioId).objectiveSchema,
        initial: () =>
          offline
            ? greedyPlan({ scenario: visible })
            : extensionPlan(observation, maxChange),
        sample: (rng) =>
          randomPlan.solve({ scenario: visible }, {}, { random: rng }),
        mutate: (plan, rng) => mutate(plan, { scenario: visible }, rng),
        evaluate,
      };
    }
    return {
      observe: () => observeState(state),
      metrics: measured,
      renderState: () => structuredClone(state),
      tick: () => state.time,
      time: () => state.time,
      done: () => state.finished,
      currentPlan: () => structuredClone(state.plan),
      delivered: () => state.delivered,
      fork({ forecast = false } = {}) {
        const useForecast =
          forecast && !state.finished && (scenario.dynamic || state.time > 0);
        return metro.create(
          config,
          useForecast
            ? forecastTransit(state, observeState(state).scenario, config.seed)
            : structuredClone(state),
        );
      },
      clearSolution() {},
      opened: () => scenario.stations.some((s) => s.opensAt === state.time),
      decisionStamp: () => ({ tick: state.time, stations: count() }),
      decisionDue(mode, last) {
        if (!last) return true;
        return (
          scenario.dynamic &&
          last.tick !== state.time &&
          (last.stations !== count() || state.time % 30 === 0)
        );
      },
      createSearchTask: task,
      createVectorTask(maxChange) {
        return routeVectorTask(task(maxChange), observeState(state));
      },
      acceptSolution(plan) {
        this.apply({ type: "set-plan", plan });
      },
      apply(action) {
        if (action?.type !== "set-plan")
          throw new Error("Metro requires a set-plan action");
        const candidate = structuredClone(state);
        applyPlan(candidate, action.plan, { reason: "Platform decision" });
        state = candidate;
      },
      advance({ holdTrains = false } = {}) {
        const trains = state.trains;
        // A hold freezes train movement and boarding, while the usual demand
        // clock, station openings, queues and overload accounting advance.
        if (holdTrains) state.trains = [];
        try {
          step(state, 1, { stopOnFailure: false });
        } finally {
          if (holdTrains) state.trains = trains;
        }
      },
    };
  },
};
