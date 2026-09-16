/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm linen background — softer and more residential than neutral grey.
        canvas: "#FBF7F0",
        // Warm ivory cards.
        card: "#FFFCF7",
        // Primary — calm home-inspired sage green.
        sage: {
          50: "#F2F4EC",
          100: "#E2E7D8",
          200: "#C8D2B8",
          300: "#A9BA95",
          400: "#879F75",
          500: "#6D875E",
          600: "#596F4E",
          700: "#465A40",
          800: "#354534",
          900: "#263228",
        },
        // Dark green-brown surfaces instead of near-black.
        midnight: {
          500: "#45524A",
          600: "#37443C",
          700: "#2B3932",
          800: "#202D27",
          900: "#17211D",
        },
        // Warm charcoal body text.
        ink: "#302E2A",
        status: {
          waiting: "#B18445",
          pending: "#54759A",
          confirmed: "#5D7D58",
          overdue: "#B45B4B",
        },
        border: "#E9DED0",
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
        card: "18px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(66, 52, 38, 0.04), 0 3px 10px rgba(66, 52, 38, 0.05)",
        raised: "0 3px 8px rgba(66, 52, 38, 0.06), 0 14px 34px rgba(66, 52, 38, 0.08)",
      },
    },
  },
  plugins: [],
};
