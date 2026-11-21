import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

// Light / dark theme. With no saved choice the site follows the device setting.
// index.html applies the saved theme before the first paint (keep the two in sync).
const KEY = "carescout_theme";
const MEDIA = "(prefers-color-scheme: dark)";
const THEME_COLOR = { light: "#0F6B58", dark: "#0B1311" };

function savedTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia?.(MEDIA).matches ? "dark" : "light";
}

function apply(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

export function useTheme() {
  const [theme, setTheme] = useState(() => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light"));

  // Follow the device setting while the person hasn't picked one.
  useEffect(() => {
    apply(theme);
    const mq = window.matchMedia?.(MEDIA);
    if (!mq) return;
    const onChange = () => {
      if (!savedTheme()) {
        const t = systemTheme();
        apply(t);
        setTheme(t);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Switch theme. `from` (the clicked button) is where the new theme spreads out from. */
  const toggle = useCallback(
    (from) => {
      const next = theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode: the choice just isn't remembered */
      }
      const commit = () => {
        flushSync(() => setTheme(next));
        apply(next);
      };
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!document.startViewTransition || reduce || !from) {
        commit();
        return;
      }
      const r = from.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const root = document.documentElement.style;
      root.setProperty("--theme-x", `${x}px`);
      root.setProperty("--theme-y", `${y}px`);
      root.setProperty("--theme-r", `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
      document.startViewTransition(commit);
    },
    [theme],
  );

  return { theme, toggle };
}
