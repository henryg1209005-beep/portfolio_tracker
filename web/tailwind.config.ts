import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:      "#080012",
        surface: "#10001e",
        card:    "#16002b",
        border:  "#2a0050",
        pink:    { DEFAULT: "#ff2d78", dim: "#ff2d7822" },
        cyan:    { DEFAULT: "#00f5d4", dim: "#00f5d422" },
        purple:  { DEFAULT: "#bf5af2", dim: "#bf5af222" },
        muted:   "#6b5e7e",
        text:    "#e2d9f3",
      },
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "Courier New", "monospace"],
      },
      boxShadow: {
        pink:   "0 0 20px #ff2d7844",
        cyan:   "0 0 20px #00f5d444",
        purple: "0 0 20px #bf5af244",
        glow:   "0 0 40px #bf5af222",
      },
    },
  },
  plugins: [],
};

export default config;
