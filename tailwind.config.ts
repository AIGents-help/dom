import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // DOM dark operations theme.
        background: "#090F16",
        surface: "#111923",
        surface2: "#0E151E",
        border: "#283442",
        ink: "#F8FAFC",
        muted: "#94A3B8",
        navy: "#172033",
        accent: {
          DEFAULT: "#F45A1E",
          dim: "#D9480F",
          blue: "#F45A1E",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse at top, rgba(244,90,30,0.16), transparent 58%), linear-gradient(180deg, #0E151E 0%, #090F16 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
