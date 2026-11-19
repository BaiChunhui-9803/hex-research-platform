import { SHAPE_LABELS } from "../shared/catalogs/names.en.js";
import { cells, hexPoint } from "../shared/hex.js";
import { compilePlan } from "../shared/network.js";
import { scenarioAt } from "../shared/scenarios.js";
import { escapeHTML } from "./icons.js";
const SIZE = 34;
const point = (cell) => {
  const p = hexPoint(cell, SIZE);
  return { x: p.x + 550, y: p.y + 350 };
};
const points = (route) =>
  route
    .map((c) => {
      const p = point(c);
      return `${p.x},${p.y}`;
    })
    .join(" ");
export function shapeSVG(shape, size = 12, attrs = "") {
  return shape === "circle"
    ? `<circle r="${size}" ${attrs}/>`
    : shape === "square"
      ? `<rect x="${-size * 0.87}" y="${-size * 0.87}" width="${size * 1.74}" height="${size * 1.74}" rx="1" ${attrs}/>`
      : `<path d="M0 ${-size * 1.1}L${size * 1.05} ${size * 0.85}H${-size * 1.05}Z" ${attrs}/>`;
}
export class MapRenderer {
  constructor(svg) {
    this.svg = svg;
    this.zoom = 1;
    this.anchor = null;
    this.selected = "A";
    this.preview = null;
  }
  mount(state, theme) {
    this.state = state;
    this.theme = theme;
    this.anchor = null;
    this.preview = null;
    this.zoom = 1;
    this.svg.innerHTML = `<defs><filter id="station-shadow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".08"/></filter></defs><g id="map-world"><g id="hex-grid"></g><g id="districts" aria-hidden="true"></g><g id="tracks"></g><g id="ghost-tracks"></g><g id="hover-track"></g><g id="stations"></g><g id="trains" pointer-events="none"></g></g>`;
    this.world = this.svg.querySelector("#map-world");
    this.svg.querySelector("#hex-grid").innerHTML = cells(state.scenario.map)
      .map((c) => {
        const p = point(c),
          corners = Array.from({ length: 6 }, (_, i) => {
            const a = ((30 + 60 * i) * Math.PI) / 180;
            return `${p.x + SIZE * Math.cos(a)},${p.y + SIZE * Math.sin(a)}`;
          });
        return `<polygon class="hex-cell" points="${corners.join(" ")}"/>`;
      })
      .join("");
    this.svg.querySelector("#districts").innerHTML = [
      [270, 130, "NORTHRIDGE"],
      [800, 135, "EAST GARDEN"],
      [250, 564, "OLD TOWN"],
      [820, 572, "SUNSET DISTRICT"],
    ]
      .map(
        ([x, y, t]) =>
          `<text class="district" x="${x}" y="${y}" text-anchor="middle">${t}</text>`,
      )
      .join("");
    this.stationNodes = {};
    this.svg.querySelector("#stations").innerHTML = state.scenario.stations
      .map((s) => {
        const p = point(s);
        return `<g class="station-group" data-station="${s.id}" tabindex="0" role="button" aria-label="${escapeHTML(s.name)}, ${SHAPE_LABELS[s.shape]} station" transform="translate(${p.x},${p.y})"><circle class="station-hit" r="30"/><circle class="anchor-halo" r="23"/><circle class="station-ring" r="19"/>${shapeSVG(s.shape, 12, 'class="station-body" filter="url(#station-shadow)"')}<g class="station-passengers" pointer-events="none"></g><text class="station-label" y="36">${escapeHTML(s.name)}</text></g>`;
      })
      .join("");
    this.svg
      .querySelectorAll("[data-station]")
      .forEach((n) => (this.stationNodes[n.dataset.station] = n));
    this.svg.querySelector("#trains").innerHTML = ["A", "B", "C"]
      .map(
        (id) =>
          `<g data-train="${id}" opacity="0"><rect class="train-car" x="-13" y="-7" width="26" height="14" rx="4" fill="${theme.routes[id]}"/><rect class="train-window" x="7" y="-4" width="3" height="8" rx="1"/><text class="train-load" x="-3" y="3" text-anchor="middle" fill="${theme.tokens.train}" font-size="8" font-family="sans-serif" font-weight="600"></text></g>`,
      )
      .join("");
    this.drawNetwork();
    this.updateStations();
  }
  setTheme(theme) {
    this.theme = theme;
    this.drawNetwork();
    for (const id of ["A", "B", "C"])
      this.svg
        .querySelector(`[data-train="${id}"] .train-car`)
        ?.setAttribute("fill", theme.routes[id]);
  }
  setSelected(line, anchor = null) {
    this.selected = line;
    this.anchor = anchor;
    this.drawNetwork();
    this.updateStations();
  }
  setZoom(delta) {
    this.zoom = Math.min(1.65, Math.max(0.7, this.zoom + delta));
    this.world.setAttribute(
      "transform",
      `translate(550 345) scale(${this.zoom}) translate(-550 -345)`,
    );
  }
  fit() {
    this.zoom = 1;
    this.setZoom(0);
  }
  drawNetwork() {
    const network = this.state.network;
    this.svg.querySelector("#tracks").innerHTML = this.state.plan.lines
      .map((l, i) => {
        const all = (network.paths[l.id] ?? []).flatMap((s, j) =>
          j ? s.cells.slice(1) : s.cells,
        );
        return `<polyline class="metro-line ${this.selected === l.id ? "selected-line" : ""}" points="${points(all)}" stroke="${this.theme.routes[l.id]}" transform="translate(${(i - 1) * 2},${(i - 1) * -2})" style="opacity:${this.preview ? 0.22 : 1}"/>`;
      })
      .join("");
    const ghost = this.svg.querySelector("#ghost-tracks");
    ghost.innerHTML = this.preview
      ? this.preview.plan.lines
          .map((l) => {
            const all = (this.preview.network.paths[l.id] ?? []).flatMap(
              (s, j) => (j ? s.cells.slice(1) : s.cells),
            );
            return `<polyline class="metro-line" points="${points(all)}" stroke="${this.theme.routes[l.id]}" stroke-dasharray="12 7"/>`;
          })
          .join("")
      : "";
  }
  setPreview(result) {
    this.preview = result
      ? { ...result, network: compilePlan(this.state.scenario, result.plan) }
      : null;
    this.drawNetwork();
  }
  hover(id) {
    const layer = this.svg.querySelector("#hover-track");
    layer.innerHTML = "";
    if (!this.anchor || !id || id === this.anchor) return;
    const plan = structuredClone(this.state.plan);
    const line = plan.lines.find(({ id: key }) => key === this.selected);
    if (!line || line.stops.includes(id)) return;
    if (!line.stops.length) line.stops = [this.anchor, id];
    else if (this.anchor === line.stops.at(-1)) line.stops.push(id);
    else if (this.anchor === line.stops[0]) line.stops.unshift(id);
    else return;
    const compiled = compilePlan(scenarioAt(this.state.scenario, this.state.time), plan);
    const route = compiled.valid ? compiled.paths[line.id].find(({ from, to }) =>
      (from === this.anchor && to === id) || (to === this.anchor && from === id))?.cells : null;
    if (route)
      layer.innerHTML = `<polyline class="metro-line" points="${points(route)}" stroke="${this.theme.routes[this.selected]}" stroke-dasharray="4 8" opacity=".45"/>`;
  }
  updateStations() {
    for (const s of Object.values(this.state.stations)) {
      const n = this.stationNodes[s.id];
      n.style.display = s.active ? "" : "none";
      n.setAttribute("aria-hidden", String(!s.active));
      n.setAttribute("tabindex", s.active ? "0" : "-1");
      if (!s.active) continue;
      n.classList.toggle("anchor", s.id === this.anchor);
      n.classList.toggle("crowded", s.queue.length >= 14);
      n.classList.toggle("critical", s.queue.length >= 20);
      n.querySelector(".station-passengers").innerHTML =
        s.queue
          .slice(0, 8)
          .map(
            (p, i) =>
              `<g transform="translate(${22 + (i % 4) * 7},${-6 + Math.floor(i / 4) * 8})">${shapeSVG(p.shape, 2.5, 'class="passenger"')}</g>`,
          )
          .join("") +
        (s.queue.length > 8
          ? `<text x="23" y="16" font-size="8" fill="${this.theme.tokens.muted}">+${s.queue.length - 8}</text>`
          : "");
      n.setAttribute("aria-label", `${s.name}, ${s.queue.length} waiting`);
    }
  }
  animate(alpha = 0, running = false) {
    for (const id of ["A", "B", "C"])
      this.svg
        .querySelector(`[data-train="${id}"]`)
        .setAttribute("opacity", "0");
    if (this.preview) return;
    for (const train of this.state.trains) {
      const segments = this.state.network.paths[train.line],
        segment =
          segments[train.direction === 1 ? train.index : train.index - 1];
      if (!segment) continue;
      const route =
        train.direction === 1 ? segment.cells : [...segment.cells].reverse();
      const progress = Math.min(
        1,
        train.progress +
          (running && !train.dwell ? alpha / Math.max(1, segment.duration) : 0),
      );
      const v = progress * (route.length - 1),
        index = Math.min(route.length - 2, Math.floor(v)),
        fraction = v - index;
      const a = point(route[index]),
        b = point(route[index + 1]);
      const n = this.svg.querySelector(`[data-train="${train.line}"]`);
      n.setAttribute(
        "transform",
        `translate(${a.x + (b.x - a.x) * fraction},${a.y + (b.y - a.y) * fraction}) rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI})`,
      );
      n.setAttribute("opacity", "1");
      n.querySelector(".train-load").textContent =
        train.passengers.length || "";
    }
  }
}
