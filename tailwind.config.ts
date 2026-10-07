import type { Config } from "tailwindcss";

// Design tokens live as CSS variables in src/app/globals.css so light/dark
// themes swap without touching components.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        sunken: "rgb(var(--sunken) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        soft: "rgb(var(--soft) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        star: "rgb(var(--star) / <alpha-value>)",
        ok: "rgb(var(--ok) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["'Atkinson Hyperlegible'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { panel: "28px", card: "20px", tile: "14px" },
      keyframes: {
        settle: { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(0.96)" }, "100%": { transform: "scale(1)" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        rise: { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        settle: "settle 420ms cubic-bezier(.2,.8,.2,1)",
        fade: "fade 1.6s ease both",
        rise: "rise 500ms cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [],
};
export default config;
