/** Page tokens are independent of route, faction and warning colors. */
export const theme = {
  bg: "#f7f6f2",
  panel: "#ffffff",
  surface: "#ffffff",
  ink: "#253b35",
  muted: "#65796f",
  line: "#dce4dd",
  accent: "#2d7765",
  accentInk: "#ffffff",
  danger: "#ad4234",
};
export function applyTheme() {
  for (const [key, value] of Object.entries(theme))
    document.documentElement.style.setProperty("--" + key, value);
}
