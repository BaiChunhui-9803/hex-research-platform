const paths = {
  play: "M8 5l11 7-11 7V5z",
  pause: "M8 5v14M16 5v14",
  step: "M5 5l10 7-10 7V5zM19 5v14",
  lab: "M9 3h6M10 3v6L4 19a1 1 0 001 2h14a1 1 0 001-2L14 9V3M8 14h8",
  undo: "M9 6l-5 5 5 5M4 11h10a5 5 0 010 10",
  trash: "M4 7h16M9 3h6l1 4M6 7l1 14h10l1-14M10 11v6M14 11v6",
  reset: "M3 10a9 9 0 111 8M3 4v6h6",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  help: "M9 9a3 3 0 116 0c0 2-3 2-3 5M12 18h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  fit: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  arrow: "M5 12h14M13 6l6 6-6 6",
  download: "M12 3v12M7 10l5 5 5-5M4 16v5h16v-5",
  check: "M5 12l4 4 10-10",
  person: "M16 6a4 4 0 11-8 0 4 4 0 018 0M5 21v-4a7 7 0 0114 0v4",
  clock: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0",
  train: "M6 3h12v14H6V3zM6 10h12M9 14h.01M15 14h.01M8 17l-2 4M16 17l2 4",
  flag: "M5 21V3l14 2v8L5 11",
};
export const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.help}"/></svg>`;
export const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
