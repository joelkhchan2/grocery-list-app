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

// Curated font set. System/serif/mono use platform fonts (no download). "Rounded" pulls
// Nunito from Google Fonts, lazy-loaded only when selected (falls back offline).
export const FONTS = {
  system: { label: "System", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  rounded: { label: "Rounded", stack: '"Nunito", "Segoe UI", system-ui, sans-serif' },
  serif: { label: "Serif", stack: 'Georgia, "Times New Roman", serif' },
  mono: { label: "Mono", stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
};
export const FONT_SIZES = [
  { key: "s", label: "S", scale: 0.9 },
  { key: "m", label: "M", scale: 1 },
  { key: "l", label: "L", scale: 1.12 },
  { key: "xl", label: "XL", scale: 1.25 },
];

export function resolveActive(chosenKey, autoDark, systemDark) {
  if (autoDark && systemDark) return DARK_THEME;
  return KEYS.has(chosenKey) ? chosenKey : DEFAULT_THEME;
}

export function loadPrefs() {
  try {
    return {
      theme: localStorage.getItem("glTheme") || DEFAULT_THEME,
      autoDark: localStorage.getItem("glAutoDark") !== "0",
      font: FONTS[localStorage.getItem("glFont")] ? localStorage.getItem("glFont") : "system",
      fontScale: parseFloat(localStorage.getItem("glFontScale")) || 1,
      colors: {
        ac: localStorage.getItem("glColAc") || null,
        tx: localStorage.getItem("glColTx") || null,
        bg: localStorage.getItem("glColBg") || null,
      },
    };
  } catch {
    return { theme: DEFAULT_THEME, autoDark: true, font: "system", fontScale: 1, colors: {} };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem("glTheme", prefs.theme);
    localStorage.setItem("glAutoDark", prefs.autoDark ? "1" : "0");
    localStorage.setItem("glFont", prefs.font || "system");
    localStorage.setItem("glFontScale", String(prefs.fontScale || 1));
    const c = prefs.colors || {};
    for (const [key, ls] of [["ac", "glColAc"], ["tx", "glColTx"], ["bg", "glColBg"]]) {
      if (c[key]) localStorage.setItem(ls, c[key]);
      else localStorage.removeItem(ls);
    }
  } catch { /* private mode */ }
}

export function applyTheme(key) { document.documentElement.dataset.theme = key; }

// Lazy-load the one web font (Nunito) only when the Rounded option is active.
function ensureRoundedFont() {
  if (document.getElementById("gl-font-rounded")) return;
  const l = document.createElement("link");
  l.id = "gl-font-rounded";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap";
  document.head.append(l);
}

// Relative luminance of a #rrggbb color (0 dark … 1 light), or null if not a hex.
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = (c) => { c = ((n >> c) & 255) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(16) + 0.7152 * ch(8) + 0.0722 * ch(0);
}

// Layer per-device customization on top of the chosen preset: override accent/text/
// background colors, font family, and a font-size scale (as a % of the UA base so iOS
// Dynamic Type still flows through). The pickers only expose accent/text/bg, so we DERIVE
// the dependent tokens (card/border/sub from bg; on-accent from accent luminance) — otherwise
// a dark custom bg leaves cards white (invisible text) and a pale accent hides checkmarks.
export function applyCustom(prefs) {
  const root = document.documentElement;
  const setVar = (k, v) => { if (v) root.style.setProperty(k, v); else root.style.removeProperty(k); };
  const c = prefs.colors || {};
  setVar("--ac", c.ac);
  setVar("--tx", c.tx);
  setVar("--bg", c.bg);
  if (c.bg) {
    const dark = (luminance(c.bg) ?? 1) < 0.5;
    const into = dark ? "white" : "black";
    setVar("--card", `color-mix(in srgb, ${c.bg} 88%, ${into})`);
    setVar("--border", `color-mix(in srgb, ${c.bg} 74%, ${into})`);
    setVar("--sub", `color-mix(in srgb, ${c.tx || (dark ? "white" : "black")} 60%, ${c.bg})`);
  } else {
    setVar("--card", null); setVar("--border", null); setVar("--sub", null);
  }
  // Text/icon color drawn ON the accent (checkmarks, Add button, selected chips): derive from
  // the accent's own luminance. Only override when the accent is custom; else keep the preset.
  setVar("--ontop", c.ac ? ((luminance(c.ac) ?? 0) > 0.5 ? "#1a1a1a" : "#ffffff") : null);
  const font = prefs.font && FONTS[prefs.font] ? prefs.font : "system";
  if (font === "rounded") ensureRoundedFont();
  root.style.setProperty("--font-stack", FONTS[font].stack);
  const scale = prefs.fontScale && prefs.fontScale !== 1 ? prefs.fontScale : null;
  root.style.fontSize = scale ? (scale * 100) + "%" : "";
}
