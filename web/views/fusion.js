import { mount as mountMetro } from "./metro.js";
import { mount as mountSquad } from "./skirmish.js";
import { projectURL } from "../paths.js";

export function mount({ host, controls, onAction, onPause, notice }) {
  host.className = "arena fusion-view";
  controls.innerHTML = `
    <div class="fusion-flow">
      <div><strong>Metro → squad</strong><span data-flow="supply"></span></div>
      <div><strong>Squad → metro</strong><span data-flow="rail"></span></div>
    </div>`;
  const help = document.querySelector("#interaction-help");
  help.textContent =
    "Each cycle advances one metro minute and its scheduled squad ticks. ";
  const guide = document.createElement("a");
  guide.href = projectURL("docs/fusion.md");
  guide.textContent = "Fusion rules";
  help.append(guide);
  let current;
  const children = [
    ["metro", "Metro Network", mountMetro],
    ["skirmish", "Squad Tactics", mountSquad],
  ].map(([id, title, mountView]) => {
    const panel = document.createElement("section");
    panel.className = "fusion-component";
    panel.dataset.fusionComponent = id;
    panel.innerHTML = `
      <header><h3>${title}</h3><span class="badge"></span></header>
      <div class="problem-controls"></div>
      <div class="arena"></div>
      <p class="interaction-help"></p>`;
    host.append(panel);
    const status = panel.querySelector(".badge");
    const display = mountView({
      host: panel.querySelector(".arena"),
      controls: panel.querySelector(".problem-controls"),
      help: panel.querySelector(".interaction-help"),
      onAction(action) {
        if (current.replay || current.renderState.components[id].done)
          throw new Error("This component is read-only");
        return onAction({ type: "component", component: id, action });
      },
      onPause,
      notice,
    });
    return { id, status, display };
  });
  const supply = controls.querySelector('[data-flow="supply"]');
  const rail = controls.querySelector('[data-flow="rail"]');

  return {
    update(view) {
      current = view;
      const { links, components } = view.renderState;
      supply.textContent = links.supplyEnabled
        ? `${view.metrics.supportUsed.toFixed(1)} HP restored · ${links.stock.toFixed(1)} available`
        : "Supply disabled";
      rail.textContent = links.holdsEnabled
        ? `${links.heldMinutes} min held · ${links.lastHold ? "Held last cycle" : links.pressured ? "Under pressure" : "Dispatch clear"}`
        : "Dispatch holds disabled";
      for (const { id, status, display } of children) {
        const part = components[id];
        const clock =
          id === "metro" ? `${part.time} min` : `${part.time.toFixed(1)} s`;
        status.textContent =
          id === "skirmish" && links.prepRemaining
            ? `Starts in ${links.prepRemaining} cycles`
            : `${clock}${part.done ? " · Finished" : ""}`;
        display.update({
          ...part,
          observation: view.observation.components[id],
          replay: view.replay || part.done,
        });
      }
    },
    render() {
      for (const { display } of children) display.render();
    },
    dispose() {
      for (const { display } of children) display.dispose();
      host.replaceChildren();
      controls.replaceChildren();
    },
  };
}
