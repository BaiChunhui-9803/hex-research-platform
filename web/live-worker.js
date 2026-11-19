import { problemRegistry } from "../problems/index.js";
import { methodRegistry } from "../methods/index.js";
import { PlatformSession } from "../core/session.js";
import { integer } from "../core/random.js";
let session;
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
      payload = session.view();
    } else if (type === "step")
      payload = session.advance(integer(data.steps, 1, 1, 1000, "Steps"));
    else if (type === "action") {
      session.apply(data.action);
      payload = session.view();
    } else if (type === "method") {
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
    } else if (type === "export") payload = session.replay();
    else throw new Error("Unknown live-worker request");
    self.postMessage({ id, payload });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
