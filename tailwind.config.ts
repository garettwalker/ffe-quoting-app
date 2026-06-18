import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        pine: "#344236",
        "deep-pine": "#243027",
        moss: "#6e7751",
        sage: "#a8ae91",
        clay: "#a56543",
        sand: "#e8ddca",
        cream: "#f7f1e7",
        stone: "#c9c0ae",
        charcoal: "#1d211d",
        whitewarm: "#fffdf8"
      },
      borderRadius: {
        xl2: "28px",
        xl1: "18px",
        soft: "12px"
      },
      boxShadow: {
        soft: "0 24px 70px rgba(29, 33, 29, 0.16)",
        card: "0 18px 50px rgba(29, 33, 29, 0.08)"
      },
      fontFamily: {
        body: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ],
        display: ["Georgia", "Times New Roman", "serif"]
      }
    }
  },
  plugins: []
};

export default config;
