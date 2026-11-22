import { useRef } from "react";
import { Eye, Globe2, ScanSearch, Sparkles } from "lucide-react";
import { gsap, useGSAP } from "../../lib/motion";

const STEPS = [
  { icon: Globe2, title: "Find the clinics", text: "CareScout searches your city for family practices and family health teams with their own websites." },
  { icon: ScanSearch, title: "Read every website", text: "Browser agents open each site and look for the line that matters: are they taking new patients?" },
  { icon: Sparkles, title: "Rank them for you", text: "Gemini sorts the results by your coverage, language and distance, and writes your next step." },
  { icon: Eye, title: "Keep watching", text: "Clinics that are full go on your watchlist. You hear about it when one opens." },
];

/**
 * "One search, four agents". On wide screens the section holds still while you scroll and one search is handed from
 * agent to agent: the line fills, each step lights up as it's reached (GSAP ScrollTrigger, scrubbed, pinned).
 * On phones the steps simply rise in as they scroll into view. Reduced motion: everything is shown at once.
 */
export default function AgentPipeline() {
  const root = useRef(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { wide: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)", narrow: "(max-width: 1023px) and (prefers-reduced-motion: no-preference)" },
        ({ conditions }) => {
          const steps = gsap.utils.toArray("[data-step]");
          if (conditions.narrow) {
            steps.forEach((step) =>
              gsap.from(step, { opacity: 0, y: 28, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: step, start: "top 88%", once: true } }),
            );
            return;
          }
          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: { trigger: root.current, start: "top top+=64", end: "+=1100", pin: true, scrub: 0.6, anticipatePin: 1 },
          });
          tl.fromTo("[data-flow]", { scaleX: 0 }, { scaleX: 1, duration: steps.length - 1 }, 0);
          steps.forEach((step, i) => {
            const at = Math.max(0, i - 0.15);
            tl.fromTo(step.querySelector("[data-dot]"), { scale: 0 }, { scale: 1, duration: 0.3, ease: "back.out(2)" }, at)
              .fromTo(step.querySelector("[data-body]"), { opacity: 0.25, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, at);
          });
          tl.to({}, { duration: 0.4 }); // a beat at the end before the page moves on
        },
      );
    },
    { scope: root },
  );

  return (
    // wide screens: the section fills the screen below the nav while it's held, content centred
    <section ref={root} className="border-y border-slate-200/80 bg-surface lg:flex lg:min-h-[calc(100vh-4rem)] lg:items-center">
      <div className="container-page py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">One search, four agents</h2>
          <p className="mt-3 text-slate-600">Each step is handled by its own agent, so you can watch the work happen live.</p>
        </div>
        <ol className="relative mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          <span className="absolute left-5 right-5 top-5 hidden h-px bg-slate-200 lg:block" aria-hidden="true" />
          <span data-flow className="absolute left-5 right-5 top-5 hidden h-px origin-left bg-pine-500 lg:block" aria-hidden="true" />
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} data-step className="relative">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 font-display text-sm font-bold text-slate-600 ring-8 ring-surface">
                {/* the filled circle grows in when the search reaches this step */}
                {i + 1}
                <span data-dot className="absolute inset-0 flex items-center justify-center rounded-full bg-brand text-white" aria-hidden="true">
                  {i + 1}
                </span>
              </div>
              <div data-body>
                <div className="mt-4 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-pine-600" />
                  <h3 className="text-lg font-semibold">{title}</h3>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
