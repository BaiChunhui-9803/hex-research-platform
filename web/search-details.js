const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function renderSearchDetails(host, detail) {
  if (!detail) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.hidden = false;
  const archive = detail.paretoArchive;
  let chart = "";
  if (archive?.length && detail.objectiveSchema?.length >= 2) {
    const xs = archive.map((p) => p.objectives[0]),
      ys = archive.map((p) => p.objectives[1]),
      xmin = Math.min(...xs),
      xmax = Math.max(...xs),
      ymin = Math.min(...ys),
      ymax = Math.max(...ys);
    const x = (v) => 45 + ((v - xmin) / Math.max(1e-9, xmax - xmin)) * 190,
      y = (v) => 155 - ((v - ymin) / Math.max(1e-9, ymax - ymin)) * 115;
    chart = `<svg viewBox="0 0 290 205" aria-label="Nondominated evaluated candidates"><path d="M45 25V155H250" fill="none" stroke="currentColor" opacity=".3"/>${archive.map((p) => `<circle cx="${x(p.objectives[0])}" cy="${y(p.objectives[1])}" r="4" fill="var(--accent)"><title>${esc(p.objectives.join(", "))}; deployment score ${esc(p.score)}</title></circle>`).join("")}<text x="45" y="177">${esc(xmin.toFixed(2))}</text><text x="205" y="177">${esc(xmax.toFixed(2))}</text><text x="45" y="197">${esc(detail.objectiveSchema[0].name)}</text><text x="8" y="20">${esc(detail.objectiveSchema[1].name)}</text></svg><p>${archive.length} nondominated objective points. Both objectives are minimized.</p>`;
  }
  host.innerHTML = `<summary>Last search · ${esc(detail.methodId)}</summary><div><p>${esc(detail.encoding)}${detail.dimension ? " · " + detail.dimension + " dimensions" : ""}</p>${chart}<p>${esc(detail.selectionRule ?? "The best deployment score is retained.")}</p><pre>${esc(JSON.stringify(detail.implementation ?? {}, null, 2))}</pre></div>`;
}
