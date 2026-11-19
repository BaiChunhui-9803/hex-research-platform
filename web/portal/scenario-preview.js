import { cells, key, point } from "../../engines/skirmish/shared/hex.js";
import { factionName, format } from "./data.js";
import { node, table } from "./charts.js";

const terrain = {
  forest: "#c6dbca", hill: "#efdfbd", rock: "#929d9c",
  mountain: "#929d9c", river: "#accfda", water: "#accfda", blocked: "#929d9c",
};
const routes = { A: "#258674", B: "#a06a38", C: "#6b71b5" };
const factions = { blue: "#315d9f", orange: "#b65a37", violet: "#8556a0" };
const corners = Array.from({ length: 6 }, (_, index) => (index * 60 + 30) * Math.PI / 180);
const hexes = (radius) => `${radius} ${radius === 1 ? "hex" : "hexes"}`;

function outline(ctx, x, y, size) {
  ctx.beginPath();
  corners.forEach((angle, index) => {
    ctx[index ? "lineTo" : "moveTo"](x + Math.cos(angle) * size, y + Math.sin(angle) * size);
  });
  ctx.closePath();
}

function drawBoard(canvas, board) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const coordinates = cells(board.map).map((cell) => ({ cell, ...point(cell) }));
  const xs = coordinates.map(({ x }) => x), ys = coordinates.map(({ y }) => y);
  const left = Math.min(...xs), right = Math.max(...xs);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  const size = Math.min((w - 28) / (right - left + 2), (h - 22) / (bottom - top + 2));
  const translate = ({ x, y }) => ({
    x: w / 2 + (x - (left + right) / 2) * size,
    y: h / 2 + (y - (top + bottom) / 2) * size,
  });
  ctx.fillStyle = "#f2f5ef";
  ctx.fillRect(0, 0, w, h);
  for (const location of coordinates) {
    const { x, y } = translate(location);
    const type = board.map.terrain[key(location.cell)];
    outline(ctx, x, y, size);
    ctx.fillStyle = terrain[typeof type === "object" ? type?.terrain : type] ?? "#f0f2e9";
    ctx.strokeStyle = "#d8dfd6";
    ctx.lineWidth = 0.8;
    ctx.fill();
    ctx.stroke();
  }
  for (const track of board.tracks ?? []) {
    ctx.beginPath();
    track.cells.forEach((cell, index) => {
      const { x, y } = translate(point(cell));
      ctx[index ? "lineTo" : "moveTo"](x, y);
    });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (track.affected) {
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#db71577b";
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = routes[track.line] ?? "#30515a";
    ctx.stroke();
  }
  for (const station of board.stations ?? []) {
    const { x, y } = translate(point(station));
    const s = Math.max(4, size * 0.28);
    ctx.beginPath();
    if (station.shape === "circle") ctx.arc(x, y, s, 0, 2 * Math.PI);
    else if (station.shape === "triangle") {
      ctx.moveTo(x, y - s - 1);
      ctx.lineTo(x + s, y + s);
      ctx.lineTo(x - s, y + s);
      ctx.closePath();
    } else ctx.rect(x - s, y - s, s * 2, s * 2);
    ctx.fillStyle = station.active ? "#223b46" : "#f2f5ef";
    ctx.strokeStyle = station.active ? "#fff" : "#728386";
    ctx.setLineDash(station.active ? [] : [3, 2]);
    ctx.lineWidth = 1.3;
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const unit of board.units ?? []) {
    let { x, y } = translate(point(unit));
    if (board.stations?.some((station) => key(station) === key(unit))) {
      x += size * 0.31;
      y -= size * 0.31;
    }
    const radius = Math.max(4, size * 0.35);
    if (unit.inRange) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#248875";
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = factions[unit.team] ?? "#695873";
    ctx.fill();
    ctx.lineWidth = unit.team === board.team ? 1.8 : 1;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  }
}

function boardFigure(board, title, large) {
  const details = [];
  if (board.stations) {
    const open = board.stations.filter(({ active }) => active).length;
    details.push(`${open}/${board.stations.length} stations open`,
      `${board.trackUsed}/${board.trackBudget} track edges`,
      `×${format(board.demandMultiplier)} demand`);
  }
  if (board.units) {
    const own = board.units.filter(({ team }) => team === board.team).length;
    details.push(`${factionName(board.team)} · ${own} friendly / ${board.units.length - own} opposing units`);
  }
  const figure = node("figure", undefined, "scenario-map");
  const heading = node("figcaption");
  heading.append(node("strong", title), node("span", details.join(" · "), "muted"));
  const canvas = node("canvas");
  canvas.width = large ? 880 : 520;
  canvas.height = large ? 390 : 235;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${title} map. ${details.join(". ")}`);
  figure.append(heading, canvas);
  drawBoard(canvas, board);
  return figure;
}

const ruleNames = {
  "station-supply": "Station supply",
  "local-dispatch-delay": "Local dispatch delay",
};
const reasonText = {
  "disabled-by-profile": "Direction disabled",
  "missing-capability": "Required capability unavailable",
  "zero-supply": "Supply amount or storage is zero",
};

function ruleSummary(links) {
  const box = node("div", undefined, "scenario-links");
  const spatial = links.spatial;
  const title = spatial ? `Compiled rules · ${{
    "layout-adaptive": "fitted to the opening map",
    "feature-compiler": "public station resources",
    "capability-priority": "capability selection",
    "frozen-variant": spatial.variant,
    pilot: `pilot selected ${spatial.variant}`,
  }[spatial.selectedBy]}` : "Compiled rules · dual maps";
  box.append(node("h3", title));
  const flow = node("div", undefined, "scenario-link-flow");
  if (links.ruleDesign) {
    const design = links.ruleDesign;
    box.append(node("p", design.active && design.active !== "neutral"
      ? `Construction turn ${design.turn + 1} of ${design.totalTurns} · ${factionName(design.active)}`
      : design.phase === "operate" ? "Public service and engagement · tracks locked" : "Neutral construction", "muted"));
    return box;
  }
  const supplyAmount = `${links.supplyPerPassenger} HP per arrival, ${links.supplyCap} HP storage cap.`;
  for (const [id, name, enabled, description] of [
    ["station-supply", "Metro → squad", links.supplyEnabled,
      spatial ? `${supplyAmount} Station supply reaches ${hexes(spatial.stationRadius)}.`
        : `${supplyAmount} Arrivals feed the squad's shared pool.`],
    ["local-dispatch-delay", "Squad → metro", links.holdsEnabled,
      spatial ? `Pressure within ${hexes(spatial.pressureRadius)} can delay overlapping segments. Checks every ${spatial.holdEvery} cycles.`
        : `Squad pressure can hold dispatch across the network. Checks every ${links.dispatchInterval} cycles.`],
  ]) {
    const detail = spatial?.skipped.find((rule) => rule.id === id);
    const card = node("div", undefined, "scenario-link");
    card.dataset.enabled = String(enabled);
    const heading = node("div");
    heading.append(node("strong", name), node("span", enabled ? "Enabled" : "Off", "scenario-link-state"));
    const disabled = reasonText[detail?.reason] ?? (id === "station-supply" &&
      ["both", "supply"].includes(links.mode) ? reasonText["zero-supply"] : "Direction disabled");
    card.append(heading, node("p", enabled ? description : disabled, "muted"));
    if (enabled && spatial?.fit) {
      const coverage = id === "station-supply" ? spatial.fit.supply.coverage : spatial.fit.pressure.coverage;
      card.append(node("p", `Opening coverage ${format(coverage, "ratio")}`, "scenario-coverage"));
    }
    flow.append(card);
  }
  box.append(flow);
  if (spatial?.fit) {
    const { supply, pressure, openingSegments } = spatial.fit;
    const evidence = node("details", undefined, "portal-details");
    evidence.append(node("summary", "Radius selection evidence"),
      node("p", `Opening targets are ${format(supply.target, "ratio")} friendly coverage and ${format(pressure.target, "ratio")} segment coverage across ${openingSegments} starting segments.`, "muted"),
      table(["Radius", ruleNames["station-supply"], ruleNames["local-dispatch-delay"]], supply.choices.map((choice, index) => [
        hexes(choice.radius),
        `${format(choice.coverage, "ratio")}${choice.radius === supply.radius ? " · selected" : ""}`,
        `${format(pressure.choices[index].coverage, "ratio")}${choice.radius === pressure.radius ? " · selected" : ""}`,
      ])));
    box.append(evidence);
  }
  return box;
}

export function renderScenarioPreview(container, rows) {
  const chosen = rows.find(({ selected }) => selected);
  const status = chosen.finished ? "Episode finished at" : "State at";
  const timeUnit = chosen.timeUnit === "cycle" && chosen.time !== 1 ? "cycles" : chosen.timeUnit;
  const heading = node("p", `${status} ${format(chosen.time)} ${timeUnit}`, "muted");
  const mapGroup = node("div", undefined, "scenario-preview-grid");
  const links = chosen.preview.links ? ruleSummary(chosen.preview.links) : null;
  if (chosen.preview.links?.spatial) {
    const side = node("div", undefined, "scenario-side");
    const originals = node("div", undefined, "scenario-inputs");
    for (const row of rows.filter(({ id }) => id === "metro" || id === "skirmish"))
      originals.append(boardFigure(row.preview.boards[0], row.label, false));
    const output = node("div", undefined, "scenario-generated");
    output.append(boardFigure(chosen.preview.boards[0], "Generated shared map", true));
    mapGroup.dataset.layout = "shared";
    side.append(originals, links);
    mapGroup.append(side, output);
  } else {
    mapGroup.dataset.layout = chosen.preview.boards.length === 1 ? "single" : "dual";
    mapGroup.append(...chosen.preview.boards.map((board) =>
      boardFigure(board, board.stations ? "Metro network" : "Squad deployment", true)));
  }
  const legend = node("p", chosen.preview.links?.spatial
    ? "Solid shapes mark open stations. Dashed shapes mark future stations. Colored dots mark units. Teal rings mark friendly units in supply range. Red track outlines mark potential pressure at this checkpoint."
    : chosen.preview.boards.some(({ stations }) => stations)
      ? "Solid shapes mark open stations. Dashed shapes mark future stations."
      : "Colored dots mark units. Green, tan and gray tiles show woodland, high ground and rock.", "muted");
  container.replaceChildren(heading, mapGroup, legend,
    ...(links && !chosen.preview.links.spatial ? [links] : []));
}
