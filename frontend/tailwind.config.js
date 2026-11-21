/** @type {import('tailwindcss').Config} */

// CareScout palette. "emerald" is remapped to the pine scale so every existing emerald-* class uses the brand color.
const pine = {
  50: "#EEF8F4",
  100: "#D5EEE4",
  200: "#ABDCCA",
  300: "#78C3AA",
  400: "#45A387",
  500: "#23876C",
  600: "#0F6B58",
  700: "#0C5848",
  800: "#0B473B",
  900: "#093A31",
  950: "#04211B",
};

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        emerald: pine,
        pine,
        ink: "#10231F",
        paper: "#F7F9F8",
        mint: "#D5EEE4",
      },
      fontFamily: {
        sans: ["Instrument Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Bricolage Grotesque", "Instrument Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "row-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "pop-in": { "0%": { opacity: "0", transform: "scale(.96)" }, "100%": { opacity: "1", transform: "none" } },
        "slide-down": { from: { opacity: "0", transform: "translateY(-8px)" }, to: { opacity: "1", transform: "none" } },
        sweep: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(100%)" } },
      },
      animation: {
        "row-in": "row-in .35s ease-out both",
        "pop-in": "pop-in .25s ease-out both",
        "slide-down": "slide-down .3s ease-out both",
        sweep: "sweep 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
