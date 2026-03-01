import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";

export const vuetify = createVuetify({
  theme: {
    defaultTheme: "light",
    themes: {
      light: {
        dark: false,
        colors: {
          // GitHub Light Theme
          background: "#ffffff",
          surface: "#f6f8fa",
          primary: "#0969da",
          secondary: "#6e40aa",
          accent: "#8957e5",
          success: "#2da44e",
          warning: "#9e6a03",
          error: "#da3633",
          info: "#0584c5",

          // Additional GitHub colors for better UI
          "surface-dim": "#eaeef2",
          "border-default": "#d0d7de",
          "border-muted": "#d8dee4",
          "text-primary": "#24292f",
          "text-secondary": "#57606a",
          "text-tertiary": "#6e7681",
          "text-disabled": "#8c959f",
        },
      },
      dark: {
        dark: true,
        colors: {
          // GitHub Dark Theme
          background: "#0d1117",
          surface: "#161b22",
          primary: "#58a6ff",
          secondary: "#bc8ef7",
          accent: "#79c0ff",
          success: "#3fb950",
          warning: "#d29922",
          error: "#f85149",
          info: "#79c0ff",

          // Additional GitHub colors for better UI
          "surface-dim": "#010409",
          "border-default": "#30363d",
          "border-muted": "#21262d",
          "text-primary": "#e6edf3",
          "text-secondary": "#c9d1d9",
          "text-tertiary": "#8b949e",
          "text-disabled": "#6e7681",
        },
      },
    },
  },
});
