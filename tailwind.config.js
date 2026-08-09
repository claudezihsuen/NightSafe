/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Off-white app background
        canvas: "#F7F6F2",
        // White cards
        card: "#FFFFFF",
        // Deep Sage Green — primary brand color
        sage: {
          50: "#F1F4F0",
          100: "#E1E8DE",
          200: "#C3D1BD",
          300: "#9DB593",
          400: "#7A9A6E",
          500: "#5C7F4F",
          600: "#48653E",
          700: "#3A5133",
          800: "#2E4029",
          900: "#233220",
        },
        // Midnight dark green — headings, dark surfaces
        midnight: {
          500: "#1B2B22",
          600: "#16241C",
          700: "#111C16",
          800: "#0C1410",
          900: "#080D0A",
        },
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
        subtle: "0 1px 2px rgba(17, 28, 22, 0.04), 0 2px 8px rgba(17, 28, 22, 0.04)",
        raised: "0 2px 4px rgba(17, 28, 22, 0.05), 0 8px 24px rgba(17, 28, 22, 0.06)",
      },
    },
  },
  plugins: [],
};
