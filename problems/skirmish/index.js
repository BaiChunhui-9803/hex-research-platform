import {
  SCENARIOS,
  createScenario,
} from "../../engines/skirmish/shared/scenarios.js";
import {
  createBattle,
  issueCommand,
  battleMetrics,
} from "../../engines/skirmish/shared/battle.js";
import { stepMatch } from "../../engines/skirmish/shared/match.js";
import { observe } from "../../engines/skirmish/shared/observation.js";
import { policyById } from "../../engines/skirmish/policies/registry.js";
import { distance, neighbors, key } from "../../engines/skirmish/shared/hex.js";
import { walkable, terrainAt } from "../../engines/skirmish/shared/terrain.js";
import { UNIT_TYPES } from "../../engines/skirmish/shared/units.js";
import { occupied } from "../../engines/skirmish/policies/helpers.js";
import { integer, pick } from "../../core/random.js";
import { controllerVectorTask } from "./vector.js";
import { buildSquadScenario, squadDesignConfig, squadDesignFields } from "./scenario.js";
import { squadFeatureTable } from "./features.js";

const DEFAULT = {
  focus: true,
  kite: false,
  distanceWeight: 2,
  healthWeight: 0.06,
  threatWeight: 0.05,
  retreatHp: 0,
};
const BOUNDS = {
  distanceWeight: [0.2, 4],
  healthWeight: [0, 0.2],
  threatWeight: [0, 0.4],
  retreatHp: [0, 0.6],
};
function valid(solution) {
  return (
    solution &&
    typeof solution.focus === "boolean" &&
    typeof solution.kite === "boolean" &&
    Object.entries(BOUNDS).every(
      ([k, [min, max]]) =>
        Number.isFinite(solution[k]) &&
        solution[k] >= min &&
        solution[k] <= max,
    )
  );
}
/** Problem-specific policy encoding. Search methods never see units or these weights. */
function ordersFor(observation, solution) {
  if (!observation.own.length || !observation.enemies.length) return [];
  const rank = (enemy, unit = null) => {
    const d = unit
      ? distance(unit, enemy)
      : observation.own.reduce((s, u) => s + distance(u, enemy), 0) /
        observation.own.length;
    return (
      solution.distanceWeight * d +
      solution.healthWeight * enemy.hp -
      solution.threatWeight * UNIT_TYPES[enemy.type].damage
    );
  };
  const groupTarget = [...observation.enemies].sort(
    (a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id),
  )[0];
  const claimed = new Set(),
    orders = [];
  for (const unit of observation.own) {
    if (unit.move) continue;
    const target = solution.focus
      ? groupTarget
      : [...observation.enemies].sort(
          (a, b) => rank(a, unit) - rank(b, unit) || a.id.localeCompare(b.id),
        )[0];
    const nearest = Math.min(
      ...observation.enemies.map((e) => distance(unit, e)),
    );
    if (
      unit.cooldown > 1 &&
      (solution.kite || unit.hp / unit.maxHp < solution.retreatHp) &&
      nearest <= UNIT_TYPES[unit.type].range
    ) {
      const busy = occupied(observation, unit.id);
      const score = (cell) =>
        Math.min(...observation.enemies.map((e) => distance(cell, e))) -
        distance(cell, target) * 0.12 +
        (terrainAt(observation.map, cell).cover < 1 ? 0.25 : 0);
      const candidates = neighbors(unit)
        .filter(
          (c) =>
            walkable(observation.map, c) &&
            !busy.has(key(c)) &&
            !claimed.has(key(c)),
        )
        .sort((a, b) => score(b) - score(a) || key(a).localeCompare(key(b)));
      if (candidates.length && score(candidates[0]) > score(unit) + 0.1) {
        claimed.add(key(candidates[0]));
        orders.push({
          unitIds: [unit.id],
          type: "move",
          target: candidates[0],
        });
        continue;
      }
    }
    orders.push({ unitIds: [unit.id], type: "attack", targetId: target.id });
  }
  return orders;
}
function drive(state, team, solution) {
  if (state.tick % 5 === 0)
    for (const order of ordersFor(observe(state, team), solution))
      issueCommand(state, { ...order, team }, { source: "parameter-policy" });
  stepMatch(state, 1);
}
function measured(state, team) {
  const m = battleMetrics(state, team);
  return { ...m, win: Number(m.won), score: (m.won ? 1000 : 0) + m.hpMargin };
}
export const skirmish = {
  id: "skirmish",
  name: "Squad Tactics",
  shortName: "HEXFRONT",
  description: "Command a squad in two- or three-faction real-time encounters.",
  view: "/web/views/skirmish.js",
  timeUnit: "s",
  stepSize: 5,
  defaultScenario: "contact",
  scenarios: SCENARIOS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    tag: s.tag,
  })),
  featureTable(config) {
    return squadFeatureTable(config, buildSquadScenario(config));
  },
  metrics: [
    { id: "win", name: "Win", direction: "max", unit: "ratio" },
    { id: "hpMargin", name: "HP margin", direction: "max", unit: "HP" },
    { id: "hpRatio", name: "Surviving HP", direction: "max", unit: "ratio" },
    { id: "time", name: "Duration", direction: "context", unit: "s" },
    { id: "kills", name: "Kills", direction: "max", unit: "units" },
    { id: "orders", name: "Commands", direction: "min", unit: "orders" },
  ],
  settings(id) {
    return [
      {
        key: "horizon",
        name: "Episode duration (s)",
        type: "integer",
        min: 10,
        max: 90,
        default: 90,
      },
      {
        key: "opponent",
        name: "Opponent controller",
        choices: [
          { value: "focus", label: "Focus fire" },
          { value: "rush", label: "Attack-move" },
          { value: "kite", label: "Kite & focus" },
          { value: "random", label: "Random orders" },
        ],
        default: "focus",
      },
      {
        key: "team",
        name: "Controlled faction",
        choices: Object.keys(SCENARIOS.find((s) => s.id === id).forces).map(
          (value) => ({
            value,
            label: { blue: "Azure", orange: "Ember", violet: "Violet" }[value],
          }),
        ),
        default: "blue",
      },
      ...squadDesignFields(id),
    ];
  },
  capabilities(id) {
    if (!this.scenarios.some((s) => s.id === id))
      throw new Error("Unknown squad scenario");
    return {
      protocols: [
        "optimization/v1",
        "vector-optimization/v1",
        "squad-policy/v1",
      ],
      features: [
        "hex-grid",
        "unit-orders",
        "multi-agent",
        "unit-box-encoding",
        "pareto-objectives",
      ],
      encoding:
        "Controller-parameter vector; two real-valued keys are thresholded into Boolean switches.",
      objectiveSchema: [
        {
          id: "ownHpLoss",
          name: "Own HP loss fraction",
          direction: "min",
          unit: "ratio",
        },
        {
          id: "enemyHp",
          name: "Enemy HP remaining fraction",
          direction: "min",
          unit: "ratio",
        },
      ],
      searchMeaning:
        "Offline search for controller parameters using deterministic battle rollouts against the specified opponents; not open-loop action search.",
    };
  },
  validateConfig(input = {}) {
    const scenarioId = input.scenarioId ?? this.defaultScenario;
    this.capabilities(scenarioId);
    const opponent = input.opponent ?? "focus";
    if (!policyById(opponent)) throw new Error("Unknown opponent policy");
    const scenario = createScenario(scenarioId, 26),
      team = input.team ?? "blue";
    if (!scenario.teams.some((t) => t.id === team))
      throw new Error("Unknown controlled faction");
    return {
      scenarioId,
      seed: integer(input.seed, 26, 0, 9999999, "Seed"),
      horizon: integer(input.horizon, 90, 10, 90, "Battle duration"),
      team,
      opponent,
      ...squadDesignConfig(input, scenarioId),
    };
  },
  create(config, saved = null) {
    let state = saved?.state;
    if (!state) {
      const scenario = buildSquadScenario(config);
      state = createBattle(scenario, {
        controllers: Object.fromEntries(
          scenario.teams.map((t) => [
            t.id,
            t.id === config.team ? "human" : config.opponent,
          ]),
        ),
      });
    }
    let solution = saved?.solution ?? null;
    const ownMax = state.units
      .filter((unit) => unit.team === config.team)
      .reduce((sum, unit) => sum + unit.maxHp, 0);
    const enemyMax = state.units
      .filter((unit) => unit.team !== config.team)
      .reduce((sum, unit) => sum + unit.maxHp, 0);
    return {
      observe: () => observe(state, config.team),
      metrics: () => measured(state, config.team),
      recentEvents: () => state.events.values(),
      renderState: () => structuredClone(state),
      tick: () => state.tick,
      time: () => state.time,
      done: () => state.phase === "finished",
      health() {
        let ownHp = 0;
        let enemyHp = 0;
        for (const unit of state.units) {
          if (unit.team === config.team) ownHp += unit.hp;
          else enemyHp += unit.hp;
        }
        return { ownHp, enemyHp, ownMax, enemyMax, winner: state.winner };
      },
      maxTicks: () => state.maxTicks,
      currentController: () => structuredClone(solution),
      fork({ forecast = false } = {}) {
        const copy = structuredClone(state);
        if (forecast) {
          copy.record = false;
          copy.commandLog = [];
          copy.events = [];
        }
        return skirmish.create(config, {
          state: copy,
          solution: structuredClone(solution),
        });
      },
      livingCells() {
        return state.units.filter((unit) => unit.hp > 0)
          .map(({ q, r, team }) => ({ q, r, team }));
      },
      setFactionController(team, controller) {
        if (!Object.hasOwn(state.controllers, team) ||
            (controller !== "human" && !policyById(controller)))
          throw new Error("Invalid faction controller");
        state.controllers[team] = controller;
      },
      factionMetrics() {
        return Object.fromEntries(state.scenario.teams.map(({ id }) => [id, battleMetrics(state, id)]));
      },
      recoveryNeeds(area) {
        const byFaction = {};
        if (state.phase === "finished") return byFaction;
        for (const unit of state.units) {
          if (unit.hp <= 0 || unit.hp >= unit.maxHp || distance(unit, area) > area.radius) continue;
          byFaction[unit.team] = (byFaction[unit.team] ?? 0) + unit.maxHp - unit.hp;
        }
        return byFaction;
      },
      restoreHealth(points, area = null, faction = config.team) {
        if (state.phase === "finished" || points <= 0) return 0;
        const wounded = state.units
          .filter((u) => u.team === faction && u.hp > 0 && u.hp < u.maxHp &&
            (!area || distance(u, area) <= area.radius))
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id));
        let remaining = points;
        for (const unit of wounded) {
          const increase = Math.min(remaining, unit.maxHp - unit.hp);
          unit.hp += increase;
          remaining -= increase;
          if (remaining <= 0) break;
        }
        return points - remaining;
      },
      clearSolution() {
        solution = null;
      },
      decisionStamp: () => ({ tick: state.tick }),
      decisionDue: (mode, last) =>
        mode === "search"
          ? !last
          : state.tick % 5 === 0 && last?.tick !== state.tick,
      createSearchTask() {
        const initialState = structuredClone(state);
        return {
          protocol: "optimization/v1",
          temperature: 90,
          objectiveSchema: skirmish.capabilities(config.scenarioId)
            .objectiveSchema,
          initial: () => ({ ...DEFAULT }),
          sample(rng) {
            return {
              focus: rng() < 0.7,
              kite: rng() < 0.5,
              ...Object.fromEntries(
                Object.entries(BOUNDS).map(([k, [min, max]]) => [
                  k,
                  min + rng() * (max - min),
                ]),
              ),
            };
          },
          mutate(candidate, rng) {
            const field = pick(["focus", "kite", ...Object.keys(BOUNDS)], rng);
            if (field === "focus" || field === "kite")
              candidate[field] = !candidate[field];
            else {
              const [min, max] = BOUNDS[field];
              candidate[field] = Math.max(
                min,
                Math.min(
                  max,
                  candidate[field] + (rng() - 0.5) * (max - min) * 0.7,
                ),
              );
            }
            return candidate;
          },
          evaluate(candidate) {
            if (!valid(candidate)) return { valid: false, score: -Infinity };
            const simulated = structuredClone(initialState);
            while (simulated.phase !== "finished")
              drive(simulated, config.team, candidate);
            const result = measured(simulated, config.team);
            return {
              valid: true,
              ...result,
              objectives: [
                1 - result.hpRatio,
                (result.hp - result.hpMargin) / Math.max(1, enemyMax),
              ],
            };
          },
        };
      },
      createVectorTask(_maxChange, { useCurrent = false } = {}) {
        const task = this.createSearchTask();
        if (useCurrent && solution) task.initial = () => structuredClone(solution);
        return controllerVectorTask(task, BOUNDS);
      },
      acceptSolution(candidate) {
        if (!valid(candidate)) throw new Error("Invalid controller parameters");
        solution = structuredClone(candidate);
      },
      apply(action) {
        if (
          action?.type !== "commands" ||
          !Array.isArray(action.orders) ||
          action.orders.length > 100
        )
          throw new Error("Squad action requires up to 100 orders");
        const candidate = structuredClone(state);
        for (const order of action.orders)
          issueCommand(
            candidate,
            { ...order, team: config.team },
            { source: "platform" },
          );
        state = candidate;
        solution = null;
      },
      advance() {
        if (solution) drive(state, config.team, solution);
        else stepMatch(state, 1);
      },
    };
  },
};
