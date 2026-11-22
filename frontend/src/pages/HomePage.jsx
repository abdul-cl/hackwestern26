import { useRef } from "react";
import { Link } from "react-router-dom";
import { Hand, Lock, ShieldCheck } from "lucide-react";
import HuntBoard from "../components/home/HuntBoard";
import HeroTerrain from "../components/home/HeroTerrain";
import LiveTally from "../components/home/LiveTally";
import AgentPipeline from "../components/home/AgentPipeline";
import { CallScriptDemo, FormFillDemo, VerifyDemo, WatchAlertDemo } from "../components/home/FeatureDemos";
import LanguageRoll from "../components/LanguageRoll";
import Reveal from "../components/Reveal";
import SplitText from "../components/bits/SplitText";
import ScrollReveal from "../components/bits/ScrollReveal";
import SpotlightCard from "../components/bits/SpotlightCard";
import { gsap, useGSAP } from "../lib/motion";

// Hero lines after the headline arrive one after another (CSS animation delays).
const delay = (ms) => ({ animationDelay: `${ms}ms` });

const FEATURES = [
  {
    title: "It fills in the waitlist form. You press Submit.",
    text: "When a clinic has an online intake form, CareScout fills in your details and stops before the final button. You read it over and send it yourself.",
    demo: <FormFillDemo />,
  },
  {
    title: "Call scripts in the language you're most comfortable in",
    text: "Some clinics only take new patients by phone. You get the number, the hours to call, and a short script to read, plus what to have in hand.",
    demo: <CallScriptDemo />,
  },
  {
    title: "Full clinics don't stay full forever",
    text: "Add your email and CareScout watches the clinics that said no. When one starts accepting patients, you get an alert with the quote from their site.",
    demo: <WatchAlertDemo />,
  },
  {
    title: "Check a doctor on the official register",
    text: "Look up any doctor on the College of Physicians and Surgeons of Ontario register to confirm they're licensed and see the languages they speak.",
    demo: <VerifyDemo />,
  },
];

const PROMISES = [
  { icon: Hand, title: "Nothing is submitted without you", text: "Forms are filled and left for you to review. CareScout never presses Submit." },
  { icon: Lock, title: "Your details go only where you send them", text: "Your contact details are only sent when you ask CareScout to fill a form, to the TinyFish browser agent that types them in. Nothing is sold or shared." },
  { icon: ShieldCheck, title: "Answers come from the source", text: "Every status shows the sentence from the clinic's own website, so you can check it." },
];

export default function HomePage() {
  const page = useRef(null);

  // Feature demos drift a little slower than the page on wide screens (scrubbed to the scroll), so the two columns
  // separate as you pass. Phones and reduced motion: no drift.
  useGSAP(
    () => {
      gsap.matchMedia().add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        gsap.utils.toArray("[data-drift]").forEach((el) =>
          gsap.fromTo(el, { y: 48 }, { y: -48, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } }),
        );
      });
    },
    { scope: page },
  );

  return (
    <div ref={page}>
      {/* Hero: the contour map behind is the terrain CareScout searches for you */}
      <section className="relative isolate overflow-hidden">
        <HeroTerrain />
        <div className="container-page grid grid-cols-1 items-center gap-12 pb-20 pt-12 sm:pt-16 lg:grid-cols-[1.05fr,1fr] lg:gap-16 lg:pb-28 lg:pt-20">
          <div className="min-w-0">
            <SplitText
              tag="h1"
              text="Stop phoning every clinic. CareScout checks them for you."
              className="max-w-xl text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-[4.1rem]"
              splitType="lines"
              mask
              effect="rise"
              trigger="load"
              delay={110}
              duration={1.05}
              textAlign="left"
            />
            <p style={delay(420)} className="mt-6 max-w-lg animate-card-in text-lg leading-relaxed text-slate-600">
              AI agents read clinic websites across your city, find the family doctors accepting new patients, and tell you exactly what to do next.
            </p>
            <div style={delay(520)} className="mt-8 flex animate-card-in flex-wrap gap-3">
              <Link to="/find" className="btn-primary btn-lg">Find a doctor</Link>
              <Link to="/find?demo=1" className="btn-secondary btn-lg">Watch a demo search</Link>
            </div>
            <LiveTally />
            <p style={delay(640)} className="mt-2 animate-card-in text-sm text-slate-500">
              Free to use. Works in <LanguageRoll />.
            </p>
          </div>
          <div className="mx-auto w-full min-w-0 max-w-[520px] pr-3 sm:pr-4 lg:mx-0 lg:justify-self-end">
            <HuntBoard />
          </div>
        </div>
      </section>

      {/* How it works: a real sequence, so it's numbered (pinned + scrubbed on wide screens) */}
      <AgentPipeline />

      {/* Features with small working demos */}
      <section className="container-page space-y-24 py-24">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal x={i % 2 ? "28px" : "-28px"} y="0px" className={`min-w-0 ${i % 2 ? "lg:order-2" : ""}`}>
              <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight">{f.title}</h2>
              <p className="mt-4 max-w-md text-slate-600">{f.text}</p>
            </Reveal>
            <Reveal delay={140} y="28px" className={`mx-auto w-full min-w-0 max-w-md ${i % 2 ? "lg:order-1" : ""}`}>
              <div data-drift>{f.demo}</div>
            </Reveal>
          </div>
        ))}
      </section>

      {/* Promises */}
      <section id="safety" className="container-page">
        <Reveal y="28px" className="rounded-[28px] bg-night px-6 py-14 text-white sm:px-12">
          <h2 className="max-w-xl text-3xl font-bold tracking-tight text-white sm:text-4xl">You stay in control of your health information</h2>
          <ul className="mt-10 grid gap-5 md:grid-cols-3">
            {PROMISES.map(({ icon: Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={250 + i * 120}>
                {/* React Bits SpotlightCard: a soft light follows the pointer (and keyboard focus) across the card */}
                <SpotlightCard
                  theme="dark"
                  spotlightColor="#D5EEE4"
                  intensity={0.12}
                  spotlightSize={260}
                  className="h-full"
                  style={{ "--spotlight-card-surface": "rgb(255 255 255 / 0.04)", "--spotlight-card-shadow": "none" }}
                >
                  <Icon className="h-5 w-5 text-mint" />
                  <div className="mt-3 font-display text-lg font-semibold text-white">{title}</div>
                  <p className="mt-1.5 text-sm text-white/70">{text}</p>
                </SpotlightCard>
              </Reveal>
            ))}
          </ul>
          <Link to="/how-it-works#safety" className="mt-10 inline-block text-sm font-medium text-mint underline-offset-4 hover:underline">
            Read how CareScout handles your data
          </Link>
        </Reveal>
      </section>

      {/* Closing call to action: the statement sharpens word by word as you scroll to it (React Bits ScrollReveal) */}
      <section className="container-page pt-24 text-center">
        <ScrollReveal
          containerClassName="mx-auto max-w-3xl"
          textClassName="text-4xl font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-5xl"
          baseOpacity={0.12}
          baseRotation={0}
          blurStrength={6}
          wordAnimationEnd="center 62%"
        >
          Your next family doctor might already be taking patients.
        </ScrollReveal>
        <Reveal>
          <p className="mx-auto mt-4 max-w-lg text-slate-600">Start a search with your postal code. It takes a few minutes, and you can keep browsing while the agents work.</p>
          <Link to="/find" className="btn-primary btn-lg mt-8">Find a doctor</Link>
        </Reveal>
      </section>
    </div>
  );
}
