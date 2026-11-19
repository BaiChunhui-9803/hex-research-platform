export const couplingProfiles = {
  both: { label: "Two-way coupling", supply: true, holds: true },
  supply: { label: "Metro supports squad", supply: true, holds: false },
  disruption: { label: "Squad affects metro", supply: false, holds: true },
  none: { label: "Uncoupled comparison", supply: false, holds: false },
};
export const SUPPORT_CAP = 60;
const PRESSURE_MARGIN = 0.1;

export const hasSupply = (config) => couplingProfiles[config.coupling].supply &&
  config.supportPerPassenger !== 0 && config.supplyCap !== 0;

export function underPressure(squad, team) {
  const { ownHp, ownMax, enemyHp, enemyMax, winner } = squad.health();
  if (squad.done() && winner !== null) return winner !== team;
  return (
    ownHp / Math.max(1, ownMax) + PRESSURE_MARGIN <=
    enemyHp / Math.max(1, enemyMax)
  );
}

export function newTimeline() {
  return {
    cycle: 0,
    stock: 0,
    supportProduced: 0,
    supportUsed: 0,
    heldMinutes: 0,
    lastHold: false,
  };
}

/** The same causal round is used during live play, search and replay. */
export function advanceJoint(parts, clock, config) {
  const { metro, skirmish } = parts;
  const profile = couplingProfiles[config.coupling];
  const supply = hasSupply(config);
  const next = clock.cycle + 1;
  const oldDelivered = supply ? metro.delivered() : 0;
  const hold =
    !metro.done() &&
    profile.holds &&
    next % config.holdEvery === 0 &&
    underPressure(skirmish, config.skirmishTeam);
  metro.advance({ holdTrains: hold });

  const duration = skirmish.maxTicks();
  const battleWindow = config.metroHorizon - config.prepMinutes;
  const target = Math.floor(
    (Math.max(0, next - config.prepMinutes) * duration) / battleWindow,
  );
  if (
    supply &&
    !skirmish.done() &&
    skirmish.tick() < target &&
    clock.stock > 0
  ) {
    const used = skirmish.restoreHealth(clock.stock);
    clock.supportUsed += used;
    clock.stock -= used;
  }
  while (!skirmish.done() && skirmish.tick() < target) skirmish.advance();

  if (supply && !skirmish.done()) {
    const earned =
      (metro.delivered() - oldDelivered) * config.supportPerPassenger;
    clock.supportProduced += earned;
    // New deliveries can only affect later battle ticks.
    clock.stock = Math.min(config.supplyCap ?? SUPPORT_CAP, clock.stock + earned);
  }
  clock.cycle = next;
  clock.lastHold = hold;
  if (hold) clock.heldMinutes++;
}
