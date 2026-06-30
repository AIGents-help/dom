import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#05080f",
        surface: "#0b1220",
        surface2: "#0f1a2e",
        border: "#1b2940",
        accent: {
          DEFAULT: "#22d3ee",
          dim: "#0891b2",
          blue: "#3b82f6",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse at top, rgba(34,211,238,0.12), transparent 60%)",
      },
    },
  },
  plugins: [],
};

export default config;
