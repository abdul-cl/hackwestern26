import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../lib/motion";

// Each language in its own script: the point is that CareScout writes your next step in it.
const LANGS = [
  { label: "English", lang: "en" },
  { label: "Français", lang: "fr" },
  { label: "العربية", lang: "ar" },
  { label: "中文", lang: "zh" },
  { label: "ਪੰਜਾਬੀ", lang: "pa" },
];

/** "Works in English" where the language name rolls through the five supported languages (GSAP). */
export default function LanguageRoll() {
  const box = useRef(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const items = gsap.utils.toArray("[data-lang]", box.current);
      gsap.set(items, { yPercent: 100, opacity: 0 });
      gsap.set(items[0], { yPercent: 0, opacity: 1 });
      const tl = gsap.timeline({ repeat: -1, delay: 1.6 });
      items.forEach((item, i) => {
        const next = items[(i + 1) % items.length];
        tl.to(item, { yPercent: -100, opacity: 0, duration: 0.55, ease: "power3.in" }, "+=1.6")
          .fromTo(next, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.65, ease: "power3.out" }, "<0.25");
      });
    },
    { scope: box },
  );

  return (
    <>
      <span className="sr-only">English, French, Arabic, Mandarin and Punjabi</span>
      <span ref={box} aria-hidden="true" className="relative inline-grid h-[1.5em] overflow-hidden align-bottom font-medium text-ink">
        {LANGS.map((l, i) => (
          <span key={l.lang} data-lang lang={l.lang} dir="auto" className={`col-start-1 row-start-1 whitespace-nowrap ${i ? "opacity-0" : ""}`}>
            {l.label}
          </span>
        ))}
      </span>
    </>
  );
}
