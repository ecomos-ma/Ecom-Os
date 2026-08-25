/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["'SF Pro Display'", "Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        brand: {
          accent: "rgb(var(--color-accent) / <alpha-value>)",
          accentHover: "rgb(var(--color-accent-hover) / <alpha-value>)",
          background: "var(--bg-main)",
          panel: "var(--bg-panel)",
          border: "var(--color-border)",
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          dim: "rgb(var(--color-accent-hover) / <alpha-value>)",
          glow: "rgb(var(--color-accent) / 0.15)",
        },
        text: {
          main: "var(--text-main)",
          muted: "var(--text-muted)",
        },
        base: {
          DEFAULT: "var(--bg-main)",
          surface: "var(--bg-panel)",
          raised: "var(--bg-raised)",
          border: "var(--color-border)",
        },
        ink: {
          DEFAULT: "var(--text-main)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        warn: "#d97706",
        danger: "#ef4444",
        info: "#3b82f6",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06)",
        "toast-light": "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        "toast-dark": "0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)",
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};
