import { cells, point, fromPoint, distance, key } from "../shared/hex.js";
import { terrainAt, walkable, lineOfSight } from "../shared/terrain.js";
import { currentPosition, living } from "../shared/battle.js";
import { UNIT_TYPES, TEAMS } from "../shared/units.js";
import { theme } from "./theme.js";

const noise = (q, r, seed = 26) => {
  let v = Math.imul(q + 93, 374761393) ^ Math.imul(r + 79, 668265263) ^ seed;
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
};
function hex(ctx, x, y, size) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = ((30 + i * 60) * Math.PI) / 180;
    const px = x + Math.cos(angle) * size,
      py = y + Math.sin(angle) * size;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
function roundRect(ctx, x, y, w, h, r = 4) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
export class BattlefieldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.width = 0;
    this.height = 0;
    this.baseSize = 20;
    this.selection = new Set();
    this.hoverCell = null;
    this.hoverUnit = null;
    this.box = null;
    this.marker = null;
    this.command = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
  }
  mount(state) {
    this.state = state;
    this.mapCells = cells(state.scenario.map);
    this.fit();
  }
  resize() {
    const box = this.canvas.getBoundingClientRect();
    this.width = box.width || 800;
    this.height = box.height || 600;
    const ratio = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ratio = ratio;
    this.baseSize = Math.min(
      (this.width - 30) / 36.8,
      (this.height - 160) / 20,
    );
  }
  fit() {
    this.zoom = this.width < 500 ? 1.3 : 1;
    this.pan = { x: 0, y: 0 };
  }
  get size() {
    return this.baseSize * this.zoom;
  }
  get center() {
    return {
      x: this.width / 2 + this.pan.x,
      y: this.height * 0.535 + this.pan.y,
    };
  }
  toScreen(cell) {
    const p = point(cell, this.size),
      center = this.center;
    return { x: p.x + center.x, y: p.y + center.y };
  }
  toCell(x, y) {
    const center = this.center;
    return fromPoint(x - center.x, y - center.y, this.size);
  }
  zoomAt(factor, x = this.width / 2, y = this.height / 2) {
    const center = this.center,
      old = this.size,
      wx = (x - center.x) / old,
      wy = (y - center.y) / old;
    this.zoom = Math.max(0.6, Math.min(2.5, this.zoom * factor));
    this.pan.x = x - this.width / 2 - wx * this.size;
    this.pan.y = y - this.height * 0.535 - wy * this.size;
  }
  hitUnit(x, y, alpha = 0) {
    return (
      living(this.state)
        .map((unit) => {
          const p = this.toScreen(currentPosition(unit, alpha));
          return { unit, d: Math.hypot(x - p.x, y - p.y) };
        })
        .filter(
          ({ unit, d }) =>
            d < Math.max(12, this.size * (UNIT_TYPES[unit.type].radius + 0.18)),
        )
        .sort((a, b) => a.d - b.d)[0]?.unit ?? null
    );
  }
  inBox(box) {
    return living(this.state).filter((unit) => {
      const p = this.toScreen(currentPosition(unit));
      return (
        p.x >= Math.min(box.x1, box.x2) &&
        p.x <= Math.max(box.x1, box.x2) &&
        p.y >= Math.min(box.y1, box.y2) &&
        p.y <= Math.max(box.y1, box.y2)
      );
    });
  }
  mark(cell, type = "move") {
    this.marker = { cell, type, at: performance.now() };
  }
  render(alpha = 0, running = false) {
    if (!this.state) return;
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = theme.map.background;
    ctx.fillRect(0, 0, w, h);
    const background = ctx.createRadialGradient(
      w * 0.5,
      h * 0.48,
      10,
      w * 0.5,
      h * 0.5,
      w * 0.8,
    );
    background.addColorStop(0, "#44523b");
    background.addColorStop(1, "#17241f");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    this.drawTiles();
    this.drawDeployment();
    this.drawOrders(alpha);
    this.drawCorpses();
    for (const unit of [...living(this.state)].sort(
      (a, b) =>
        this.toScreen(currentPosition(a, alpha)).y -
        this.toScreen(currentPosition(b, alpha)).y,
    ))
      this.drawUnit(unit, alpha, running);
    this.drawEffects(alpha, running);
    this.drawOverlay();
    this.drawMinimap();
    const vignette = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.25,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.7,
    );
    vignette.addColorStop(0, "#0000");
    vignette.addColorStop(1, "#0a181b88");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    // Subtle corner registration marks give the map a field-display frame.
    ctx.strokeStyle = "#c2c6a43b";
    ctx.lineWidth = 1;
    for (const [x, y, sx, sy] of [
      [10, 10, 1, 1],
      [w - 10, 10, -1, 1],
      [10, h - 10, 1, -1],
      [w - 10, h - 10, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * 12);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * 12, y);
      ctx.stroke();
    }
  }
  drawTiles() {
    const ctx = this.ctx,
      map = this.state.scenario.map,
      size = this.size;
    for (const cell of this.mapCells) {
      const p = this.toScreen(cell);
      if (
        p.x < -size ||
        p.y < -size ||
        p.x > this.width + size ||
        p.y > this.height + size
      )
        continue;
      const type = map.terrain[key(cell)] ?? "plain",
        n = noise(cell.q, cell.r, this.state.scenario.seed);
      hex(ctx, p.x, p.y, size - 0.2);
      if (type === "plain")
        ctx.fillStyle = `hsl(${95 + n * 10} ${12 + n * 7}% ${21 + n * 4}%)`;
      else ctx.fillStyle = theme.map[type] ?? theme.map.plain;
      ctx.fill();
      ctx.strokeStyle = type === "rock" ? "#8d93713b" : "#a8b48b15";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      if (type === "forest") this.drawForest(p, size, n);
      if (type === "hill") {
        ctx.strokeStyle = "#c4c58a35";
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.moveTo(p.x - size * 0.48, p.y + size * (0.12 + i * 0.22));
          ctx.lineTo(p.x, p.y - size * (0.2 - i * 0.22));
          ctx.lineTo(p.x + size * 0.48, p.y + size * (0.12 + i * 0.22));
          ctx.stroke();
        }
      }
      if (type === "rock") this.drawRock(p, size, n);
      if (type === "plain" && n > 0.6) {
        ctx.strokeStyle = "#7e8e6133";
        ctx.lineWidth = 0.7;
        for (let i = 0; i < 3; i++) {
          const x = p.x + (i - 1) * size * 0.35,
            y = p.y + (n - 0.5) * size * 0.8;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + size * 0.12, y - size * 0.07);
          ctx.stroke();
        }
      }
    }
    // Sparse survey coordinates remain attached to the grid when zooming.
    ctx.font = "7px Consolas, monospace";
    ctx.fillStyle = "#b3c0963d";
    ctx.textAlign = "center";
    for (let q = -8; q <= 8; q += 4) {
      const p = this.toScreen({ q, r: 5 });
      ctx.fillText(String(q + 10).padStart(2, "0"), p.x, p.y + size * 1.2);
    }
  }
  drawForest(p, size, n) {
    const ctx = this.ctx;
    for (const [dx, dy, scale] of [
      [-0.38, 0.04, 0.8],
      [0.3, 0.22, 0.85],
      [0, -0.28, 1],
    ]) {
      const x = p.x + dx * size,
        y = p.y + dy * size,
        s = size * 0.4 * scale;
      ctx.fillStyle = "#12271b70";
      ctx.beginPath();
      ctx.ellipse(x + 2, y + 5, s * 0.8, s * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#283827";
      ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + s * 0.6);
      ctx.stroke();
      polygon(ctx, [
        [x, y - s],
        [x - s * 0.7, y + s * 0.35],
        [x + s * 0.7, y + s * 0.35],
      ]);
      ctx.fillStyle = n > 0.5 ? "#3d5b3f" : "#304b36";
      ctx.fill();
      ctx.strokeStyle = "#78916633";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      polygon(ctx, [
        [x, y - s * 0.4],
        [x - s * 0.8, y + s * 0.65],
        [x + s * 0.8, y + s * 0.65],
      ]);
      ctx.fillStyle = "#29432f";
      ctx.fill();
    }
  }
  drawRock(p, size, n) {
    const ctx = this.ctx;
    ctx.fillStyle = "#15221a99";
    ctx.beginPath();
    ctx.ellipse(
      p.x + 3,
      p.y + size * 0.35,
      size * 0.72,
      size * 0.45,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    const shape = [
      [-0.7, 0.28],
      [-0.6, -0.4],
      [-0.2, -0.66],
      [0.45, -0.5],
      [0.74, 0.04],
      [0.42, 0.5],
      [-0.22, 0.6],
    ].map(([x, y]) => [p.x + x * size, p.y + y * size]);
    polygon(ctx, shape);
    ctx.fillStyle = n > 0.5 ? "#646b56" : "#565e4d";
    ctx.fill();
    ctx.strokeStyle = "#949b7680";
    ctx.lineWidth = 1;
    ctx.stroke();
    polygon(ctx, [
      [p.x - size * 0.6, p.y - size * 0.4],
      [p.x - size * 0.2, p.y - size * 0.66],
      [p.x + size * 0.45, p.y - size * 0.5],
      [p.x + size * 0.2, p.y - size * 0.1],
      [p.x - size * 0.25, p.y],
    ]);
    ctx.fillStyle = "#7e82643d";
    ctx.fill();
    ctx.strokeStyle = "#232e21b3";
    ctx.beginPath();
    ctx.moveTo(p.x - size * 0.25, p.y);
    ctx.lineTo(p.x + size * 0.2, p.y - size * 0.1);
    ctx.lineTo(p.x + size * 0.42, p.y + size * 0.5);
    ctx.stroke();
  }
  drawDeployment() {
    const ctx = this.ctx;
    for (const team of this.state.scenario.teams) {
      const units = this.state.scenario.units.filter(
          (unit) => unit.team === team.id,
        ),
        center = {
          q: units.reduce((n, u) => n + u.q, 0) / units.length,
          r: units.reduce((n, u) => n + u.r, 0) / units.length,
        },
        p = this.toScreen(center);
      ctx.strokeStyle = team.color + "22";
      ctx.setLineDash([3, 7]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.size * 2.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = team.color + "77";
      ctx.font = "7px Bahnschrift, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `${team.callsign} / ${team.name.toUpperCase()} DEPLOYMENT`,
        p.x,
        p.y + this.size * 2.8,
      );
    }
  }
  drawOrders(alpha) {
    const ctx = this.ctx,
      selected = living(this.state).filter((unit) =>
        this.selection.has(unit.id),
      );
    if (selected.length === 1) {
      const unit = selected[0],
        range = UNIT_TYPES[unit.type].range;
      for (const cell of this.mapCells)
        if (
          distance(unit, cell) <= range &&
          lineOfSight(this.state.scenario.map, unit, cell)
        ) {
          const p = this.toScreen(cell);
          hex(ctx, p.x, p.y, this.size - 0.8);
          ctx.fillStyle = TEAMS[unit.team].color + "0c";
          ctx.fill();
          ctx.strokeStyle = TEAMS[unit.team].color + "23";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
    }
    for (const unit of selected) {
      const goal =
        unit.order.goal ??
        this.state.units.find(
          (other) => other.id === unit.order.targetId && other.hp > 0,
        );
      if (!goal) continue;
      const a = this.toScreen(currentPosition(unit, alpha)),
        b = this.toScreen(goal);
      ctx.strokeStyle =
        unit.order.type === "attack"
          ? "#ff9d7277"
          : TEAMS[unit.team].color + "55";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = TEAMS[unit.team].color + "66";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  drawCorpses() {
    const ctx = this.ctx;
    for (const unit of this.state.units)
      if (unit.hp <= 0) {
        const p = this.toScreen(unit),
          s = this.size * 0.3;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(unit.facing + 0.65);
        ctx.fillStyle = "#0e1a1499";
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.2, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = TEAMS[unit.team].color + "44";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s * 0.6, -s * 0.3);
        ctx.lineTo(s * 0.6, s * 0.3);
        ctx.moveTo(-s * 0.4, s * 0.4);
        ctx.lineTo(s * 0.4, -s * 0.4);
        ctx.stroke();
        ctx.restore();
      }
  }
  drawUnit(unit, alpha, running) {
    const ctx = this.ctx,
      p = this.toScreen(currentPosition(unit, running ? alpha : 0)),
      scale = Math.max(0.7, this.size / 23),
      color = TEAMS[unit.team].color,
      selected = this.selection.has(unit.id),
      hover = this.hoverUnit === unit.id;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#06120e90";
    ctx.beginPath();
    ctx.ellipse(1, 5, unit.type === "heavy" ? 12 : 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (selected || hover) {
      ctx.strokeStyle = selected ? color : "#f3f0ca";
      ctx.lineWidth = selected ? 1.6 : 1;
      ctx.beginPath();
      ctx.ellipse(
        0,
        3,
        unit.type === "heavy" ? 15 : 12,
        unit.type === "heavy" ? 11 : 9,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      if (selected) {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.save();
    ctx.rotate(unit.facing);
    if (unit.type === "marksman") {
      polygon(ctx, [
        [-10, -6],
        [-10, 7],
        [4, 5],
        [6, 0],
        [3, -5],
      ]);
      ctx.fillStyle = "#344938";
      ctx.fill();
      ctx.strokeStyle = color + "99";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    if (unit.type === "heavy") {
      polygon(ctx, [
        [-8, -8],
        [-1, -10],
        [8, -7],
        [10, 0],
        [7, 8],
        [-4, 9],
        [-9, 4],
      ]);
      ctx.fillStyle = "#536751";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = color + "99";
      ctx.fillRect(-5, -9, 9, 2);
      ctx.fillRect(-5, 7, 9, 2);
    } else {
      roundRect(ctx, -7, -6, 12, 12, 3);
      ctx.fillStyle = "#49614b";
      ctx.fill();
      ctx.strokeStyle = color + "bb";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(-3, -7, 5, 2);
      ctx.fillRect(-3, 5, 5, 2);
    }
    ctx.fillStyle = "#18281f";
    roundRect(ctx, -10, -4, 4, 8, 1);
    ctx.fill();
    ctx.strokeStyle = "#c5c7a1";
    ctx.lineWidth = unit.type === "heavy" ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(3, 3);
    ctx.lineTo(
      unit.type === "marksman" ? 19 : unit.type === "heavy" ? 16 : 13,
      3,
    );
    ctx.stroke();
    ctx.strokeStyle = "#243326";
    ctx.lineWidth = unit.type === "heavy" ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(5, 3);
    ctx.lineTo(
      unit.type === "marksman" ? 19 : unit.type === "heavy" ? 16 : 13,
      3,
    );
    ctx.stroke();
    ctx.fillStyle = "#708169";
    ctx.beginPath();
    ctx.arc(2, -1, unit.type === "heavy" ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a2a20";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    roundRect(ctx, 3, -3, 3, 4, 1);
    ctx.fill();
    ctx.restore();
    const bar = unit.type === "heavy" ? 25 : 21;
    ctx.fillStyle = "#0b1712d9";
    roundRect(ctx, -bar / 2, -18, bar, 4, 1);
    ctx.fill();
    ctx.fillStyle = unit.hp / unit.maxHp < 0.3 ? "#ffae79" : color;
    ctx.fillRect(-bar / 2 + 1, -17, ((bar - 2) * unit.hp) / unit.maxHp, 2);
    if (selected || hover) {
      ctx.font = "6px Consolas, monospace";
      ctx.fillStyle = "#e8efd1";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.ceil(unit.hp)}`, 0, -23);
    }
    ctx.restore();
  }
  drawEffects(alpha, running) {
    const ctx = this.ctx,
      now = this.state.time + (running ? alpha * 0.1 : 0);
    for (const event of this.state.events) {
      const age = now - event.time;
      if (event.type === "shot" && age >= 0 && age < 0.35) {
        const a = this.toScreen(event.from),
          b = this.toScreen(event.to),
          fade = 1 - age / 0.35;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.strokeStyle = TEAMS[event.team].color;
        ctx.shadowColor = TEAMS[event.team].color;
        ctx.shadowBlur = 5;
        ctx.lineWidth = event.weapon === "heavy" ? 2.5 : 1.4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#f3e2a4";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "9px Bahnschrift, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#f5e5bf";
        ctx.fillText(`−${event.damage}`, b.x, b.y - 16 - age * 22);
        ctx.restore();
      }
      if (event.type === "death" && age >= 0 && age < 0.55) {
        const p = this.toScreen(event.at);
        ctx.save();
        ctx.globalAlpha = (1 - age / 0.55) * 0.7;
        ctx.strokeStyle = "#ffcd86";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + age * 35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  drawOverlay() {
    const ctx = this.ctx;
    if (this.hoverCell) {
      const p = this.toScreen(this.hoverCell);
      hex(ctx, p.x, p.y, this.size - 0.8);
      ctx.fillStyle = this.command === "attack" ? "#ff9d721e" : "#d5e5a412";
      ctx.fill();
      ctx.strokeStyle = walkable(this.state.scenario.map, this.hoverCell)
        ? "#dbe8ae66"
        : "#f1a68777";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (this.box) {
      const b = this.box;
      ctx.fillStyle = "#b0e0be14";
      ctx.strokeStyle = "#d6e5a4bb";
      ctx.lineWidth = 1;
      ctx.fillRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
      ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
    }
    if (this.marker) {
      const age = (performance.now() - this.marker.at) / 1000;
      if (age > 0.8) this.marker = null;
      else {
        const p = this.toScreen(this.marker.cell);
        ctx.save();
        ctx.globalAlpha = 1 - age / 0.8;
        ctx.strokeStyle = this.marker.type === "attack" ? "#ff9d72" : "#d6e5a4";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 + age * 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - 9, p.y);
        ctx.lineTo(p.x + 9, p.y);
        ctx.moveTo(p.x, p.y - 9);
        ctx.lineTo(p.x, p.y + 9);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  drawMinimap() {
    if (this.width < 550) return;
    const ctx = this.ctx,
      w = 120,
      h = 78,
      x = this.width - w - 17,
      y = this.height - h - 43,
      scale = 2.65;
    this.minimap = { x, y, w, h, scale };
    roundRect(ctx, x, y, w, h, 5);
    ctx.fillStyle = "#102119dc";
    ctx.fill();
    ctx.strokeStyle = "#84937240";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 3, y + 3, w - 6, h - 6);
    ctx.clip();
    for (const cell of this.mapCells) {
      const p = point(cell, scale);
      ctx.fillStyle =
        this.state.scenario.map.terrain[key(cell)] === "rock"
          ? "#8c947b88"
          : "#415a3c77";
      ctx.fillRect(x + w / 2 + p.x - 1, y + h / 2 + p.y - 1, 2, 2);
    }
    for (const unit of living(this.state)) {
      const p = point(currentPosition(unit), scale);
      ctx.fillStyle = TEAMS[unit.team].color;
      ctx.fillRect(x + w / 2 + p.x - 1.5, y + h / 2 + p.y - 1.5, 3, 3);
    }
    const c = this.center,
      vx = (-c.x / this.size) * scale,
      vy = (-c.y / this.size) * scale;
    ctx.strokeStyle = "#dce7bb55";
    ctx.strokeRect(
      x + w / 2 + vx,
      y + h / 2 + vy,
      (this.width / this.size) * scale,
      (this.height / this.size) * scale,
    );
    ctx.restore();
    ctx.fillStyle = "#aebc9d99";
    ctx.font = "6px Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText("SECTOR OVERVIEW", x + 6, y + 10);
  }
  clickMinimap(x, y) {
    const m = this.minimap;
    if (!m || x < m.x || x > m.x + m.w || y < m.y || y > m.y + m.h)
      return false;
    const wx = (x - m.x - m.w / 2) / m.scale,
      wy = (y - m.y - m.h / 2) / m.scale;
    this.pan = { x: -wx * this.size, y: -wy * this.size };
    return true;
  }
}
