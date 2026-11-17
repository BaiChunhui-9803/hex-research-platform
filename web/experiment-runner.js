import { summarize } from "../core/experiment.js";
export function splitExperiment(request, limit = 120) {
  const { scenarioIds, methodIds, seeds } = request;
  if (!Number.isInteger(limit) || limit < 1 || !scenarioIds.length || !seeds.length || !methodIds.length)
    throw new Error("An experiment needs scenarios, seeds, methods and a positive batch limit");
  const batches = [];
  for (let seedStart = 0; seedStart < seeds.length; seedStart += limit) {
    const batchSeeds = seeds.slice(seedStart, seedStart + limit);
    const scenariosPerBatch = Math.floor(limit / batchSeeds.length);
    for (let s = 0; s < scenarioIds.length; s += scenariosPerBatch) {
      const batchScenarios = scenarioIds.slice(s, s + scenariosPerBatch);
      const methodsPerBatch = Math.floor(limit / (batchScenarios.length * batchSeeds.length));
      for (let i = 0; i < methodIds.length; i += methodsPerBatch)
        batches.push({
          ...request,
          scenarioIds: batchScenarios,
          seeds: batchSeeds,
          methodIds: methodIds.slice(i, i + methodsPerBatch),
        });
    }
  }
  return batches;
}
export function mergeReports(reports, request) {
  if (!reports.length) return null;
  const results = reports.flatMap((r) => r.results),
    schema = reports[0].metricSchema;
  const expectedEpisodes =
    request.scenarioIds.length *
    request.seeds.length *
    request.methodIds.length;
  return {
    version: reports[0].version,
    createdAt: reports[0].createdAt,
    request,
    metricSchema: schema,
    results,
    summary: summarize(results, schema),
    elapsedMs: reports.reduce((s, r) => s + r.elapsedMs, 0),
    batches: reports.length,
    complete: results.length === expectedEpisodes,
    expectedEpisodes,
  };
}
function episodeCount(request) {
  return (
    request.scenarioIds.length * request.seeds.length * request.methodIds.length
  );
}

function createBatchedRunner(startBatch, onProgress, onPartial) {
  let cancelled = false,
    active = null;
  return {
    async cancel() {
      cancelled = true;
      await active?.cancel();
    },
    async run(request) {
      cancelled = false;
      const batches = splitExperiment(request),
        reports = [];
      let finished = 0;
      const total = episodeCount(request);
      for (let index = 0; index < batches.length && !cancelled; index++) {
        const batch = batches[index],
          count = episodeCount(batch);
        active = startBatch(batch, (state) =>
          onProgress({
            progress: (finished + (state.progress ?? 0) * count) / total,
            status: state.status,
            message: `Batch ${index + 1}/${batches.length} · ${state.message ?? ""}`,
          }),
        );
        try {
          const result = await active.result;
          if (!result) {
            cancelled = true;
            break;
          }
          reports.push(result);
          finished += result.results.length;
          onPartial?.(mergeReports(reports, request));
        } finally {
          active = null;
        }
      }
      return {
        cancelled,
        report: mergeReports(reports, request),
        completed: finished,
        total,
      };
    },
  };
}

export function createExperimentRunner(api, onProgress, onPartial) {
  return createBatchedRunner(
    (batch, progress) => {
      let path, deletion;
      let cancelled = false;
      async function cancel() {
        cancelled = true;
        if (path) await (deletion ??= api(path, null, "DELETE"));
      }
      async function run() {
        const job = await api("/api/jobs", batch);
        path = "/api/jobs/" + job.id;
        if (cancelled) await cancel();
        while (!cancelled) {
          const state = await api(path);
          if (cancelled) break;
          progress(state);
          if (state.status === "done") return state.report;
          if (state.status === "cancelled") break;
          if (state.status === "error")
            throw new Error(state.message ?? "Experiment failed");
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
        return null;
      }
      return { result: run(), cancel };
    },
    onProgress,
    onPartial,
  );
}

export function createBrowserExperimentRunner(onProgress, onPartial) {
  return createBatchedRunner(
    (batch, progress) => {
      const worker = new Worker(
        new URL("./experiment-worker.js", import.meta.url),
        { type: "module" },
      );
      let cancel;
      const result = new Promise((resolve, reject) => {
        cancel = () => resolve(null);
        worker.onmessage = ({ data }) => {
          if (data.type === "done") {
            progress({
              status: "done",
              progress: 1,
              message: "Experiment complete",
            });
            resolve(data.report);
          } else if (data.type === "error") {
            reject(new Error(data.message));
          } else {
            progress({ status: "running", ...data.progress });
          }
        };
        worker.onerror = (event) =>
          reject(new Error(event.message || "The experiment worker failed to load"));
        worker.postMessage(batch);
      }).finally(() => worker.terminate());
      return { result, cancel };
    },
    onProgress,
    onPartial,
  );
}
