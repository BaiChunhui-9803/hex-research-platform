export const FEATURE_RULE_VERSION = 1;
export const DESIGN_GOALS = {
  agency: "Faction planning agency",
  service: "Passenger service",
};

export const CONSTRUCTION_OPERATORS = [
  { id: "neutral", name: "Neutral public network", description: "A neutral planner installs a public network before engagement.",
    requires: "neutral-setup", turns: false, placement: "neutral" },
  { id: "turns", name: "Alternating public construction", description: "Factions alternate legal additions on one public network, with a reversed second round.",
    requires: "rotate-authority", turns: true, placement: "shared" },
  { id: "zones", name: "Zoned public construction", description: "Factions alternate additions within station zones. A shared hub can connect their routes.",
    requires: "station-zones", turns: true, placement: "zones" },
];
export const SUPPLY_OPERATORS = [
  { suffix: "", id: "proportional-unmet-hp", name: "Proportional supply", divisible: false },
  { suffix: "-equal", id: "equal-share-redistribution", name: "Equal shares", divisible: true },
];
export const RULE_CANDIDATE_CHOICES = CONSTRUCTION_OPERATORS.flatMap((construction) =>
  SUPPLY_OPERATORS.map((supply) => ({
    value: construction.id + supply.suffix,
    label: `${construction.name} · ${supply.name}`,
  })),
);

/** Match typed operations in the matrix. Source problem and scenario names carry no rules. */
export function compileFeatureRules(tables) {
  const operations = tables.flatMap(({ rows }) => rows.flatMap((row) => row.operations));
  const find = (kind, test = () => true) =>
    operations.find(({ binding }) => binding?.kind === kind && test(binding));
  const actors = find("actors", (b) => b.model === "factions" && b.count >= 2 && b.count <= 3 &&
    Array.isArray(b.factions) && new Set(b.factions).size === b.count && b.factions.length === b.count);
  const writer = find("write-track", (b) => b.authority === "single-writer" && b.hook === "add-station-link");
  const single = find("actors", (b) => b.model === "single-planner");
  const railClock = find("clock", (b) => b.mode === "service-ticks" && b.pausable);
  const combatClock = find("clock", (b) => b.mode === "real-time" && b.pausable);
  const producer = find("producer", (b) => b.event === "station-arrival" && b.location === "station");
  const consumer = find("consumer", (b) => b.resource === "health" && b.hook === "local-health" &&
    (b.access === "public" || (b.access === "faction-local" && b.adaptable)));
  const trackCheck = find("invariant", (b) => b.rule === "validate-track-plan");
  const simpleTrack = find("invariant", (b) => b.rule === "simple-track-path");
  const damageCheck = find("invariant", (b) => b.rule === "resolve-damage");
  const stations = find("geometry", (b) => b.grid === "axial-hex" && b.entities.includes("station"));
  const positions = find("locator", (b) => b.grid === "axial-hex" && b.entity === "unit");
  const findings = [];
  function match(id, title, conclusion, inputs) {
    const matched = inputs.every(Boolean);
    findings.push({ id, title, matched, conclusion, evidence: inputs.filter(Boolean).map(({ id }) => id) });
    return matched;
  }
  const authority = match("authority", "Planning authority", "One track writer and several faction controllers. A candidate must mediate track writes.", [single, writer, actors]);
  const clocks = match("clocks", "Planning and engagement clocks", "A setup phase can commit tracks before service and real-time engagement advance.", [writer, railClock, combatClock]);
  const stock = match("stock", "Public supply", "Station deliveries can credit one public pool. Local recovery can share that pool across factions.", [producer, consumer, actors, stations, positions]);
  const invariants = match("invariants", "Native constraints", simpleTrack
    ? "Validate the simple geometry of every line and retain native track limits and damage resolution."
    : "Keep the recorded route validator and damage resolution.", [trackCheck, damageCheck, ...(simpleTrack ? [simpleTrack] : [])]);
  const grants = {
    "neutral-setup": authority,
    "rotate-authority": authority && Boolean(writer?.binding.adaptable),
    "station-zones": authority && Boolean(writer?.binding.adaptable && stations && positions),
  };
  const candidates = CONSTRUCTION_OPERATORS.flatMap((operator) => SUPPLY_OPERATORS.map((supply) => {
    const missing = [
      ...(!grants[operator.requires] ? [operator.requires] : []),
      ...(!clocks ? ["phase-schedule"] : []),
      ...(!stock ? ["public-station-pool"] : []),
      ...(supply.divisible && !consumer?.binding.divisible ? ["shareable-health-resource"] : []),
      ...(!invariants ? ["native-invariants"] : []),
    ];
    const phases = [
      { id: "build", writer: operator.placement, order: operator.turns ? "snake" : "neutral", rounds: operator.turns ? 2 : 1 },
      { id: "operate", tracks: "locked", clock: "rail-minute-with-battle-ticks" },
    ];
    const id = operator.id + supply.suffix;
    return {
      ...operator, id, supplyName: supply.name, admissible: !missing.length, missing,
      ...(missing.length ? {} : { program: {
        version: FEATURE_RULE_VERSION, strategy: id, factions: [...actors.binding.factions],
        phases, trackTopology: simpleTrack ? "simple" : "legacy",
        stock: { allocation: supply.id, authority: "public", event: producer.binding.event },
      } }),
    };
  }));
  return { findings, candidates };
}

export function rankRuleCandidates(candidates, goal) {
  const comparators = goal === "service"
    ? ["delivery", "participation", "orderStability", "hpGain", "recovery"]
    : ["participation", "delivery", "orderStability", "hpGain", "recovery"];
  const ranked = candidates.filter((candidate) => candidate.accepted).sort((a, b) => {
    for (const key of comparators) {
      const delta = b.summary[key] - a.summary[key];
      if (Math.abs(delta) > 1e-9) return delta;
    }
    return a.id.localeCompare(b.id);
  });
  return { selected: ranked[0]?.id ?? null, ranked: ranked.map(({ id }) => id), criteria: comparators };
}
