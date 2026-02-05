/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/web/**/*.{vue,js,ts,jsx,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // PKI-themed colors
        pki: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
      },
    },
  },
  plugins: [],
  safelist: [
    // Ensure dynamic classes are not purged
    "text-yellow-600",
    "text-green-600",
    "text-red-600",
    "text-gray-600",
    "bg-yellow-50",
    "bg-green-50",
    "bg-red-50",
  ],
};
