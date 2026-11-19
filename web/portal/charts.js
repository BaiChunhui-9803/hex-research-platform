import { format } from "./data.js";

export function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function table(headers, rows) {
  const wrapper = node("div", undefined, "table-scroll");
  const result = node("table");
  const head = result.createTHead().insertRow();
  for (const name of headers) {
    const th = node("th", name);
    th.scope = "col";
    head.append(th);
  }
  const body = result.createTBody();
  for (const values of rows) {
    const row = body.insertRow();
    for (const value of values) {
      const cell = row.insertCell();
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value;
    }
  }
  wrapper.append(result);
  return wrapper;
}

export function bars(entries, type = "count") {
  const body = node("div", undefined, "portal-bars");
  const valid = entries.map((entry) => entry.value).filter(Number.isFinite);
  const extent = type === "ratio" ? 1 : Math.max(1e-10, ...valid.map(Math.abs));
  for (const { name, value, detail } of entries) {
    const row = node("div", undefined, "portal-bar-row");
    const track = node("div", undefined, "portal-bar-track");
    if (Number.isFinite(value)) {
      const fill = node("span");
      fill.style.width = `${Math.max(0, Math.min(100, Math.abs(value) / extent * 100))}%`;
      fill.classList.toggle("negative", value < 0);
      track.append(fill);
    }
    const valueNode = node("strong", detail ?? format(value, type));
    row.append(node("span", name), track, valueNode);
    body.append(row);
  }
  return body;
}

export function drawSeries(canvas, timeline, metric, tick, unit, step) {
  const w = canvas.clientWidth || 760;
  const h = canvas.clientHeight || 175;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#f4f7f2";
  ctx.fillRect(0, 0, w, h);
  const values = timeline.map((row) => row[metric]);
  const entries = values.filter(Number.isFinite);
  if (!entries.length) return;
  const isRatio = metric === "survival";
  const min = Math.min(0, ...entries), max = isRatio ? 1 : Math.max(min + 1, ...entries);
  const x = (i) => 50 + i * (w - 66) / Math.max(1, timeline.length - 1);
  const y = (value) => h - 26 - (value - min) * (h - 46) / (max - min);
  ctx.font = "11px Inter, sans-serif";
  ctx.fillStyle = "#4b655b";
  for (const v of [min, (min + max) / 2, max]) {
    ctx.fillText(format(v, isRatio ? "ratio" : "count"), 7, y(v) + 4);
    ctx.strokeStyle = "#dce5dd";
    ctx.beginPath();
    ctx.moveTo(50, y(v));
    ctx.lineTo(w - 16, y(v));
    ctx.stroke();
  }
  ctx.strokeStyle = "#2d7765";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let started = false;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    ctx[started ? "lineTo" : "moveTo"](x(i), y(v));
    started = true;
  });
  ctx.stroke();
  ctx.strokeStyle = "#bb7154";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x(tick), 14);
  ctx.lineTo(x(tick), h - 24);
  ctx.stroke();
  ctx.fillText("0", 50, h - 6);
  ctx.textAlign = "right";
  ctx.fillText(`${format((timeline.length - 1) * step)} ${unit}`, w - 16, h - 6);
  ctx.textAlign = "left";
}
