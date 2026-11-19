import { createReplayCursor, PlatformSession } from "../../core/session.js";
import { problemRegistry } from "../../problems/index.js";
import { methodRegistry } from "../../methods/index.js";
import { generateLegacyTrace } from "./legacy-replay.js";

let cursor, recording;

function rowFor(problemId, metrics) {
  if (problemId === "metro") return {
    delivered: metrics.delivered, waiting: metrics.waiting, riding: metrics.riding, track: metrics.track,
  };
  if (problemId === "skirmish") return { survival: metrics.hpRatio, hpMargin: metrics.hpMargin };
  return {
    delivered: metrics["metro.delivered"], waiting: metrics["metro.waiting"], riding: metrics["metro.riding"],
    survival: metrics["skirmish.hpRatio"], hpMargin: metrics["skirmish.hpMargin"],
    supply: metrics.supportUsed, produced: metrics.supportProduced,
    delay: metrics.heldTrainMinutes ?? metrics.heldMinutes, track: metrics["metro.track"],
  };
}

function actionLabel(entry) {
  if (entry.kind === "control") return "Manual control";
  if (entry.kind === "solution") {
    const { metro, skirmish, lines } = entry.value;
    if (metro && skirmish) return "Installed a rail plan and squad controller";
    if (lines) return "Installed a rail plan";
    return "Installed a squad controller";
  }
  const action = entry.value.action ?? entry.value;
  if (action.type === "set-plan") return "Updated the rail plan";
  if (action.type === "commands") return "Issued squad orders";
  return "Applied a recorded decision";
}

function prepare(input) {
  recording = input;
  const problem = problemRegistry.get(input.problemId);
  const max = input.finalStep;
  if (!Number.isSafeInteger(max) || max < 0 || max > 1200)
    throw new Error("Unsupported replay length.");
  cursor = createReplayCursor(problem, input);
  const design = input.config.ruleMode === "features";
  const timeline = [], events = input.actions
    .filter((entry) => {
      const type = (entry.value?.action ?? entry.value)?.type;
      return type !== "commands" && !(design && ["place-track", "pass-turn"].includes(type));
    })
    .map((entry) => ({ tick: Math.min(max, entry.step + 1), label: actionLabel(entry) }));
  let prior, metrics, previousEvent = 0, designCursor = 0;
  for (let tick = 0; tick <= max; tick++) {
    const env = cursor.seek(tick).environment;
    if (env.tick() !== tick) throw new Error("The recording ends beyond the reconstructed episode.");
    metrics = env.metrics();
    const row = rowFor(problem.id, metrics);
    timeline.push(row);
    const designEvents = env.recentDesignEvents?.();
    while (designEvents && designCursor < designEvents.length) {
      const entry = designEvents[designCursor++];
      events.push({
        tick: Math.min(max, entry.tick),
        label: entry.team ? `${entry.team} · ${entry.label}` : entry.label,
      });
    }
    if (prior && problem.id === "fusion") {
      const diff = (key) => Math.round(100 * (row[key] - prior[key])) / 100;
      const parts = [];
      if (diff("delivered")) parts.push(`+${diff("delivered")} passengers delivered`);
      if (diff("produced")) parts.push(`+${diff("produced")} supply generated`);
      if (diff("supply")) parts.push(`+${diff("supply")} squad HP restored`);
      if (diff("delay")) parts.push(input.config.layout === "shared" ? `+${diff("delay")} delayed train-min` : "Dispatch held");
      if (parts.length) events.push({ tick, label: parts.join(" · ") });
    }
    if (problem.id === "skirmish") {
      const squad = env.recentEvents();
      for (const event of squad) if (event.id > previousEvent) {
        previousEvent = event.id;
        if (event.type === "death")
          events.push({ tick, label: `${event.killerId ?? "Squad"} eliminated ${event.unitId}` });
      }
    }
    prior = row;
  }
  const matches = !input.finalMetrics || Object.entries(input.finalMetrics)
    .every(([key, value]) => Object.is(value, metrics[key]) || (typeof value === "number" && Math.abs(value - metrics[key]) < 1e-9));
  return {
    max, timeline, unit: problem.timeUnit, step: problem.id === "skirmish" ? 0.1 : 1,
    events: events.sort((a, b) => a.tick - b.tick), matches,
    view: { ...cursor.seek(0).view(), replay: true },
  };
}

function generate(input) {
  if (input.legacy) return { type: "legacy", trace: generateLegacyTrace(input.config, input.method) };
  const problem = problemRegistry.get(input.problem);
  const method = methodRegistry.get(input.method);
  const session = new PlatformSession(problem, input.config, method, input.options);
  const end = performance.now() + 55000;
  const check = () => {
    if (performance.now() > end) throw new Error("This seed exceeded the browser time limit. Try a smaller evaluation budget.");
  };
  const expected = (input.config.horizon ?? input.config.metroHorizon) +
    (session.environment.observe().links?.ruleDesign?.totalTurns ?? 0);
  while (!session.environment.done()) {
    session.advance(problem.id === "skirmish" ? 20 : 8, { check });
    const time = session.environment.time();
    self.postMessage({ type: "progress", time, expected, unit: problem.timeUnit });
  }
  return { type: "platform", recording: session.replay() };
}

self.onmessage = ({ data }) => {
  try {
    if (data.type === "generate") {
      self.postMessage({ type: "generated", source: generate(data.input) });
    } else if (data.type === "prepare") {
      self.postMessage({ type: "ready", analysis: prepare(data.recording) });
    } else if (data.type === "seek") {
      self.postMessage({
        type: "frame", view: { ...cursor.seek(data.tick).view(), replay: true, methodId: recording.methodId },
      });
    }
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
