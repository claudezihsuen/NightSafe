/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // App background
        canvas: "#F7F7F5",
        // White cards
        card: "#FFFFFF",
        // Primary — Deep Sage Green
        sage: {
          50: "#EFF3F0",
          100: "#DDE6E0",
          200: "#BACCC0",
          300: "#93AF9D",
          400: "#6D927A",
          500: "#537F62",
          600: "#496B5A",
          700: "#3A5648",
          800: "#2C4137",
          900: "#1F2E27",
        },
        // Dark — headings, dark surfaces
        midnight: {
          500: "#2A3733",
          600: "#20291F",
          700: "#18221E",
          800: "#121915",
          900: "#0C110E",
        },
        // Body text
        ink: "#202522",
        // Soft status colors
        status: {
          waiting: "#B08A3E",
          pending: "#3E6FA6",
          confirmed: "#4C7F5B",
          overdue: "#B0503E",
        },
        border: "#E7E4DC",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        input: "12px",
        card: "16px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(24, 34, 30, 0.04), 0 2px 8px rgba(24, 34, 30, 0.04)",
        raised: "0 2px 4px rgba(24, 34, 30, 0.05), 0 8px 24px rgba(24, 34, 30, 0.06)",
      },
    },
  },
  plugins: [],
};
