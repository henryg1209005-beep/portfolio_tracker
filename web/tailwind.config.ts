import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:      "#050b14",
        surface: "#0b1523",
        card:    "#0f1b2b",
        border:  "#1f3248",
        pink:    { DEFAULT: "#ff6b8a", dim: "#ff6b8a22" },
        cyan:    { DEFAULT: "#4dd2ff", dim: "#4dd2ff22" },
        purple:  { DEFAULT: "#7ca8ff", dim: "#7ca8ff22" },
        muted:   "#7f93ad",
        text:    "#d9e4f2",
      },
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "Courier New", "monospace"],
      },
      boxShadow: {
        pink:   "0 0 20px #ff6b8a33",
        cyan:   "0 0 20px #4dd2ff33",
        purple: "0 0 20px #7ca8ff33",
        glow:   "0 0 40px #4dd2ff22",
      },
    },
  },
  plugins: [],
};

export default config;
