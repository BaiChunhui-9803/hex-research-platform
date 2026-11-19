import { random, integer } from "./random.js";
import { compatibility } from "./registry.js";

export const PLATFORM_VERSION = "hex-research/v1";
export class PlatformSession {
  constructor(problem, config, method = null, options = {}) {
    this.problem = problem;
    this.config = problem.validateConfig(config);
    this.environment = problem.create(this.config);
    this.options = {
      evaluations: integer(options.evaluations, 128, 1, 4096, "Evaluations"),
      populationSize: integer(
        options.populationSize,
        0,
        0,
        128,
        "Population size",
      ),
    };
    this.method = null;
    this.random = random(this.config.seed ^ 0xc47a2);
    this.actions = [];
    this.evaluations = 0;
    this.searchTrace = [];
    this.searchDetail = null;
    this.lastDecision = null;
    this.auto = false;
    if (method) this.setMethod(method);
  }
  setMethod(method) {
    const check = compatibility(
      method,
      this.problem.capabilities(this.config.scenarioId),
    );
    if (!check.compatible) throw new Error(check.reasons.join("; "));
    this.method = method;
    this.searchDetail = null;
    this.auto = true;
    this.lastDecision = null;
    this.environment.clearSolution();
  }
  takeControl() {
    this.auto = false;
    this.environment.clearSolution();
    this.actions.push({
      step: this.environment.tick(),
      kind: "control",
      value: "manual",
    });
  }
  apply(action, { manual = true } = {}) {
    if (manual && this.environment.done())
      throw new Error("The episode has finished; reset to continue");
    // Each adapter validates a full action before changing its state.
    this.environment.apply(action);
    if (manual) this.takeControl();
    this.actions.push({
      step: this.environment.tick(),
      kind: "action",
      value: structuredClone(action),
    });
  }
  advance(steps = 1, hooks = {}) {
    integer(steps, 1, 1, 1000, "Steps");
    for (let i = 0; i < steps && !this.environment.done(); i++) {
      hooks.check?.();
      if (
        this.auto &&
        this.environment.decisionDue(this.method.mode, this.lastDecision)
      ) {
        const task =
          this.method.protocol === "vector-optimization/v1"
            ? this.environment.createVectorTask(this.method.maxChange)
            : this.environment.createSearchTask(this.method.maxChange);
        const context = {
          random: this.random,
          check: hooks.check,
          shouldStop: () => false,
          evaluate: (candidate) => {
            this.evaluations++;
            return task.evaluate(candidate);
          },
        };
        if (this.method.mode === "search") {
          const result = this.method.solve(task, this.options, context);
          this.environment.acceptSolution(result.solution);
          this.actions.push({
            step: this.environment.tick(),
            kind: "solution",
            value: structuredClone(result.solution),
          });
          this.evaluations += result.evaluations;
          this.searchTrace = result.trace;
          const stride = Math.max(1, Math.ceil(result.trace.length / 128));
          this.searchDetail = {
            methodId: this.method.id,
            encoding: task.encoding ?? "Native problem candidates",
            dimension: task.dimension ?? null,
            implementation: result.implementation ?? null,
            paretoArchive: result.paretoArchive ?? null,
            objectiveSchema: result.objectiveSchema ?? null,
            selectionRule: result.selectionRule ?? null,
            trace: result.trace.filter(
              (_, i) => i % stride === 0 || i === result.trace.length - 1,
            ),
          };
        } else {
          const action = this.method.decide(
            this.environment.observe(),
            {
              iterations: this.options.evaluations,
              horizon: this.config.horizon,
              objective: this.config.objective ?? "balanced",
              maxChange: this.method.maxChange ?? Infinity,
              opened: this.environment.opened?.() ?? false,
            },
            context,
          );
          this.apply(action, { manual: false });
        }
        this.lastDecision = this.environment.decisionStamp();
      }
      this.environment.advance();
    }
    return this.view();
  }
  view() {
    return {
      version: PLATFORM_VERSION,
      problemId: this.problem.id,
      config: structuredClone(this.config),
      methodId: this.method?.id ?? null,
      auto: this.auto,
      tick: this.environment.tick(),
      time: this.environment.time(),
      timeUnit: this.problem.timeUnit,
      done: this.environment.done(),
      observation: this.environment.observe(),
      metrics: this.environment.metrics(),
      renderState: this.environment.renderState(),
      evaluations: this.evaluations,
      searchDetail: this.searchDetail,
    };
  }
  replay() {
    return {
      version: PLATFORM_VERSION,
      problemId: this.problem.id,
      config: structuredClone(this.config),
      methodId: this.method?.id ?? null,
      options: { ...this.options },
      finalStep: this.environment.tick(),
      finalMetrics: this.environment.metrics(),
      actions: structuredClone(this.actions),
    };
  }
}
export function createReplayCursor(problem, recording) {
  if (
    recording.version !== PLATFORM_VERSION ||
    recording.problemId !== problem.id
  )
    throw new Error("Replay version or problem mismatch");
  const finalStep = integer(recording.finalStep, undefined, 0, Number.MAX_SAFE_INTEGER, "Replay length");
  const byStep = new Map();
  for (const entry of recording.actions) {
    if (
      !Number.isInteger(entry.step) ||
      entry.step < 0 ||
      entry.step > finalStep
    )
      throw new Error("Invalid replay action time");
    const entries = byStep.get(entry.step) ?? [];
    entries.push(entry);
    byStep.set(entry.step, entries);
  }
  const config = problem.restoreRecordingConfig?.(recording.config) ?? recording.config;
  let session = new PlatformSession(problem, config);
  let appliedEnd = false;
  function applyEntries(step) {
    for (const entry of byStep.get(step) ?? []) {
      if (entry.kind === "solution")
        session.environment.acceptSolution(entry.value);
      else if (entry.kind === "action") session.environment.apply(entry.value);
      else if (entry.kind === "control") session.environment.clearSolution();
      else throw new Error("Unknown replay event");
    }
  }
  return {
    seek(until = finalStep) {
      const stop = integer(until, finalStep, 0, finalStep, "Replay position");
      if (stop < session.environment.tick()) {
        session = new PlatformSession(problem, config);
        appliedEnd = false;
      }
      while (session.environment.tick() < stop && !session.environment.done()) {
        applyEntries(session.environment.tick());
        session.environment.advance();
      }
      if (stop === finalStep && !appliedEnd && session.environment.tick() === finalStep) {
        applyEntries(finalStep);
        appliedEnd = true;
      }
      return session;
    },
  };
}

export function replaySession(problem, recording, until = recording.finalStep) {
  return createReplayCursor(problem, recording).seek(until);
}
