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
          DEFAULT: "#2563EB", // DOM primary blue (buttons, links, active nav, key metrics)
          dim: "#1D4ED8", // darker blue for hover
          blue: "#2563EB",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse at top, rgba(37,99,235,0.08), transparent 60%)",
      },
    },
  },
  plugins: [],
};

export default config;
