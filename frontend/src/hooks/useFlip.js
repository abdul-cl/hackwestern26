import { useLayoutEffect, useRef } from "react";

/**
 * Smoothly moves list items to their new place when the order changes (e.g. when ranking comes back),
 * instead of letting them jump. `keys` is the list order; `refs.current[key]` is each item's element.
 * Positions are measured after every render, and items only animate when the order itself changed.
 */
export function useFlip(keys, refs) {
  const last = useRef({ order: "", tops: {} });
  const order = keys.join("|");

  useLayoutEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const reordered = last.current.order && last.current.order !== order;
    const tops = {};
    for (const key of keys) {
      const el = refs.current[key];
      if (!el) continue;
      const top = el.getBoundingClientRect().top + window.scrollY;
      tops[key] = top;
      const prev = last.current.tops[key];
      if (reordered && !reduce && prev != null && Math.abs(prev - top) > 2 && el.animate) {
        el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: "translateY(0)" }], {
          duration: 650,
          easing: "cubic-bezier(.22,1,.36,1)",
        });
      }
    }
    last.current = { order, tops };
  });
}
