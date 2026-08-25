import { useTheme } from "../hooks/useTheme";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { isDark, setDark, setLight } = useTheme();

  const toggleTheme = () => {
    if (isDark) {
      setLight();
    } else {
      setDark();
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-checked={isDark}
      className={`
        relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300
        ${isDark 
          ? "bg-zinc-800" 
          : "bg-zinc-200"
        }
      `}
    >
      {/* Thumb avec icône */}
      <span
        className={`
          inline-flex h-6 w-6 items-center justify-center rounded-full 
          bg-white shadow-md transition-transform duration-300
          ${isDark ? "translate-x-7" : "translate-x-1"}
        `}
      >
        {isDark ? (
          <Moon size={14} className="text-zinc-700" />
        ) : (
          <Sun size={14} className="text-amber-500" />
        )}
      </span>
    </button>
  );
}
