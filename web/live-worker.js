import { problemRegistry } from "../problems/index.js";
import { methodRegistry } from "../methods/index.js";
import { PlatformSession, replaySession } from "../core/session.js";
import { integer } from "../core/random.js";
let session,
  recording = null,
  cursor = 0;
function applyCurrentActions() {
  while (
    cursor < recording.actions.length &&
    recording.actions[cursor].step === session.environment.tick()
  ) {
    const entry = recording.actions[cursor++];
    if (entry.kind === "solution") session.environment.acceptSolution(entry.value);
    else if (entry.kind === "action") session.environment.apply(entry.value);
    else if (entry.kind === "control") session.environment.clearSolution();
    else throw new Error("Unknown replay event");
  }
}
function replayStep(steps) {
  for (
    let i = 0;
    i < steps &&
    !session.environment.done() &&
    session.environment.tick() < recording.finalStep;
    i++
  ) {
    applyCurrentActions();
    session.environment.advance();
  }
  if (session.environment.tick() === recording.finalStep) applyCurrentActions();
  const view = session.view();
  view.replay = true;
  view.done ||= view.tick >= recording.finalStep;
  return view;
}
self.onmessage = (event) => {
  const { id, type, ...data } = event.data;
  try {
    let payload;
    if (type === "init") {
      session = new PlatformSession(
        problemRegistry.get(data.problemId),
        data.config,
        null,
        { evaluations: data.evaluations, populationSize: data.populationSize },
      );
      recording = null;
      payload = session.view();
    } else if (type === "load-replay") {
      recording = {
        ...data.recording,
        actions: [...data.recording.actions].sort((a, b) => a.step - b.step),
      };
      session = replaySession(
        problemRegistry.get(recording.problemId),
        recording,
        0,
      );
      cursor = recording.finalStep === 0 ? recording.actions.length : 0;
      payload = { ...session.view(), replay: true };
      payload.done ||= recording.finalStep === 0;
    } else if (type === "step")
      payload = recording
        ? replayStep(integer(data.steps, 1, 1, 1000, "Steps"))
        : session.advance(integer(data.steps, 1, 1, 1000, "Steps"));
    else if (type === "action") {
      if (recording) throw new Error("Replay is read-only; reset to play");
      session.apply(data.action);
      payload = session.view();
    } else if (type === "method") {
      if (recording) throw new Error("Replay is read-only; reset to play");
      session.options.evaluations = integer(
        data.evaluations,
        128,
        1,
        4096,
        "Evaluations",
      );
      session.options.populationSize = integer(
        data.populationSize,
        0,
        0,
        128,
        "Population size",
      );
      if (data.methodId) session.setMethod(methodRegistry.get(data.methodId));
      else session.takeControl();
      payload = session.view();
    } else if (type === "export") payload = recording ?? session.replay();
    else throw new Error("Unknown live-worker request");
    self.postMessage({ id, payload });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
