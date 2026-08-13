import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light professional business theme.
        background: "#F5F7FA", // page background
        surface: "#FFFFFF", // cards / panels
        surface2: "#F5F7FA", // nested / secondary panels, hover
        border: "#D9E0E8", // borders / dividers
        ink: "#172033", // primary text
        muted: "#5F6B7A", // secondary text
        navy: "#172033", // nav / sidebar shell
        accent: {
          DEFAULT: "#F45A1E", // DOM primary orange (buttons, links, active nav, key metrics)
          dim: "#D9480F", // darker orange for hover
          blue: "#F45A1E",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse at top, rgba(244,90,30,0.08), transparent 60%)",
      },
    },
  },
  plugins: [],
};

export default config;
