import { compileFeatureRules, rankRuleCandidates, SUPPLY_OPERATORS } from "../../core/rule-composition.js";
import { metro as railProblem } from "../metro/index.js";
import { skirmish as squadProblem } from "../skirmish/index.js";
import { createSharedParts } from "./shared-map.js";
import { createRailDraft, draftTasks } from "./rail-draft.js";
import { SUPPORT_CAP } from "./rules.js";
import { allocateStationSupply } from "./supply-allocation.js";

const round = (value) => Math.round(value * 10000) / 10000;
const namespace = (name, values) =>
  Object.fromEntries(Object.entries(values).map(([id, value]) => [`${name}.${id}`, value]));
const mean = (values) => values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);

export function featureTables(children) {
  return [railProblem.featureTable(children.metro), squadProblem.featureTable(children.skirmish)];
}

export function createFeatureFusion(config, children, program, firstSeat = config.seed % program.factions.length) {
  const { parts: { metro, skirmish }, layout, geometry, capabilities } = createSharedParts(children, config);
  if (!capabilities.viableTrackPlan || !capabilities.stationArrivals || !capabilities.localHealing ||
      !SUPPLY_OPERATORS.some(({ id }) => id === program.stock.allocation) ||
      program.trackTopology !== children.metro.trackTopology || program.phases[1].tracks !== "locked" ||
      program.phases[1].clock !== "rail-minute-with-battle-ticks")
    throw new Error("The assembled environment cannot install the compiled program");
  const { factions } = program;
  const draft = createRailDraft(metro, geometry, program, firstSeat);
  for (const faction of factions) skirmish.setFactionController(faction, children.skirmish.opponent);
  const stationStocks = {};
  const recovered = Object.fromEntries(factions.map((team) => [team, 0]));
  const events = [];
  const supplyEnabled = config.coupling !== "none" && config.supportPerPassenger > 0 && config.supplyCap !== 0;
  const cap = config.supplyCap ?? SUPPORT_CAP;
  const radius = config.stationRadius || 3;
  let tick = 0, produced = 0, used = 0, stock = 0, discarded = 0, contested = 0;

  function log(event) {
    events.push({ ...event, tick: tick + 1 });
  }

  function distribute() {
    for (const station of Object.values(stationStocks)) {
      const area = { ...station, radius };
      const needs = skirmish.recoveryNeeds(area);
      const shares = allocateStationSupply(needs, station.stock, program.stock.allocation);
      if (Object.keys(shares).length > 1) contested++;
      let allocated = 0;
      const recipients = [];
      for (const faction of factions) {
        const amount = skirmish.restoreHealth(shares[faction] ?? 0, area, faction);
        allocated += amount;
        recovered[faction] += amount;
        if (amount > 0) recipients.push(`${faction} +${round(amount)} HP`);
      }
      if (allocated > 0) log({ type: "public-recovery", label: `${station.id} shared supply · ${recipients.join(" · ")}` });
      station.stock -= allocated;
      stock -= allocated;
      if (station.stock < 1e-9) delete stationStocks[station.id];
    }
    stock = Math.max(0, stock);
  }

  function operate() {
    const arrivals = metro.advanceLocal({ collectArrivals: supplyEnabled && !skirmish.done() }).arrivals;
    const window = config.metroHorizon - config.prepMinutes;
    const target = Math.floor(Math.max(0, metro.tick() - config.prepMinutes) * skirmish.maxTicks() / window);
    if (stock > 0 && skirmish.tick() < target && !skirmish.done()) distribute();
    while (!skirmish.done() && skirmish.tick() < target) skirmish.advance();
    if (!skirmish.done()) for (const { stationId, q, r, count } of arrivals) {
      const earned = count * config.supportPerPassenger;
      const kept = Math.min(earned, Math.max(0, cap - stock));
      produced += earned;
      discarded += earned - kept;
      if (kept <= 0) continue;
      const station = stationStocks[stationId] ?? { id: stationId, q, r, stock: 0 };
      station.stock += kept;
      stock += kept;
      stationStocks[stationId] = station;
    }
    used = Object.values(recovered).reduce((sum, value) => sum + value, 0);
  }

  function links(withActions = false) {
    return {
      mode: config.coupling, spatial: {
        selectedBy: "feature-compiler", variant: program.strategy, stationRadius: radius,
        pressureRadius: 0, holdEvery: 0, enabled: supplyEnabled ? ["public-station-pool"] : [], skipped: [],
      },
      sharedMap: layout, supplyEnabled, holdsEnabled: false, stock, supportProduced: produced, supportUsed: used,
      stationStocks: structuredClone(stationStocks), lastHeldLines: [], heldTrainMinutes: 0, movingTrainMinutes: 0,
      prepRemaining: draft.finished() ? Math.max(0, config.prepMinutes - metro.tick()) : 0,
      ruleDesign: {
        strategy: program.strategy, phase: draft.finished() ? "operate" : "build",
        allocation: program.stock.allocation,
        ...draft.view(withActions), recovered: Object.fromEntries(factions.map((team) => [team, round(recovered[team])])),
      },
    };
  }
  function metrics() {
    const rail = metro.metrics(), squad = skirmish.metrics();
    const sides = skirmish.factionMetrics();
    const weight = config.metroWeight / 100;
    return {
      score: 100 * (weight * rail.completion + (1 - weight) * mean(Object.values(sides).map(({ hpRatio }) => hpRatio))),
      ...namespace("metro", rail), ...namespace("skirmish", squad),
      supportProduced: produced, supportUsed: round(used), supportDiscarded: round(discarded), supportStock: round(stock),
      heldMinutes: 0, heldTrainMinutes: 0,
      ...namespace("draft", draft.view(false).contributions),
      ...namespace("publicRecovery", links().ruleDesign.recovered),
    };
  }
  function apply(action) {
    if (action?.type === "place-track" || action?.type === "pass-turn") {
      if (draft.finished()) throw new Error("The public tracks are locked after construction");
      log(draft.apply(action));
      return;
    }
    if (action?.type !== "component" || action.component !== "skirmish" || !draft.finished() ||
        metro.tick() < config.prepMinutes || skirmish.done())
      throw new Error("Squad commands require an active engagement. Track edits use the draft action.");
    skirmish.apply(action.action);
    skirmish.setFactionController(children.skirmish.team, "human");
  }
  return {
    observe: () => ({ cycle: tick, links: links(), components: { metro: metro.observe(), skirmish: skirmish.observe() } }),
    renderState: () => ({
      links: links(true),
      components: Object.fromEntries(Object.entries({ metro, skirmish }).map(([id, part]) => [
        id, { config: children[id], time: part.time(), done: part.done(), metrics: part.metrics(), renderState: part.renderState() },
      ])),
    }),
    tick: () => tick,
    time: () => tick,
    done: () => draft.finished() && metro.done() && skirmish.done(),
    metrics,
    clearSolution() {},
    apply,
    acceptSolution: apply,
    decisionDue: () => draft.options().length > 0,
    decisionStamp: () => ({ turn: draft.view(false).turn }),
    createSearchTask: () => draftTasks(draft.options()).native,
    createVectorTask: () => draftTasks(draft.options()).vector,
    recentDesignEvents: () => events,
    advance() {
      if (this.done()) return;
      if (!draft.finished()) {
        const event = draft.advance();
        if (event) log(event);
        if (draft.finished()) log({ type: "tracks-locked", label: "Tracks locked · public service phase started" });
      } else operate();
      tick++;
    },
    draftOptions: draft.options,
    audit() {
      return {
        ...draft.view(false), factions: skirmish.factionMetrics(),
        produced, used, stock, discarded, contested, rail: metro.metrics(), plan: metro.currentPlan(),
      };
    },
  };
}

function pilot(config, children, program, firstSeat, changeFirst = false) {
  const env = createFeatureFusion(config, children, program, firstSeat);
  let varied = false, first = true, firstPlacement = null;
  while (!env.done()) {
    const choices = env.draftOptions();
    if (choices.length) {
      const best = choices[0];
      const different = changeFirst && first && choices.find(({ action }) =>
        action.type === "place-track" && [action.from, action.to].sort().join(":") !==
          [best.action.from, best.action.to].sort().join(":"));
      const selected = different || best;
      env.apply(selected.action);
      if (first) firstPlacement = selected.label;
      first = false;
      varied ||= Boolean(different);
    }
    env.advance();
    if (env.tick() > config.metroHorizon + program.factions.length * 3)
      throw new Error("A phase failed to terminate");
  }
  const state = env.audit();
  if (state.rail.track > state.trackBudget ||
    Object.values(state.spent).some((value) => value > state.quota) ||
    Math.abs(state.produced - state.used - state.stock - state.discarded) > 1e-6)
    throw new Error("A rail quota or public-stock invariant failed");
  return {
    seed: config.seed, first: program.factions[firstSeat], varied, firstPlacement,
    plan: state.plan, contested: state.contested,
    delivery: state.rail.completion, delivered: state.rail.delivered, track: state.rail.track,
    produced: state.produced, recovery: state.used,
    participation: Object.values(state.choicesByFaction).filter(Boolean).length / program.factions.length,
    contributions: state.contributions,
    hp: Object.fromEntries(Object.entries(state.factions).map(([id, metrics]) => [id, metrics.hpRatio])),
  };
}

export function evaluateFeatureDesign(config, sourceConfig, goal, check = () => {}) {
  const tables = featureTables(sourceConfig);
  const compiled = compileFeatureRules(tables);
  const seeds = [config.seed, (config.seed + 1) % 10000000];
  const childrenFor = (seed) => Object.fromEntries(Object.entries(sourceConfig)
    .map(([id, child]) => [id, { ...child, seed }]));
  const controls = new Map();
  const scenarios = compiled.candidates.map((candidate) => {
    if (!candidate.admissible) return { ...candidate, accepted: false, status: "Missing required features" };
    const { program } = candidate;
    const samples = [];
    try {
      for (const seed of seeds) {
        const turns = candidate.turns ? program.factions.length : 1;
        for (let seat = 0; seat < turns; seat++) {
          check();
          const children = childrenFor(seed);
          const sample = pilot({ ...config, seed }, children, program, seat);
          const key = `${candidate.placement}/${seed}/${seat}`;
          if (!controls.has(key)) {
            check();
            controls.set(key, pilot({ ...config, seed, coupling: "none" }, children, program, seat));
          }
          const control = controls.get(key);
          if (JSON.stringify(sample.plan) !== JSON.stringify(control.plan) || sample.delivered !== control.delivered)
            throw new Error("The supply toggle changed the matched rail plan or service outcome");
          samples.push({ ...sample, controlHp: control.hp,
            hpGain: mean(program.factions.map((id) => sample.hp[id] - control.hp[id])) });
        }
      }
      const orderStability = 1 - mean(seeds.flatMap((seed) => candidate.turns ? program.factions.map((id) => {
        const values = samples.filter((item) => item.seed === seed).map(({ hp }) => hp[id]);
        return Math.max(...values) - Math.min(...values);
      }) : [0]));
      let sensitivity = null;
      if (candidate.turns) {
        check();
        const alternate = pilot(config, sourceConfig, program, 0, true);
        if (alternate.varied) sensitivity = {
          original: samples[0].firstPlacement,
          alternate: alternate.firstPlacement,
          delivered: alternate.delivered - samples[0].delivered,
          produced: alternate.produced - samples[0].produced,
          recovered: round(alternate.recovery - samples[0].recovery),
        };
      }
      return {
        ...candidate, accepted: true, status: "Executed and validated",
        samples, sensitivity, summary: {
          participation: mean(samples.map(({ participation }) => participation)),
          delivery: mean(samples.map(({ delivery }) => delivery)),
          recovery: mean(samples.map(({ recovery }) => recovery)),
          hpGain: mean(samples.map(({ hpGain }) => hpGain)),
          contested: samples.reduce((total, { contested }) => total + contested, 0),
          orderStability,
        },
      };
    } catch (error) {
      return { ...candidate, accepted: false, status: error.message, samples };
    }
  });
  return { tables, findings: compiled.findings, candidates: scenarios, seeds, goal, ...rankRuleCandidates(scenarios, goal) };
}
