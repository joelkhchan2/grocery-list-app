export const DEFAULT_THEME = "terracotta";
export const DARK_THEME = "midnight";
export const THEMES = [
  { key: "bluegold", label: "Blue + Gold", dark: false },
  { key: "terracotta", label: "Terracotta", dark: false },
  { key: "green", label: "Garden Green", dark: false },
  { key: "berry", label: "Berry", dark: false },
  { key: "festive", label: "Festive", dark: false },
  { key: "midnight", label: "Midnight", dark: true },
  { key: "teal", label: "Teal", dark: false },
  { key: "plumpeach", label: "Plum + Peach", dark: false },
];
const KEYS = new Set(THEMES.map(t => t.key));

export function resolveActive(chosenKey, autoDark, systemDark) {
  if (autoDark && systemDark) return DARK_THEME;
  return KEYS.has(chosenKey) ? chosenKey : DEFAULT_THEME;
}
export function loadPrefs() {
  try {
    return {
      theme: localStorage.getItem("glTheme") || DEFAULT_THEME,
      autoDark: localStorage.getItem("glAutoDark") !== "0",
    };
  } catch { return { theme: DEFAULT_THEME, autoDark: true }; }
}
export function savePrefs({ theme, autoDark }) {
  try {
    localStorage.setItem("glTheme", theme);
    localStorage.setItem("glAutoDark", autoDark ? "1" : "0");
  } catch { /* private mode */ }
}
export function applyTheme(key) { document.documentElement.dataset.theme = key; }
