// Motion setup shared by the whole site: GSAP (+ ScrollTrigger, SplitText) and Lenis smooth scrolling.
// Lenis is driven by GSAP's ticker and tells ScrollTrigger about every scroll, so scroll-linked animations stay in
// lock-step with the smoothed scroll position. With "reduce motion" on, Lenis isn't started (normal native scrolling).
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

export { gsap, ScrollTrigger, SplitText, useGSAP };

export const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let lenis = null;
let tick = null;

/** Start smooth scrolling (once). Returns the Lenis instance, or null when motion is reduced. */
export function startSmoothScroll() {
  if (lenis || prefersReducedMotion()) return lenis;
  lenis = new Lenis({
    lerp: 0.11, // how quickly the page catches up with the wheel: smooth but never floaty
    wheelMultiplier: 1,
    anchors: { offset: -88 }, // in-page #links glide too, clearing the sticky nav
    autoRaf: false,
  });
  lenis.on("scroll", ScrollTrigger.update);
  tick = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function stopSmoothScroll() {
  if (!lenis) return;
  gsap.ticker.remove(tick);
  lenis.destroy();
  lenis = null;
}

export const getLenis = () => lenis;

/** Scroll to an element or y position: smooth through Lenis when it runs, else native. */
export function scrollToTarget(target, { offset = -88, immediate = false } = {}) {
  if (lenis) {
    lenis.scrollTo(target, { offset, immediate, duration: immediate ? 0 : 1.1 });
    return;
  }
  if (typeof target === "number") window.scrollTo(0, target);
  else target?.scrollIntoView?.({ block: "start", behavior: immediate ? "auto" : "smooth" });
}
