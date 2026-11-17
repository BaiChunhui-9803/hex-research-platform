import { distance, key, point } from "./hex.js";
import { nearby, walkable, terrainAt, lineOfSight } from "./terrain.js";
import { findPath } from "./pathfinding.js";
import { UNIT_TYPES, TICK_SECONDS } from "./units.js";
import { validateScenario } from "./scenarios.js";

const ORDER_TYPES = new Set(["move", "attackMove", "attack", "hold"]);
const alive = (unit) => unit.hp > 0;
const sameOrder = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createBattle(
  scenario,
  { record = true, controllers = {} } = {},
) {
  validateScenario(scenario);
  const state = {
    version: "hex-skirmish-v1",
    scenario: structuredClone(scenario),
    tick: 0,
    time: 0,
    phase: "ready",
    winner: null,
    endReason: null,
    units: scenario.units.map((unit) => ({
      ...unit,
      hp: UNIT_TYPES[unit.type].hp,
      maxHp: UNIT_TYPES[unit.type].hp,
      cooldown: 0,
      move: null,
      order: { type: "hold" },
      targetId: null,
      facing: unit.team === "orange" ? Math.PI : 0,
      kills: 0,
      damageDealt: 0,
      distanceMoved: 0,
      orders: 0,
    })),
    controllers: {},
    randomStates: {},
    nextDecision: {},
    record,
    events: [],
    eventSeq: 0,
    commandLog: [],
    maxTicks: Math.round(scenario.duration / TICK_SECONDS),
  };
  for (const team of scenario.teams) {
    state.controllers[team.id] =
      controllers[team.id] ?? (team.id === "blue" ? "human" : "focus");
    state.randomStates[team.id] =
      (scenario.seed ^
        team.id.split("").reduce((n, c) => n * 31 + c.charCodeAt(0), 7)) >>>
      0;
    state.nextDecision[team.id] = 0;
  }
  return state;
}
export function addEvent(state, type, data = {}) {
  const event = { id: ++state.eventSeq, type, time: state.time, ...data };
  if (state.record) {
    state.events.push(event);
    if (state.events.length > 100) state.events.shift();
  }
  return event;
}
export function living(state, team = null) {
  return state.units.filter(
    (unit) => alive(unit) && (!team || unit.team === team),
  );
}
export function currentPosition(unit, alpha = 0) {
  if (!unit.move) return { q: unit.q, r: unit.r };
  const fraction = Math.min(
    1,
    (unit.move.elapsed + alpha) / unit.move.duration,
  );
  return {
    q: unit.move.from.q + (unit.move.to.q - unit.move.from.q) * fraction,
    r: unit.move.from.r + (unit.move.to.r - unit.move.from.r) * fraction,
  };
}
export function attackRange(state, attacker, target) {
  return (
    UNIT_TYPES[attacker.type].range +
    (terrainAt(state.scenario.map, attacker).height >
    terrainAt(state.scenario.map, target).height
      ? 1
      : 0)
  );
}
export function inFiringRange(state, attacker, target) {
  return (
    alive(attacker) &&
    alive(target) &&
    attacker.team !== target.team &&
    distance(attacker, target) <= attackRange(state, attacker, target) &&
    lineOfSight(state.scenario.map, attacker, target)
  );
}
export function damageFor(state, attacker, target) {
  return Math.max(
    1,
    Math.round(
      (UNIT_TYPES[attacker.type].damage - UNIT_TYPES[target.type].armor) *
        terrainAt(state.scenario.map, target).cover *
        100,
    ) / 100,
  );
}
export function occupiedCells(state, ignore = null) {
  const occupied = new Set();
  for (const unit of living(state))
    if (unit.id !== ignore) {
      occupied.add(key(unit));
      if (unit.move) occupied.add(key(unit.move.to));
    }
  return occupied;
}

/** Orders are transactional: validate all owners and destinations before applying. */
export function issueCommand(
  state,
  { team, unitIds, type, target = null, targetId = null },
  { source = "player" } = {},
) {
  if (state.phase === "finished") return 0;
  if (!ORDER_TYPES.has(type)) throw new Error("Unknown command");
  if (!Array.isArray(unitIds) || !unitIds.length)
    throw new Error("Select at least one unit");
  const units = [...new Set(unitIds)].map((id) =>
    state.units.find((unit) => unit.id === id),
  );
  if (units.some((unit) => !unit || !alive(unit) || unit.team !== team))
    throw new Error("You can command only your living units");
  const enemy =
    type === "attack" ? state.units.find((unit) => unit.id === targetId) : null;
  if (type === "attack" && (!enemy || !alive(enemy) || enemy.team === team))
    throw new Error("Choose a living enemy target");
  if (
    ["move", "attackMove"].includes(type) &&
    (!target ||
      !Number.isInteger(target.q) ||
      !Number.isInteger(target.r) ||
      !walkable(state.scenario.map, target))
  )
    throw new Error("Choose a traversable tile");
  const orders = [];
  const selectedIds = new Set(units.map((unit) => unit.id));
  const busy = new Set(
    living(state)
      .filter((unit) => !selectedIds.has(unit.id))
      .flatMap((unit) => [
        key(unit),
        ...(unit.move ? [key(unit.move.to)] : []),
      ]),
  );
  const destinations = target
    ? nearby(state.scenario.map, target).filter((cell) => !busy.has(key(cell)))
    : [];
  for (const unit of units.sort((a, b) => a.id.localeCompare(b.id))) {
    let order;
    if (type === "hold") order = { type };
    else if (type === "attack")
      order = {
        type,
        targetId: enemy.id,
        lastPosition: { q: enemy.q, r: enemy.r },
      };
    else {
      const available = destinations.filter(
        (cell) =>
          !orders.some(
            (other) => other.order.goal && key(other.order.goal) === key(cell),
          ),
      );
      available.sort(
        (a, b) =>
          distance(a, target) * 3 +
            distance(unit, a) * 0.2 -
            (distance(b, target) * 3 + distance(unit, b) * 0.2) ||
          key(a).localeCompare(key(b)),
      );
      if (!available.length) throw new Error("No formation space is available");
      order = { type, goal: available[0] };
    }
    orders.push({ unit, order });
  }
  let changed = 0;
  for (const { unit, order } of orders) {
    if (sameOrder(unit.order, order)) continue;
    unit.order = structuredClone(order);
    unit.targetId = null;
    unit.orders++;
    changed++;
  }
  if (changed && state.record) {
    state.commandLog.push({
      tick: state.tick,
      time: state.time,
      team,
      unitIds: units.map((unit) => unit.id),
      type,
      target,
      targetId,
      source,
    });
    if (state.commandLog.length > 5000) state.commandLog.shift();
  }
  if (changed && source === "player")
    addEvent(state, "command", { team, count: changed, command: type });
  return changed;
}

function nearestTarget(state, unit, onlyShootable = false) {
  return (
    living(state)
      .filter(
        (enemy) =>
          enemy.team !== unit.team &&
          (onlyShootable
            ? inFiringRange(state, unit, enemy)
            : distance(unit, enemy) <=
              Math.max(6, UNIT_TYPES[unit.type].range + 1)),
      )
      .sort(
        (a, b) =>
          distance(unit, a) - distance(unit, b) ||
          a.hp - b.hp ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
function intentFor(state, unit) {
  const order = unit.order;
  let target = null;
  if (order.type === "attack") {
    target = state.units.find(
      (enemy) => enemy.id === order.targetId && alive(enemy),
    );
    if (!target) {
      unit.order = { type: "attackMove", goal: order.lastPosition };
      return intentFor(state, unit);
    }
  } else if (order.type === "hold") target = nearestTarget(state, unit, true);
  else if (order.type === "attackMove") target = nearestTarget(state, unit);
  if (target) {
    unit.targetId = target.id;
    const a = point(unit),
      b = point(target);
    unit.facing = Math.atan2(b.y - a.y, b.x - a.x);
    return inFiringRange(state, unit, target)
      ? { target }
      : { goal: target, range: UNIT_TYPES[unit.type].range, shooting: true };
  }
  unit.targetId = null;
  if (order.goal && distance(unit, order.goal) > 0)
    return { goal: order.goal, range: 0, shooting: false };
  if (order.goal) unit.order = { type: "hold" };
  return {};
}
function settle(state) {
  const teams = state.scenario.teams.map((team) => team.id),
    surviving = teams.filter((team) => living(state, team).length);
  if (surviving.length <= 1) {
    state.phase = "finished";
    state.winner = surviving[0] ?? null;
    state.endReason = "elimination";
  } else if (state.tick >= state.maxTicks) {
    const health = teams
      .map((team) => ({
        team,
        hp: living(state, team).reduce((sum, unit) => sum + unit.hp, 0),
      }))
      .sort((a, b) => b.hp - a.hp);
    state.phase = "finished";
    state.winner =
      Math.abs(health[0].hp - health[1].hp) < 1e-6 ? null : health[0].team;
    state.endReason = "time limit";
  }
  if (state.phase === "finished")
    addEvent(state, "finished", {
      winner: state.winner,
      reason: state.endReason,
    });
}

/** One engine tick is exactly 100ms. Damage is resolved simultaneously. */
export function stepBattle(state, steps = 1) {
  if (!Number.isInteger(steps) || steps < 0)
    throw new Error("Steps must be a non-negative integer");
  for (let i = 0; i < steps && state.phase !== "finished"; i++) {
    state.phase = "running";
    state.tick++;
    state.time = Math.round(state.tick * TICK_SECONDS * 10) / 10;
    for (const unit of living(state)) {
      unit.cooldown = Math.max(0, unit.cooldown - 1);
      if (unit.move) {
        unit.move.elapsed++;
        if (unit.move.elapsed >= unit.move.duration) {
          unit.q = unit.move.to.q;
          unit.r = unit.move.to.r;
          unit.distanceMoved++;
          unit.move = null;
        }
      }
    }
    const shots = [],
      intents = [];
    for (const unit of living(state))
      if (!unit.move) {
        const intent = intentFor(state, unit);
        if (intent.target && unit.cooldown === 0) {
          unit.cooldown = UNIT_TYPES[unit.type].cooldown;
          const hit = {
            attacker: unit,
            target: intent.target,
            damage: damageFor(state, unit, intent.target),
          };
          shots.push(hit);
          addEvent(state, "shot", {
            attackerId: unit.id,
            targetId: intent.target.id,
            team: unit.team,
            from: currentPosition(unit),
            to: currentPosition(intent.target),
            damage: hit.damage,
            weapon: unit.type,
          });
        } else if (intent.goal) intents.push({ unit, ...intent });
      }
    // Reserve both ends of in-flight moves. Rotating priority avoids one fixed team advantage.
    const reserved = occupiedCells(state);
    intents.sort((a, b) => a.unit.id.localeCompare(b.unit.id));
    const shift = state.tick % Math.max(1, intents.length);
    const ordered = [...intents.slice(shift), ...intents.slice(0, shift)];
    for (const { unit, goal, range, shooting } of ordered) {
      const occupied = new Set(reserved);
      occupied.delete(key(unit));
      const path = findPath(state.scenario.map, unit, goal, {
        occupied,
        range,
        shooting,
      });
      if (!path || path.length < 2) continue;
      const next = path[1];
      if (reserved.has(key(next))) continue;
      const a = point(unit),
        b = point(next);
      unit.facing = Math.atan2(b.y - a.y, b.x - a.x);
      unit.move = {
        from: { q: unit.q, r: unit.r },
        to: next,
        elapsed: 0,
        duration: Math.max(
          1,
          Math.ceil(
            terrainAt(state.scenario.map, next).moveCost /
              (UNIT_TYPES[unit.type].speed * TICK_SECONDS),
          ),
        ),
      };
      reserved.add(key(next));
    }
    const targets = new Map();
    for (const hit of shots) {
      if (!targets.has(hit.target.id)) targets.set(hit.target.id, []);
      targets.get(hit.target.id).push(hit);
    }
    for (const hits of targets.values()) {
      const target = hits[0].target,
        total = hits.reduce((sum, hit) => sum + hit.damage, 0),
        effective = Math.min(target.hp, total);
      for (const hit of hits)
        hit.attacker.damageDealt += (effective * hit.damage) / total;
      target.hp = Math.max(0, Math.round((target.hp - total) * 100) / 100);
      if (!target.hp) {
        const killer = [...hits].sort(
          (a, b) =>
            b.damage - a.damage || a.attacker.id.localeCompare(b.attacker.id),
        )[0].attacker;
        killer.kills++;
        target.diedAt = state.time;
        target.move = null;
        addEvent(state, "death", {
          unitId: target.id,
          team: target.team,
          killerId: killer.id,
          killerTeam: killer.team,
          at: { q: target.q, r: target.r },
        });
      }
    }
    settle(state);
  }
  return state;
}

export function battleMetrics(state, team = "blue") {
  const own = state.units.filter((unit) => unit.team === team),
    enemies = state.units.filter((unit) => unit.team !== team);
  const hp = own.reduce((sum, unit) => sum + unit.hp, 0),
    enemyHp = enemies.reduce((sum, unit) => sum + unit.hp, 0);
  return {
    team,
    won: state.phase === "finished" && state.winner === team,
    draw: state.phase === "finished" && state.winner === null,
    phase: state.phase,
    winner: state.winner,
    time: state.time,
    survivors: own.filter(alive).length,
    initialUnits: own.length,
    enemySurvivors: enemies.filter(alive).length,
    hp: Math.round(hp * 100) / 100,
    hpRatio:
      hp /
      Math.max(
        1,
        own.reduce((sum, unit) => sum + unit.maxHp, 0),
      ),
    hpMargin: Math.round((hp - enemyHp) * 100) / 100,
    kills: own.reduce((sum, unit) => sum + unit.kills, 0),
    damageDealt:
      Math.round(own.reduce((sum, unit) => sum + unit.damageDealt, 0) * 100) /
      100,
    distanceMoved: own.reduce((sum, unit) => sum + unit.distanceMoved, 0),
    orders: own.reduce((sum, unit) => sum + unit.orders, 0),
  };
}
