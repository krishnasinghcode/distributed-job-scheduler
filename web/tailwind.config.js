/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B0E14",
          surface: "#131722",
          raised: "#1B2130",
          border: "#242B3D",
        },
        text: {
          primary: "#E6E9F0",
          muted: "#8A93A6",
          faint: "#5C6478",
        },
        signal: {
          amber: "#F2A93B",
          teal: "#3DDC97",
          red: "#FF5C5C",
          violet: "#6C8EEF",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(242, 169, 59, 0.15)",
      },
    },
  },
  plugins: [],
};
