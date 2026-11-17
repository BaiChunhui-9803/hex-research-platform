import { methodRegistry } from "../methods/index.js";
import {
  filterMethods,
  taxonomyOptions,
  objectiveLabels,
} from "../methods/taxonomy.js";
import { compatibility } from "../core/registry.js";
import { evidenceURL } from "./paths.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const $ = (selector) => document.querySelector(selector);
export function mountMethodLibrary(problems, onUse) {
  const all = methodRegistry.list(),
    ids = [
      "objective",
      "category",
      "family",
      "variant",
      "scope",
      "query",
      "compatible",
    ];
  $("#filter-scope").innerHTML = problems
    .map(
      (p) =>
        `<optgroup label="${esc(p.name)}">${p.scenarios.map((s) => `<option value="${p.id}:${s.id}">${esc(s.name)}</option>`).join("")}</optgroup>`,
    )
    .join("");
  const scope = () => {
    const [problemId, scenarioId] = $("#filter-scope").value.split(":");
    return {
      problemId,
      scenarioId,
      capabilities: problems
        .find((p) => p.id === problemId)
        .scenarios.find((s) => s.id === scenarioId).capabilities,
    };
  };
  const state = () =>
    Object.fromEntries(
      ids.map((id) => [
        id,
        id === "compatible"
          ? $("#filter-compatible").checked
          : $("#filter-" + id).value,
      ]),
    );
  function options(selector, values, label) {
    const previous = $(selector).value;
    $(selector).innerHTML =
      `<option value="">${label}</option>` +
      values
        .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
        .join("");
    if (values.includes(previous)) $(selector).value = previous;
  }
  function render() {
    let f = state(),
      s = scope();
    let choices = taxonomyOptions(
      all,
      { ...f, compatibleOnly: f.compatible },
      s.capabilities,
    );
    options("#filter-category", choices.categories, "All categories");
    f = state();
    choices = taxonomyOptions(
      all,
      { ...f, compatibleOnly: f.compatible },
      s.capabilities,
    );
    options("#filter-family", choices.families, "All families");
    f = state();
    choices = taxonomyOptions(
      all,
      { ...f, compatibleOnly: f.compatible },
      s.capabilities,
    );
    options("#filter-variant", choices.variants, "All variants");
    f = state();
    const rows = filterMethods(
      all,
      { ...f, compatibleOnly: f.compatible },
      s.capabilities,
    );
    $("#method-count").textContent = `${rows.length} / ${all.length} methods`;
    $("#method-library").innerHTML = rows.length
      ? rows
          .map((m) => {
            const check = compatibility(m, s.capabilities),
              refs = m.referenceKeys ?? [];
            return `<article class="method-card" data-method-id="${m.id}"><span class="eyebrow">${esc(objectiveLabels[m.objective])}</span><h2>${esc(m.name)}</h2><code>${esc(m.id)}</code><div class="tags"><span class="tag">${esc(m.category)}</span><span class="tag">${esc(m.family)}</span><span class="tag">${esc(m.variant)}</span></div><p>${esc(m.description)}</p><details><summary>Implementation & sources</summary><p>${esc(m.implementationNotes ?? "Native domain strategy using the problem observation.")}</p><p>${refs.map((key) => `<a href="${esc(evidenceURL(key))}" target="_blank">${esc(key)}</a>`).join(" · ") || "Domain heuristic retained from the original game project."}</p></details><div class="support">${esc(check.compatible ? (s.capabilities.encoding ?? "Native problem candidates") : check.reasons.join("; "))}</div><div class="card-actions"><button data-use-method="${m.id}" ${check.compatible ? "" : "disabled"}>Use in workspace</button>${refs.length ? `<a href="${esc(evidenceURL(refs[0]))}" target="_blank">Evidence ↗</a>` : ""}</div></article>`;
          })
          .join("")
      : '<div class="empty-state">No method matches this combination. Try a broader family or another problem scope.</div>';
  }
  for (const id of ids)
    $("#filter-" + id).addEventListener("input", () => {
      if (id === "objective")
        for (const child of ["category", "family", "variant"])
          $("#filter-" + child).value = "";
      if (id === "category")
        for (const child of ["family", "variant"])
          $("#filter-" + child).value = "";
      if (id === "family") $("#filter-variant").value = "";
      render();
    });
  $("#clear-filters").addEventListener("click", () => {
    for (const id of ["objective", "category", "family", "variant", "query"])
      $("#filter-" + id).value = "";
    $("#filter-compatible").checked = true;
    render();
  });
  $("#method-library").addEventListener("click", (event) => {
    const button = event.target.closest("[data-use-method]");
    if (button) onUse(button.dataset.useMethod, scope());
  });
  const columns = problems.flatMap((p) => {
    const regular = p.scenarios.find((s) => !s.dynamic),
      dynamic = p.scenarios.find((s) => s.dynamic);
    return [
      { name: p.name, cap: (regular ?? p.scenarios[0]).capabilities },
      ...(dynamic
        ? [{ name: p.name + " · Dynamic", cap: dynamic.capabilities }]
        : []),
    ];
  });
  $("#compatibility").innerHTML =
    `<table><thead><tr><th>Method</th>${columns.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${all
      .map(
        (m) =>
          `<tr><td>${esc(m.name)}</td>${columns
            .map((c) => {
              const check = compatibility(m, c.cap);
              return `<td class="${check.compatible ? "yes" : "no"}" title="${esc(check.reasons.join("; "))}">${check.compatible ? "Available" : "Unavailable"}</td>`;
            })
            .join("")}</tr>`,
      )
      .join("")}</tbody></table>`;
  return {
    render,
    setScope(problemId, scenarioId) {
      $("#filter-scope").value = problemId + ":" + scenarioId;
      render();
    },
  };
}
