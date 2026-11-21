import { useRef } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "../lib/motion";

/**
 * A number that counts up from 0 (GSAP) the first time it's on screen, and glides when the value changes.
 * The real value is always in the DOM for screen readers and copy/paste; only the visible digits animate.
 */
export default function CountUp({ value, duration = 1.4, className = "" }) {
  const ref = useRef(null);
  const shown = useRef({ v: 0 });
  const started = useRef(false);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || value == null) return;
      const write = () => (el.textContent = Math.round(shown.current.v).toLocaleString());
      if (prefersReducedMotion()) {
        shown.current.v = value;
        write();
        return;
      }
      const run = () => gsap.to(shown.current, { v: value, duration: started.current ? duration * 0.6 : duration, ease: "power3.out", onUpdate: write });
      if (started.current) {
        run();
        return;
      }
      write();
      ScrollTrigger.create({
        trigger: el,
        start: "top 92%",
        once: true,
        onEnter: () => {
          started.current = true;
          run();
        },
      });
    },
    { dependencies: [value], scope: ref },
  );

  return (
    <span className={`tabular-nums ${className}`}>
      <span ref={ref} aria-hidden="true">{prefersReducedMotion() ? value : 0}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
