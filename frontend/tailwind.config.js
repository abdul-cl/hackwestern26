/** @type {import('tailwindcss').Config} */

// CareScout palette, light and dark. Every color family below is a CSS variable, so existing classes
// (text-slate-500, bg-emerald-50, ...) switch on their own when <html> has the "dark" class.
// "emerald" is remapped to the pine scale so every emerald-* class uses the brand color.
//
// Fixed colors that never switch: white, black, mint (accent on dark panels, logo dot).
// Use bg-surface for cards/panels (white in light), bg-night for dark panels (bg-ink in light),
// bg-brand for solid green buttons/badges with white text, bg-accent for the mint tint.

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const SCALES = {
  pine: {
    light: ["#EEF8F4", "#D5EEE4", "#ABDCCA", "#78C3AA", "#45A387", "#23876C", "#0F6B58", "#0C5848", "#0B473B", "#093A31", "#04211B"],
    dark: ["#10261F", "#143329", "#1B4537", "#2A6450", "#3D876C", "#4EA585", "#62BB99", "#82CDB0", "#A7DDC7", "#CBEDE0", "#E6F7F0"],
  },
  // Light keeps Tailwind's slate; dark is a pine-tinted ramp turned upside down (50 = subtle fill, 900 = strong text).
  slate: {
    light: ["#F8FAFC", "#F1F5F9", "#E2E8F0", "#CBD5E1", "#94A3B8", "#64748B", "#475569", "#334155", "#1E293B", "#0F172A", "#020617"],
    dark: ["#16221F", "#1C2A26", "#273733", "#354741", "#6A7E77", "#8FA19B", "#A9B8B3", "#C1CDC9", "#D8E1DE", "#EAF0EE", "#F5F8F7"],
  },
  stone: {
    light: ["#FAFAF9", "#F5F5F4", "#E7E5E4", "#D6D3D1", "#A8A29E", "#78716C", "#57534E", "#44403C", "#292524", "#1C1917", "#0C0A09"],
    dark: ["#1C1B18", "#25231F", "#37342E", "#4B4741", "#7E7871", "#A39D96", "#BDB8B2", "#D3CFCA", "#E5E2DE", "#F1EFEC", "#F8F7F5"],
  },
  rose: {
    light: ["#FFF1F2", "#FFE4E6", "#FECDD3", "#FDA4AF", "#FB7185", "#F43F5E", "#E11D48", "#BE123C", "#9F1239", "#881337", "#4C0519"],
    dark: ["#2A1418", "#3A1A20", "#57252E", "#7E3442", "#C2546A", "#EE6A82", "#F17F93", "#F5A0AF", "#F8BFC9", "#FBDCE1", "#FDEEF1"],
  },
  amber: {
    light: ["#FFFBEB", "#FEF3C7", "#FDE68A", "#FCD34D", "#FBBF24", "#F59E0B", "#D97706", "#B45309", "#92400E", "#78350F", "#451A03"],
    dark: ["#2A2111", "#3A2C14", "#56411B", "#7A5B22", "#B8862E", "#F0B23E", "#F2BC55", "#F5CB78", "#F8DB9F", "#FBEBC9", "#FDF5E4"],
  },
  sky: {
    light: ["#F0F9FF", "#E0F2FE", "#BAE6FD", "#7DD3FC", "#38BDF8", "#0EA5E9", "#0284C7", "#0369A1", "#075985", "#0C4A6E", "#082F49"],
    dark: ["#0F2230", "#132C3E", "#1C415A", "#285D80", "#3B88B8", "#4FB0E6", "#66BCEB", "#8ECFF1", "#B5E0F6", "#D9EFFA", "#EDF7FD"],
  },
};

// Single colors that switch with the theme.
const TOKENS = {
  paper: ["#F7F9F8", "#0B1311"], // page background
  surface: ["#FFFFFF", "#111B18"], // cards, panels, footer
  ink: ["#10231F", "#E6EFEB"], // headings / strong text
  night: ["#10231F", "#182B26"], // dark panels and number circles (white text on top in both themes)
  accent: ["#D5EEE4", "#16352C"], // mint tint behind things
  brand: ["#0F6B58", "#15775F"], // solid green with white text
  "brand-hover": ["#0C5848", "#1A8A6E"],
  "brand-active": ["#0B473B", "#1F9A7B"],
};

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
const ref = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

const colors = {};
const lightVars = {};
const darkVars = {};
for (const [family, { light, dark }] of Object.entries(SCALES)) {
  colors[family] = {};
  STEPS.forEach((step, i) => {
    colors[family][step] = ref(`${family}-${step}`);
    lightVars[`--c-${family}-${step}`] = rgb(light[i]);
    darkVars[`--c-${family}-${step}`] = rgb(dark[i]);
  });
}
for (const [name, [light, dark]] of Object.entries(TOKENS)) {
  colors[name] = ref(name);
  lightVars[`--c-${name}`] = rgb(light);
  darkVars[`--c-${name}`] = rgb(dark);
}
colors.emerald = colors.pine;
colors.mint = "#D5EEE4";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ["Instrument Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Bricolage Grotesque", "Instrument Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      transitionTimingFunction: {
        flow: "cubic-bezier(.22,1,.36,1)", // fast start, long soft landing
      },
      keyframes: {
        "row-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "pop-in": { "0%": { opacity: "0", transform: "scale(.96)" }, "100%": { opacity: "1", transform: "none" } },
        "slide-down": { from: { opacity: "0", transform: "translateY(-8px)" }, to: { opacity: "1", transform: "none" } },
        "page-in": { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "sheet-in": { from: { opacity: "0", transform: "translateY(24px) scale(.98)" }, to: { opacity: "1", transform: "none" } },
        "card-in": { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "none" } },
        sweep: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(100%)" } },
      },
      animation: {
        "row-in": "row-in .35s ease-out both",
        "pop-in": "pop-in .25s ease-out both",
        "slide-down": "slide-down .3s ease-out both",
        // backwards, not both: once finished it must leave no transform behind (a transformed ancestor breaks
        // position: fixed inside the page, e.g. the pinned home section and the Auto-Fill window)
        "page-in": "page-in .45s cubic-bezier(.22,1,.36,1) backwards",
        "fade-in": "fade-in .2s ease-out both",
        "sheet-in": "sheet-in .4s cubic-bezier(.22,1,.36,1) both",
        "card-in": "card-in .5s cubic-bezier(.22,1,.36,1) both",
        sweep: "sweep 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [
    function ({ addBase }) {
      addBase({
        ":root": { ...lightVars, colorScheme: "light" },
        ":root.dark": { ...darkVars, colorScheme: "dark" },
      });
    },
  ],
};
