/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/web/**/*.{vue,js,ts,jsx,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Dark mode theme
        dark: {
          bg: "#0d1117",
          surface: "#161b22",
          border: "#30363d",
          text: "#c9d1d9",
          textMuted: "#8b949e",
        },
      },
    },
  },
  plugins: [],
  safelist: [
    // Dynamic status badge colors (StatusBadge component)
    "bg-green-100",
    "text-green-700",
    "border-green-300",
    "bg-green-600",
    "bg-red-100",
    "text-red-700",
    "border-red-300",
    "bg-red-600",
    "bg-yellow-100",
    "text-yellow-700",
    "border-yellow-300",
    "bg-yellow-600",
  ],
};
