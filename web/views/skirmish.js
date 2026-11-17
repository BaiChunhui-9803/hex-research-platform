import { BattlefieldRenderer } from "../../engines/skirmish/web/renderer.js";
export function mount({ host, controls, onAction, onPause, notice, help = document.querySelector("#interaction-help") }) {
  host.className = "arena skirmish-view";
  host.innerHTML =
    '<canvas tabindex="0" aria-label="Squad battlefield"></canvas>';
  controls.innerHTML =
    '<button data-order="select">Select all</button><button data-order="attackMove" class="active">Attack-move [A]</button><button data-order="move">Move [M]</button><button data-order="hold">Hold [H]</button><button data-order="fit">Fit</button><span id="selection-status">No units selected</span>';
  if (help) help.textContent =
    "Click or drag to select your units. Shift adds to selection. Right-click an enemy to focus fire or the ground to move. Scroll to zoom; middle-drag to pan.";
  const canvas = host.querySelector("canvas"),
    renderer = new BattlefieldRenderer(canvas),
    abort = new AbortController(),
    signal = abort.signal;
  let view,
    mode = "attackMove",
    down = null;
  const point = (e) => {
    const b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  function selected() {
    controls.querySelector("#selection-status").textContent =
      `${renderer.selection.size} units selected`;
  }
  async function send(order) {
    if (!renderer.selection.size) {
      notice("Select your units first.");
      return;
    }
    try {
      await onAction({
        type: "commands",
        orders: [{ unitIds: [...renderer.selection], ...order }],
      });
    } catch (error) {
      notice(error.message, true);
    }
  }
  function selectAll() {
    renderer.selection = new Set(view.observation.own.map((u) => u.id));
    selected();
  }
  function choose(action) {
    if (action === "select") selectAll();
    else if (action === "fit") renderer.fit();
    else if (action === "hold") send({ type: "hold" });
    else {
      mode = action;
      for (const b of controls.querySelectorAll("[data-order]"))
        b.classList.toggle("active", b.dataset.order === mode);
    }
  }
  controls.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest("[data-order]");
      if (b && view && !view.replay) choose(b.dataset.order);
    },
    { signal },
  );
  canvas.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (!view || view.replay) return;
      canvas.focus();
      const p = point(e);
      if (e.button === 2) {
        const target = renderer.hitUnit(p.x, p.y);
        if (target && target.team !== view.config.team)
          send({ type: "attack", targetId: target.id });
        else {
          const cell = renderer.toCell(p.x, p.y);
          renderer.mark(cell);
          send({ type: mode, target: cell });
        }
        return;
      }
      down = {
        ...p,
        button: e.button,
        shift: e.shiftKey,
        pan: { ...renderer.pan },
        alt: e.altKey,
      };
      canvas.setPointerCapture(e.pointerId);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (!view) return;
      const p = point(e);
      renderer.hoverCell = renderer.toCell(p.x, p.y);
      renderer.hoverUnit = renderer.hitUnit(p.x, p.y);
      if (down && (down.button === 1 || down.alt))
        renderer.pan = {
          x: down.pan.x + p.x - down.x,
          y: down.pan.y + p.y - down.y,
        };
      else if (down && Math.hypot(p.x - down.x, p.y - down.y) > 5)
        renderer.box = { x1: down.x, y1: down.y, x2: p.x, y2: p.y };
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerup",
    (e) => {
      if (!down || !view) return;
      const p = point(e),
        start = down;
      down = null;
      if (start.button !== 0 || start.alt) {
        renderer.box = null;
        return;
      }
      let units;
      if (renderer.box)
        units = renderer
          .inBox(renderer.box)
          .filter((u) => u.team === view.config.team);
      else {
        const unit = renderer.hitUnit(p.x, p.y);
        units = unit?.team === view.config.team ? [unit] : [];
      }
      if (!start.shift) renderer.selection.clear();
      for (const u of units)
        if (start.shift && renderer.selection.has(u.id))
          renderer.selection.delete(u.id);
        else renderer.selection.add(u.id);
      renderer.box = null;
      selected();
    },
    { signal },
  );
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = point(e);
      renderer.zoomAt(e.deltaY > 0 ? 0.92 : 1.08, p.x, p.y);
    },
    { signal, passive: false },
  );
  window.addEventListener(
    "keydown",
    (e) => {
      if (!view || view.replay || document.activeElement !== canvas) return;
      if (e.ctrlKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (e.key.toLowerCase() === "a") choose("attackMove");
      else if (e.key.toLowerCase() === "m") choose("move");
      else if (e.key.toLowerCase() === "h") choose("hold");
      else if (e.key === "Escape") {
        renderer.selection.clear();
        selected();
      }
    },
    { signal },
  );
  return {
    update(next) {
      view = next;
      if (!renderer.state) renderer.mount(next.renderState);
      else renderer.state = next.renderState;
      const alive = new Set(next.observation.own.map((u) => u.id));
      for (const id of renderer.selection)
        if (!alive.has(id)) renderer.selection.delete(id);
      selected();
    },
    render() {
      renderer.render();
    },
    dispose() {
      abort.abort();
      renderer.resizeObserver.disconnect();
      host.innerHTML = "";
      controls.innerHTML = "";
    },
  };
}
