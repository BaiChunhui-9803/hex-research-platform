import { battleMetrics, createBattle } from "../../engines/skirmish/shared/battle.js";
import { stepMatch } from "../../engines/skirmish/shared/match.js";
import { createScenario } from "../../engines/skirmish/shared/scenarios.js";
import { TICK_SECONDS, UNIT_TYPES } from "../../engines/skirmish/shared/units.js";
import { policyById } from "../../engines/skirmish/policies/registry.js";

export function generateLegacyTrace(config, methodId) {
  const scenario = createScenario(config.scenarioId, config.seed);
  scenario.duration = config.horizon;
  const policy = methodId.replace(/^squad\./, "");
  if (!policyById(policy)) throw new Error("Choose a native squad policy for this archive.");
  const controllers = Object.fromEntries(scenario.teams.map(({ id }) => [
    id, id === config.team ? policy : config.opponent,
  ]));
  const state = createBattle(scenario, { controllers });
  const snapshot = () => state.units.map(({ q, r, hp, move, facing, diedAt }) => [
    q, r, hp, move ? [move.to.q, move.to.r, move.elapsed, move.duration] : null,
    facing, diedAt ?? null,
  ]);
  const frames = [snapshot()], events = [];
  let cursor = 0;
  while (state.phase !== "finished") {
    stepMatch(state);
    frames.push(snapshot());
    for (const event of state.events) if (event.id > cursor) {
      events.push(event);
      cursor = event.id;
    }
  }
  return {
    scenario, controllers, tickSeconds: TICK_SECONDS, frames, events, commands: state.commandLog,
    metrics: Object.fromEntries(scenario.teams.map(({ id }) => [id, battleMetrics(state, id)])),
    winner: state.winner, time: state.time,
  };
}

export function legacyReplay(trace, team) {
  const { units } = trace.scenario;
  const step = trace.tickSeconds;
  const max = trace.frames.length - 1;
  const own = (index) => units[index].team === team;
  const maxHp = (index) => (trace.scenario.unitTypes ?? UNIT_TYPES)[units[index].type].hp;
  const maximum = units.reduce((total, _, index) => total + (own(index) ? maxHp(index) : 0), 0);
  const timeline = trace.frames.map((frame) => {
    let hp = 0, enemy = 0;
    frame.forEach((unit, i) => {
      if (own(i)) hp += unit[2];
      else enemy += unit[2];
    });
    return { survival: hp / Math.max(1, maximum), hpMargin: hp - enemy };
  });
  return {
    max, timeline, unit: "s", step,
    events: trace.events.filter(({ type }) => type === "death").map((event) => ({
      tick: Math.round(event.time / step),
      label: event.killerId ? `${event.killerId} eliminated ${event.unitId}` : `${event.unitId} eliminated`,
    })),
    view(tick) {
      const time = Math.round(tick * step * 1000) / 1000;
      const state = trace.frames[tick].map(([q, r, hp, move, facing, diedAt], index) => ({
        ...units[index], q, r, hp, maxHp: maxHp(index), facing, diedAt,
        move: move ? { from: { q, r }, to: { q: move[0], r: move[1] }, elapsed: move[2], duration: move[3] } : null,
      }));
      return {
        problemId: "skirmish", replay: true, tick, time, timeUnit: "s", done: tick === max,
        config: { team },
        renderState: {
          scenario: trace.scenario, units: state, tick, time, winner: tick === max ? trace.winner : null,
          phase: tick === max ? "finished" : "recorded",
          events: trace.events.filter((event) => event.time <= time && event.time >= time - 0.6),
        },
        observation: { own: state.filter((unit) => unit.team === team && unit.hp > 0) },
      };
    },
  };
}
