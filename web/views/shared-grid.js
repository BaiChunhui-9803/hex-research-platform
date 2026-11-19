import { cells, key, point } from "../../engines/skirmish/shared/hex.js";
import { currentPosition } from "../../engines/skirmish/shared/battle.js";

const surfaces = { forest: "#c2d9cd", hill: "#e9dab1", rock: "#8b9a9e", water: "#bad1df" };
const lineColors = { A: "#2b8e7c", B: "#a65d39", C: "#6b6db0" };
const teamColors = { blue: "#3568bd", orange: "#c15f34", violet: "#8b53a1" };
const angle = Array.from({ length: 6 }, (_, i) => (i * 60 - 30) * Math.PI / 180);

export function makeSharedGrid(host) {
  const panel = document.createElement("section");
  panel.className = "fusion-shared-grid";
  panel.hidden = true;
  panel.innerHTML = `
    <header><h3>Shared map</h3><span class="badge" data-rule-variant></span></header>
    <canvas width="930" height="400" role="img" aria-label="Tracks, stations and squads on a common hex grid"></canvas>
    <p class="interaction-help">Dark shapes are stations. Teal rings show supplies. Train markers turn red when held this cycle. Colored circles are squad units.</p>`;
  host.prepend(panel);
  const badge = panel.querySelector("[data-rule-variant]");
  const canvas = panel.querySelector("canvas");
  const ctx = canvas.getContext("2d");

  return {
    update({ links, components }) {
      panel.hidden = !links.spatial;
      if (!links.spatial) return;
      const { variant, selectedBy } = links.spatial;
      const selector = {
        "capability-priority": "Capability selection", "layout-adaptive": "Layout-adaptive",
        "feature-compiler": "Feature-compiled",
        pilot: "Pilot selection", "frozen-variant": "Fixed variant",
      }[selectedBy];
      badge.textContent = `${selector} · ${variant}`;
      const metro = components.metro.renderState;
      const squad = components.skirmish.renderState;
      const map = squad.scenario.map;
      const positions = cells(map).map((cell) => ({ cell, ...point(cell) }));
      const left = Math.min(...positions.map(({ x }) => x));
      const top = Math.min(...positions.map(({ y }) => y));
      const width = Math.max(...positions.map(({ x }) => x)) - left + 2;
      const height = Math.max(...positions.map(({ y }) => y)) - top + 2;
      const scale = Math.min((canvas.width - 35) / width, (canvas.height - 24) / height);
      const x0 = (canvas.width - (width - 2) * scale) / 2 - left * scale;
      const y0 = (canvas.height - (height - 2) * scale) / 2 - top * scale;
      const convert = ({ x, y }) => [x * scale + x0, y * scale + y0];
      ctx.fillStyle = "#f4f6f2";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const position of positions) {
        const [cx, cy] = convert(position);
        ctx.beginPath();
        angle.forEach((a, i) => ctx[i === 0 ? "moveTo" : "lineTo"](cx + Math.cos(a) * scale, cy + Math.sin(a) * scale));
        ctx.closePath();
        ctx.fillStyle = surfaces[map.terrain[key(position.cell)]] ?? "#f0f2e9";
        ctx.strokeStyle = "#d6ddd4";
        ctx.lineWidth = 0.8;
        ctx.fill();
        ctx.stroke();
      }
      for (const [line, segments] of Object.entries(metro.network.paths)) {
        ctx.strokeStyle = lineColors[line] ?? "#315a73";
        ctx.lineWidth = 3.2;
        ctx.lineJoin = "round";
        for (const segment of segments) {
          ctx.beginPath();
          segment.cells.forEach((cell, i) => ctx[i === 0 ? "moveTo" : "lineTo"](...convert(point(cell))));
          ctx.stroke();
        }
      }
      for (const station of Object.values(metro.stations)) {
        if (!station.active) continue;
        const [x, y] = convert(point(station));
        if (links.stationStocks[station.id]) {
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#008e81";
          ctx.stroke();
        }
        ctx.fillStyle = "#263a48";
        ctx.beginPath();
        if (station.shape === "circle") ctx.arc(x, y, 4, 0, Math.PI * 2);
        else if (station.shape === "triangle") {
          ctx.moveTo(x, y - 5);
          ctx.lineTo(x + 5, y + 4);
          ctx.lineTo(x - 5, y + 4);
          ctx.closePath();
        } else ctx.rect(x - 4, y - 4, 8, 8);
        ctx.fill();
      }
      for (const train of metro.trains) {
        const index = train.direction === 1 ? train.index : train.index - 1;
        const segment = metro.network.paths[train.line][index];
        if (!segment) continue;
        const route = segment.cells;
        const progress = train.direction === 1 ? train.progress : 1 - train.progress;
        const position = Math.max(0, Math.min(1, progress)) * (route.length - 1);
        const start = Math.floor(position);
        const a = point(route[start]), b = point(route[Math.min(start + 1, route.length - 1)]);
        const [x, y] = convert({ x: a.x + (b.x - a.x) * (position - start), y: a.y + (b.y - a.y) * (position - start) });
        const held = links.lastHeldLines.includes(train.line);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = held ? "#b33d31" : lineColors[train.line];
        ctx.lineWidth = held ? 3 : 2;
        ctx.beginPath();
        ctx.roundRect(x - 6, y - 4, 12, 8, 2);
        ctx.fill();
        ctx.stroke();
      }
      for (const unit of squad.units) {
        if (unit.hp <= 0) continue;
        const [x, y] = convert(point(currentPosition(unit)));
        ctx.fillStyle = teamColors[unit.team] ?? "#60486a";
        ctx.beginPath();
        ctx.arc(x + 4, y - 4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
    },
  };
}
