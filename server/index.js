import http from "node:http";
import path from "node:path";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { problemRegistry, problemMetadata } from "../problems/index.js";
import { methodRegistry } from "../methods/index.js";
import { methodMetadata } from "../core/registry.js";
import {
  PlatformSession,
  PLATFORM_VERSION,
  replaySession,
} from "../core/session.js";
import { validateExperiment, resultCSV } from "../core/experiment.js";
import { integer } from "../core/random.js";
import { filterMethods } from "../methods/taxonomy.js";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DESIGN_PATH = "/docs/design-reference-library-20261115/";
const PUBLIC_DESIGN_FILES = new Set([
  "index.html",
  "report.zh-CN.html",
  "reference-table.csv",
]);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
export function createServer({ persist = true } = {}) {
  const jobs = new Map(),
    sessions = new Map();
  const send = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  const body = async (req) => {
    let data = "";
    for await (const chunk of req) {
      data += chunk;
      if (Buffer.byteLength(data) > 2000000)
        throw new Error("Request too large");
    }
    const result = JSON.parse(data || "{}");
    if (!result || Array.isArray(result) || typeof result !== "object")
      throw new Error("Expected a JSON object");
    return result;
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const url = new URL(req.url, "http://localhost"),
        route = decodeURIComponent(url.pathname),
        verb = req.method;
      if (route === "/api/health" && verb === "GET")
        return send(res, 200, {
          ok: true,
          version: PLATFORM_VERSION,
          appVersion: "0.3.0",
          problems: problemRegistry.list().length,
          methods: methodRegistry.list().length,
        });
      if (route === "/api/problems" && verb === "GET")
        return send(res, 200, problemRegistry.list().map(problemMetadata));
      const problemRoute = route.match(/^\/api\/problems\/([a-z.-]+)$/);
      if (problemRoute && verb === "GET")
        return send(
          res,
          200,
          problemMetadata(problemRegistry.get(problemRoute[1])),
        );
      if (route === "/api/methods" && verb === "GET") {
        const problem = problemRegistry.get(
          url.searchParams.get("problemId") ?? "metro",
        );
        const capabilities = problem.capabilities(
          url.searchParams.get("scenarioId") ?? problem.defaultScenario,
        );
        return send(
          res,
          200,
          filterMethods(
            methodRegistry.list(),
            {
              objective: url.searchParams.get("objective"),
              category: url.searchParams.get("category"),
              family: url.searchParams.get("family"),
              variant: url.searchParams.get("variant"),
              query: url.searchParams.get("q"),
              compatibleOnly: url.searchParams.get("compatible") === "true",
            },
            capabilities,
          ).map((method) => methodMetadata(method, capabilities)),
        );
      }
      if (route === "/api/sessions" && verb === "POST") {
        for (const [id, entry] of sessions)
          if (Date.now() - entry.accessed > 30 * 60 * 1000) sessions.delete(id);
        if (sessions.size >= 20)
          return send(res, 429, {
            error: "Close a session before creating another",
          });
        const data = await body(req),
          problem = problemRegistry.get(data.problemId);
        const session = new PlatformSession(
          problem,
          data.config ?? {},
          data.methodId ? methodRegistry.get(data.methodId) : null,
          {
            evaluations: data.evaluations,
            populationSize: data.populationSize,
          },
        );
        const id = randomUUID();
        sessions.set(id, { session, accessed: Date.now() });
        return send(res, 201, { id, ...session.view() });
      }
      const sessionRoute = route.match(
        /^\/api\/sessions\/([a-f0-9-]+)(?:\/(step|actions|controller|replay|observe))?$/,
      );
      if (sessionRoute) {
        const [, id, action] = sessionRoute,
          entry = sessions.get(id);
        if (!entry)
          return send(res, 404, { error: "Session not found or expired" });
        entry.accessed = Date.now();
        const session = entry.session;
        if (verb === "DELETE" && !action) {
          sessions.delete(id);
          return send(res, 200, { id, status: "deleted" });
        }
        if (verb === "GET" && action === "replay")
          return send(res, 200, session.replay());
        if (verb === "GET" && action === "observe")
          return send(res, 200, session.environment.observe());
        if (verb === "GET" && !action)
          return send(res, 200, { id, ...session.view() });
        if (verb === "POST") {
          const data = await body(req);
          if (action === "step") {
            const started = performance.now();
            session.advance(integer(data.steps, 1, 1, 1000, "Steps"), {
              check: () => {
                if (performance.now() - started > 10000)
                  throw new Error(
                    "Live API step exceeded 10 seconds; use the experiment API for large budgets",
                  );
              },
            });
          } else if (action === "actions") session.apply(data.action);
          else if (action === "controller") {
            const nextOptions = {
              evaluations: integer(
                data.evaluations,
                session.options.evaluations,
                1,
                4096,
                "Evaluations",
              ),
              populationSize: integer(
                data.populationSize,
                session.options.populationSize,
                0,
                128,
                "Population size",
              ),
            };
            if (data.methodId)
              session.setMethod(methodRegistry.get(data.methodId));
            else session.takeControl();
            session.options = nextOptions;
          } else return send(res, 405, { error: "Method not allowed" });
          return send(res, 200, { id, ...session.view() });
        }
        return send(res, 405, { error: "Method not allowed" });
      }
      if (route === "/api/replays/verify" && verb === "POST") {
        const data = await body(req),
          problem = problemRegistry.get(data.problemId);
        const session = replaySession(problem, data);
        const metrics = session.environment.metrics();
        return send(res, 200, {
          matches:
            JSON.stringify(metrics) === JSON.stringify(data.finalMetrics),
          metrics,
        });
      }
      if (route === "/api/jobs" && verb === "POST") {
        if (
          [...jobs.values()].filter((j) => j.status === "running").length >= 2
        )
          return send(res, 429, {
            error: "Two experiments are already running",
          });
        const data = validateExperiment(
            await body(req),
            problemRegistry,
            methodRegistry,
          ),
          id = randomUUID();
        for (const [key, job] of jobs)
          if (jobs.size >= 30 && job.status !== "running") jobs.delete(key);
        const worker = new Worker(new URL("./worker.js", import.meta.url), {
          workerData: data,
        });
        const job = {
          id,
          status: "running",
          progress: 0,
          message: "Preparing experiment",
          request: data,
          worker,
        };
        jobs.set(id, job);
        worker.on("message", async (message) => {
          if (job.status !== "running") return;
          if (message.type === "done") {
            job.status = "done";
            job.progress = 1;
            job.report = message.report;
            job.message = "Experiment complete";
            if (persist)
              try {
                await mkdir(path.join(ROOT, "experiments", "runs"), {
                  recursive: true,
                });
                await writeFile(
                  path.join(ROOT, "experiments", "runs", id + ".json"),
                  JSON.stringify(message.report, null, 2),
                );
              } catch (error) {
                job.persistenceError = error.message;
              }
          } else if (message.type === "error") {
            job.status = "error";
            job.message = message.message;
          } else Object.assign(job, message);
        });
        worker.on("error", (error) => {
          if (job.status === "running") {
            job.status = "error";
            job.message = error.message;
          }
        });
        worker.on("exit", () => {
          if (job.status === "running") {
            job.status = "error";
            job.message = "Worker exited before producing a result";
          }
        });
        return send(res, 202, { id, status: job.status });
      }
      const jobRoute = route.match(
        /^\/api\/jobs\/([a-f0-9-]+)(?:\/(json|csv))?$/,
      );
      if (jobRoute) {
        const [, id, format] = jobRoute,
          job = jobs.get(id);
        if (!job) return send(res, 404, { error: "Job not found" });
        if (verb === "DELETE" && !format) {
          if (job.status === "running") {
            job.status = "cancelled";
            await job.worker.terminate();
          }
        } else if (verb !== "GET")
          return send(res, 405, { error: "Method not allowed" });
        if (format) {
          if (!job.report)
            return send(res, 409, {
              error: "Experiment has no complete result",
            });
          if (format === "json") return send(res, 200, job.report);
          res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8" });
          return res.end(resultCSV(job.report));
        }
        const { worker, ...view } = job;
        return send(res, 200, view);
      }
      if (route === "/api/runs" && verb === "GET") {
        let files = [];
        try {
          files = await readdir(path.join(ROOT, "experiments", "runs"));
        } catch {}
        const entries = await Promise.all(
          files
            .filter((f) => /^[a-f0-9-]+\.json$/.test(f))
            .map(async (file) => ({
              file,
              modified: (
                await stat(path.join(ROOT, "experiments", "runs", file))
              ).mtimeMs,
            })),
        );
        const recent = entries
          .sort((a, b) => b.modified - a.modified)
          .slice(0, 30);
        const runs = await Promise.all(
          recent.map(async ({ file }) => {
            try {
              const report = JSON.parse(
                await readFile(
                  path.join(ROOT, "experiments", "runs", file),
                  "utf8",
                ),
              );
              return {
                id: file.slice(0, -5),
                url: "/experiments/runs/" + file,
                problemId: report.request.problemId,
                scenarioIds: report.request.scenarioIds,
                episodes: report.results.length,
                createdAt: report.createdAt,
              };
            } catch {
              return null;
            }
          }),
        );
        return send(res, 200, runs.filter(Boolean));
      }
      if (route.startsWith("/api/"))
        return send(res, 404, { error: "Endpoint not found" });
      if (!["GET", "HEAD"].includes(verb))
        return send(res, 405, { error: "Method not allowed" });
      const resource = route === "/" ? "/web/index.html" : route;
      if (
        !/^\/(web|core|problems|methods|engines|docs|experiments)\//.test(
          resource,
        ) ||
        resource.includes("..") ||
        resource.includes("\\")
      )
        return send(res, 404, { error: "File not found" });
      const filename = path.resolve(ROOT, "." + resource);
      if (!filename.startsWith(path.resolve(ROOT) + path.sep))
        return send(res, 403, { error: "Invalid path" });
      const bytes = await readFile(filename).catch((error) => {
        if (error.code !== "ENOENT" || !resource.startsWith(DESIGN_PATH))
          throw error;
        const asset = resource.slice(DESIGN_PATH.length);
        if (PUBLIC_DESIGN_FILES.has(asset))
          return readFile(path.join(ROOT, "." + DESIGN_PATH, "public", asset));
        if (asset.startsWith("assets/fonts/"))
          return readFile(path.join(ROOT, "web", asset));
        throw error;
      });
      res.writeHead(200, {
        "Content-Type":
          MIME[path.extname(filename)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(verb === "HEAD" ? undefined : bytes);
    } catch (error) {
      send(res, error.code === "ENOENT" ? 404 : 400, {
        error: error.code === "ENOENT" ? "File not found" : error.message,
      });
    }
  });
  server.on("close", () => {
    for (const job of jobs.values())
      if (job.status === "running") job.worker.terminate();
  });
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT ?? 4175),
    server = createServer();
  server.listen(port, "127.0.0.1", () =>
    console.log(`HEX Research Platform — http://127.0.0.1:${port}`),
  );
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
