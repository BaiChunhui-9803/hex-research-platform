import { MapRenderer } from "../../engines/metro/web/renderer.js";
import theme from "../../engines/metro/web/themes/midnight.js";
export function mount({ host, controls, onAction, onPause, notice, help = document.querySelector("#interaction-help") }) {
  host.className = "arena metro-view";
  host.innerHTML = '<svg viewBox="0 0 1100 700" aria-label="Metro map"></svg>';
  controls.innerHTML =
    '<button data-line="A">Line A</button><button data-line="B">Line B</button><button data-line="C">Line C</button><button data-edit="clear">Clear line</button><button data-edit="undo">Undo</button><button data-edit="fit">Fit</button><span>Circle · Triangle · Square</span>';
  if (help) help.textContent =
    "Choose a line, select an endpoint, then another station. Drag a stop to replace it. Stations shared by lines allow transfers.";
  const svg = host.querySelector("svg"),
    renderer = new MapRenderer(svg),
    abort = new AbortController(),
    signal = abort.signal;
  let state,
    selected = "A",
    anchor = null,
    down = null,
    history = [];
  function select() {
    renderer.setSelected(selected, anchor);
    for (const b of controls.querySelectorAll("[data-line]"))
      b.classList.toggle("active", b.dataset.line === selected);
  }
  async function apply(plan) {
    onPause();
    const previous = structuredClone(state.plan);
    try {
      await onAction({ type: "set-plan", plan });
      history.push(previous);
      if (history.length > 30) history.shift();
    } catch (error) {
      notice(error.message, true);
    }
    anchor = null;
    select();
  }
  function station(id) {
    const plan = structuredClone(state.plan),
      line = plan.lines.find((l) => l.id === selected);
    if (line.stops.includes(id)) {
      anchor = id;
      select();
      return;
    }
    if (!line.stops.length) line.stops.push(id);
    else if (anchor === line.stops[0]) line.stops.unshift(id);
    else if (anchor === line.stops.at(-1)) line.stops.push(id);
    else {
      notice("Select an endpoint of the selected line first.");
      return;
    }
    apply(plan);
  }
  controls.addEventListener(
    "click",
    async (event) => {
      const button = event.target.closest("button");
      if (!button || !state) return;
      if (button.dataset.line) {
        selected = button.dataset.line;
        anchor = null;
        select();
      }
      if (button.dataset.edit === "clear") {
        const plan = structuredClone(state.plan);
        plan.lines.find((l) => l.id === selected).stops = [];
        apply(plan);
      }
      if (button.dataset.edit === "fit") renderer.fit();
      if (button.dataset.edit === "undo" && history.length) {
        try {
          await onAction({ type: "set-plan", plan: history.at(-1) });
          history.pop();
        } catch (error) {
          notice(error.message, true);
        }
      }
    },
    { signal },
  );
  svg.addEventListener(
    "pointerdown",
    (e) => {
      const n = e.target.closest("[data-station]");
      if (n) down = { id: n.dataset.station, x: e.clientX, y: e.clientY };
    },
    { signal },
  );
  svg.addEventListener(
    "pointerup",
    (e) => {
      if (!down || !state) return;
      const start = down;
      down = null;
      const n = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-station]");
      if (!n) return;
      const id = n.dataset.station;
      if (
        Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8 &&
        start.id !== id
      ) {
        const plan = structuredClone(state.plan),
          line = plan.lines.find((l) => l.id === selected),
          at = line.stops.indexOf(start.id);
        if (at >= 0 && !line.stops.includes(id)) {
          line.stops[at] = id;
          apply(plan);
        }
      } else station(id);
    },
    { signal },
  );
  window.addEventListener(
    "pointerup",
    () => {
      down = null;
    },
    { signal },
  );
  svg.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const n = e.target.closest("[data-station]");
        if (n) {
          e.preventDefault();
          station(n.dataset.station);
        }
      }
    },
    { signal },
  );
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      renderer.setZoom(e.deltaY > 0 ? -0.08 : 0.08);
    },
    { signal, passive: false },
  );
  return {
    update(view) {
      state = view.renderState;
      if (!renderer.state) {
        renderer.mount(state, theme);
        select();
      } else {
        renderer.state = state;
        renderer.drawNetwork();
        renderer.updateStations();
      }
    },
    render() {
      if (state) renderer.animate();
    },
    dispose() {
      abort.abort();
      host.innerHTML = "";
      controls.innerHTML = "";
    },
  };
}
