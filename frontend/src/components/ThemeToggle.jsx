import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme";

/** Light / dark switch. The two icons swap with a turn; the page itself changes with a circular reveal. */
export default function ThemeToggle({ className = "" }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={(e) => toggle(e.currentTarget)}
      className={`btn-ghost relative h-9 w-9 overflow-hidden p-0 ${className}`}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      <Sun
        className={`absolute h-[18px] w-[18px] transition-all duration-500 ease-flow ${dark ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`}
      />
      <Moon
        className={`absolute h-[18px] w-[18px] transition-all duration-500 ease-flow ${dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`}
      />
    </button>
  );
}
