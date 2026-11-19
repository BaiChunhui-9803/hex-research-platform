import { mount as mountMetro } from "./metro.js";
import { mount as mountSquad } from "./skirmish.js";
import { projectURL } from "../paths.js";
import { makeSharedGrid } from "./shared-grid.js";
import { factionName } from "../portal/data.js";

export function mount({ host, controls, onAction, onPause, notice, help = document.querySelector("#interaction-help"), readOnly = false }) {
  host.className = "arena fusion-view";
  controls.innerHTML = `
    <div class="fusion-flow">
      <div><strong data-flow-title="supply">Metro → squad</strong><span data-flow="supply"></span></div>
      <div><strong data-flow-title="rail">Squad → metro</strong><span data-flow="rail"></span></div>
    </div>
    <div class="fusion-draft-status" data-draft-status hidden></div>
    <div class="fusion-draft-form" data-draft-form hidden>
      <label>Suggested legal link<select data-draft-options></select></label>
      <button type="button" data-draft-action="place">Place link</button>
      <button type="button" data-draft-action="pass">Pass turn</button>
    </div>`;
  if (help) {
    help.textContent = "Each cycle advances one metro minute and its scheduled squad ticks. ";
    const guide = document.createElement("a");
    guide.href = projectURL("docs/fusion.md");
    guide.textContent = "Fusion rules";
    help.append(guide);
  }
  const sharedGrid = makeSharedGrid(host);
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
    const partControls = panel.querySelector(".problem-controls");
    const display = mountView({
      host: panel.querySelector(".arena"),
      controls: partControls,
      help: panel.querySelector(".interaction-help"),
      readOnly,
      onAction(action) {
        if (current.replay || current.renderState.components[id].done)
          throw new Error("This component is read-only");
        return onAction({ type: "component", component: id, action });
      },
      onPause,
      notice,
    });
    return { id, status, display, partControls };
  });
  const supply = controls.querySelector('[data-flow="supply"]');
  const rail = controls.querySelector('[data-flow="rail"]');
  const supplyTitle = controls.querySelector('[data-flow-title="supply"]');
  const railTitle = controls.querySelector('[data-flow-title="rail"]');
  const draftStatus = controls.querySelector("[data-draft-status]");
  const draftForm = controls.querySelector("[data-draft-form]");
  const options = controls.querySelector("[data-draft-options]");
  const abort = new AbortController();
  draftForm.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-draft-action]");
    const design = current?.renderState.links.ruleDesign;
    if (!button || !design || current.replay || button.disabled) return;
    const action = button.dataset.draftAction === "pass"
      ? { type: "pass-turn", team: design.active }
      : design.actions[Number(options.value)]?.action;
    if (!action) return;
    try {
      onPause();
      await onAction(action);
    } catch (error) {
      notice(error.message, true);
    }
  }, { signal: abort.signal });

  function draftView(design, links, replay) {
    draftStatus.hidden = !design;
    draftForm.hidden = !design || replay || design.phase !== "build" || design.active === "neutral" || design.committed;
    if (!design) return;
    const recoveries = Object.entries(design.recovered)
      .map(([team, value]) => `${factionName(team)} ${value.toFixed(1)} HP`).join(" · ");
    supplyTitle.textContent = "Public station supply";
    supply.textContent = links.supplyEnabled ? `${links.stock.toFixed(1)} HP waiting · ${recoveries}` : "Public supply disabled";
    railTitle.textContent = "Construction and service";
    rail.textContent = design.phase === "build" ? "Service pauses during construction" : "Public tracks locked";
    if (design.phase === "build") {
      const name = design.active === "neutral" ? "Neutral planner" : factionName(design.active);
      const budget = design.active === "neutral" ? "" : ` · ${design.quota - design.spent[design.active]} edges left`;
      draftStatus.textContent = `Construction turn ${design.turn + 1}/${design.totalTurns} · ${name}${budget}${design.committed ? " · committed. Step to the next turn." : ""}`;
    } else {
      const built = Object.entries(design.contributions)
        .map(([team, count]) => `${factionName(team)} ${count}`).join(" · ");
      draftStatus.textContent = `Operation · links placed ${built}`;
    }
    if (!draftForm.hidden) {
      const selected = options.value;
      const legal = design.actions.map((move, i) => ({ ...move, i })).filter(({ action }) => action.type === "place-track");
      options.replaceChildren(...legal.map(({ label, i }) => new Option(label, i)));
      if (legal.some(({ i }) => String(i) === selected)) options.value = selected;
      draftForm.querySelector('[data-draft-action="place"]').disabled = !legal.length;
    }
  }

  return {
    update(view) {
      current = view;
      const { links, components } = view.renderState;
      const design = links.ruleDesign;
      sharedGrid.update(view.renderState);
      draftView(design, links, view.replay || readOnly);
      if (!design) {
        supplyTitle.textContent = "Metro → squad";
        railTitle.textContent = "Squad → metro";
        supply.textContent = links.supplyEnabled
          ? `${view.metrics.supportUsed.toFixed(1)} HP restored · ${links.stock.toFixed(1)} available`
          : "Supply disabled";
        rail.textContent = links.holdsEnabled
          ? (links.spatial
            ? `${links.heldTrainMinutes} train-min delayed · ${links.lastHold ? "Local delay last cycle" : "Dispatch clear"}`
            : `${links.heldMinutes} min held · ${links.lastHold ? "Held last cycle" : links.pressured ? "Under pressure" : "Dispatch clear"}`)
          : "Dispatch holds disabled";
      }
      for (const { id, status, display, partControls } of children) {
        const part = components[id];
        const clock =
          id === "metro" ? `${part.time} min` : `${part.time.toFixed(1)} s`;
        const paused = design && (id === "metro" || design.phase === "build" || links.prepRemaining > 0);
        partControls.hidden = Boolean(paused && !view.replay);
        status.textContent =
          id === "skirmish" && links.prepRemaining
            ? `Starts in ${links.prepRemaining} cycles`
            : `${clock}${part.done ? " · Finished" : ""}`;
        display.update({
          ...part,
          observation: view.observation.components[id],
          replay: view.replay || part.done || Boolean(paused),
        });
      }
    },
    render() {
      if (host.dataset.mapMode !== "shared")
        for (const { display } of children) display.render();
    },
    dispose() {
      abort.abort();
      for (const { display } of children) display.dispose();
      host.replaceChildren();
      controls.replaceChildren();
    },
  };
}
