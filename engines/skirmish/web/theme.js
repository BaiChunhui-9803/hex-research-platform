import { TEAMS } from "../shared/units.js";
export const theme = {
  tokens: {
    bg: "#111a19",
    panel: "#192321",
    surface: "#202d29",
    ink: "#e9eddc",
    muted: "#8e9f91",
    line: "#334239",
    accent: "#d6e5a4",
    accentInk: "#233127",
    danger: "#ffa783",
  },
  map: {
    background: "#202c28",
    grid: "#53614b",
    edge: "#53614c",
    water: "#263e43",
    forest: "#20372e",
    hill: "#4b513c",
    rock: "#646753",
    plain: "#344538",
  },
  factions: TEAMS,
};
export function applyTheme() {
  for (const [key, value] of Object.entries(theme.tokens))
    document.documentElement.style.setProperty("--" + key, value);
}
