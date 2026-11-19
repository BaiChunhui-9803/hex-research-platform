export const FROZEN_SCHEMA = "hex-frozen-difficulty/v1";
export const TARGET_LEVELS = [50, 80, 95];
const BUDGET_MARKS = [8, 16, 24, 48, 64];
const EPS = 1e-8;

export function benchmarkSettings(problemId) {
  if (problemId === "metro") return { horizon: 180 };
  if (problemId === "skirmish") return { horizon: 60 };
  return { metroHorizon: 180, skirmishHorizon: 60 };
}

export function scenarioKey(
  problemId,
  config,
  checkpoint,
  excludeSeed = false,
) {
  const settings = Object.entries(config)
    .filter(([key, value]) =>
      (!excludeSeed || key !== "seed") && !(value === "legacy" &&
        ((problemId === "metro" && key === "trackTopology") || (problemId === "fusion" && key === "metroTrackTopology"))),
    )
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([problemId, checkpoint, settings]);
}

function targetRow(row, reference) {
  const seed = row.seed;
  if (!row.search) return { seed, status: "finished", targets: [] };
  if (!reference) return { seed, status: "no-reference", targets: [] };
  const { baseline, best } = reference;
  const tolerance = Math.max(EPS, Math.abs(baseline) * 1e-9);
  if (Math.abs(row.search.baseline - baseline) > tolerance)
    return { seed, status: "baseline-mismatch", targets: [] };
  if (best - baseline <= EPS)
    return { seed, status: "no-reference-gain", baseline, best, targets: [] };
  return {
    seed,
    status: "calibrated",
    baseline,
    best,
    targets: TARGET_LEVELS.map((percent) => {
      const score = baseline + ((best - baseline) * percent) / 100;
      return {
        percent,
        score,
        methods: row.search.probes.map((probe) => {
          const index = probe.scores.findIndex(
            (v) => Number.isFinite(v) && v >= score - EPS,
          );
          return { id: probe.id, hitAt: index < 0 ? null : index + 1 };
        }),
      };
    }),
  };
}

export function summarizeWholeEpisodes(
  episodes,
  deliveryTargets = [35, 50, 65],
  survival = 20,
) {
  const groups = new Map();
  for (const episode of episodes) {
    const key = `${episode.method}:${episode.planningBudget}`;
    const rows = groups.get(key) ?? [];
    groups.set(key, [...rows, episode]);
  }
  const mean = (values) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  return [...groups.values()].map((rows) => ({
    method: rows[0].method,
    budget: rows[0].planningBudget,
    episodes: rows.length,
    seeds: [...new Set(rows.map((row) => row.seed))].sort((a, b) => a - b),
    completion: mean(rows.map((row) => row.completion).filter(Number.isFinite)),
    win: mean(rows.map((row) => row.win).filter(Number.isFinite)),
    goals: deliveryTargets.map((percent) => ({
      percent,
      reached: rows.filter(
        (row) =>
          (row.completion === null || row.completion >= percent / 100) &&
          (row.win === null || (row.win === 1 && row.hp >= survival / 100)),
      ).length,
    })),
  }));
}

export function addFrozenDifficulty(report, archive) {
  if (!archive || archive.version !== FROZEN_SCHEMA)
    return { ...report, frozen: { status: "unavailable", profiles: [] } };
  const { problemId, config, checkpoint, evaluations } = report.request;
  const referenceByKey = new Map(
    archive.references.map((record) => [
      scenarioKey(record.problemId, record.config, record.checkpoint),
      record,
    ]),
  );
  const episodesByKey = new Map(
    archive.wholeEpisodes.map((record) => [
      scenarioKey(record.problemId, record.config, 0, true),
      record.episodes,
    ]),
  );
  const budgets = [
    ...new Set([...BUDGET_MARKS.filter((b) => b <= evaluations), evaluations]),
  ];
  const profiles = report.profiles.map((profile) => {
    const settings =
      problemId === "fusion" ? { ...config, coupling: profile.label } : config;
    const rows = profile.rows.map((row) =>
      targetRow(
        row,
        referenceByKey.get(
          scenarioKey(problemId, { ...settings, seed: row.seed }, checkpoint),
        ),
      ),
    );
    const calibrated = rows.filter((row) => row.status === "calibrated");
    const curves = TARGET_LEVELS.flatMap((percent) =>
      ["uniform", "ga"].map((method) => ({
        percent,
        method,
        eligible: calibrated.length,
        points: budgets.map((budget) => ({
          budget,
          reached: calibrated.filter((row) => {
            const found = row.targets
              .find((item) => item.percent === percent)
              .methods.find((item) => item.id === method);
            return found?.hitAt != null && found.hitAt <= budget;
          }).length,
        })),
      })),
    );
    const archivedEpisodes =
      checkpoint === 0
        ? (episodesByKey.get(scenarioKey(problemId, settings, 0, true)) ?? [])
        : [];
    return {
      label: profile.label,
      rows,
      curves,
      wholeEpisodes: summarizeWholeEpisodes(archivedEpisodes),
    };
  });
  return {
    ...report,
    frozen: {
      status: "loaded",
      id: archive.id,
      source: archive.source,
      referenceMethods: archive.referenceMethods,
      referenceBudget: archive.referenceBudget,
      profiles,
    },
  };
}
