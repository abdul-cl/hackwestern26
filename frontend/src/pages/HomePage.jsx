import { Link } from "react-router-dom";
import { Eye, Globe2, Hand, Lock, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";
import HuntBoard from "../components/home/HuntBoard";
import { CallScriptDemo, FormFillDemo, VerifyDemo, WatchAlertDemo } from "../components/home/FeatureDemos";
import Reveal from "../components/Reveal";

// Hero lines arrive one after another (CSS animation delays).
const delay = (ms) => ({ animationDelay: `${ms}ms` });

const STEPS = [
  { icon: Globe2, title: "Find the clinics", text: "CareScout searches your city for family practices and family health teams with their own websites." },
  { icon: ScanSearch, title: "Read every website", text: "Browser agents open each site and look for the line that matters: are they taking new patients?" },
  { icon: Sparkles, title: "Rank them for you", text: "Gemini sorts the results by your coverage, language and distance, and writes your next step." },
  { icon: Eye, title: "Keep watching", text: "Clinics that are full go on your watchlist. You hear about it when one opens." },
];

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
  // The steps sit in one row on wide screens, so they arrive left to right; stacked on phones, each just appears as it scrolls in.
  const wide = typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches;
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="container-page grid grid-cols-1 items-center gap-12 pb-20 pt-12 sm:pt-16 lg:grid-cols-[1.05fr,1fr] lg:gap-16 lg:pb-28 lg:pt-20">
          <div className="min-w-0">
            <h1 className="max-w-xl animate-card-in text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-[4.1rem]">
              Stop phoning every clinic. CareScout checks them for you.
            </h1>
            <p style={delay(90)} className="mt-6 max-w-lg animate-card-in text-lg leading-relaxed text-slate-600">
              AI agents read clinic websites across your city, find the family doctors accepting new patients, and tell you exactly what to do next.
            </p>
            <div style={delay(180)} className="mt-8 flex animate-card-in flex-wrap gap-3">
              <Link to="/find" className="btn-primary btn-lg">Find a doctor</Link>
              <Link to="/find?demo=1" className="btn-secondary btn-lg">Watch a demo search</Link>
            </div>
            <p style={delay(260)} className="mt-6 animate-card-in text-sm text-slate-500">Free to use. Works in English, French, Arabic, Mandarin and Punjabi.</p>
          </div>
          <div className="mx-auto w-full min-w-0 max-w-[520px] pr-3 sm:pr-4 lg:mx-0 lg:justify-self-end">
            <HuntBoard />
          </div>
        </div>
      </section>

      {/* How it works: a real sequence, so it's numbered */}
      <section className="border-y border-slate-200/80 bg-surface">
        <div className="container-page py-20">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">One search, four agents</h2>
            <p className="mt-3 text-slate-600">Each step is handled by its own agent, so you can watch the work happen live.</p>
          </Reveal>
          {/* the line draws left to right while the steps arrive in the same order: the pipeline, in motion */}
          <Reveal as="ol" still className="relative mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            <span className="absolute left-5 right-5 top-5 hidden h-px bg-slate-200 lg:block" aria-hidden="true" />
            <span className="flow-line absolute left-5 right-5 top-5 hidden h-px bg-pine-500 lg:block" aria-hidden="true" />
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={wide ? 150 + i * 260 : 0} className="relative">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-ink font-display text-sm font-bold text-paper ring-8 ring-surface">
                  {i + 1}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-pine-600" />
                  <h3 className="text-lg font-semibold">{title}</h3>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{text}</p>
              </Reveal>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Features with small working demos */}
      <section className="container-page space-y-24 py-24">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal x={i % 2 ? "28px" : "-28px"} y="0px" className={`min-w-0 ${i % 2 ? "lg:order-2" : ""}`}>
              <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight">{f.title}</h2>
              <p className="mt-4 max-w-md text-slate-600">{f.text}</p>
            </Reveal>
            <Reveal delay={140} y="28px" className={`mx-auto w-full min-w-0 max-w-md ${i % 2 ? "lg:order-1" : ""}`}>{f.demo}</Reveal>
          </div>
        ))}
      </section>

      {/* Promises */}
      <section id="safety" className="container-page">
        <Reveal y="28px" className="rounded-[28px] bg-night px-6 py-14 text-white sm:px-12">
          <h2 className="max-w-xl text-3xl font-bold tracking-tight text-white sm:text-4xl">You stay in control of your health information</h2>
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {PROMISES.map(({ icon: Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={250 + i * 120} className="border-t border-white/15 pt-5">
                <Icon className="h-5 w-5 text-mint" />
                <div className="mt-3 font-display text-lg font-semibold text-white">{title}</div>
                <p className="mt-1.5 text-sm text-white/70">{text}</p>
              </Reveal>
            ))}
          </ul>
          <Link to="/how-it-works#safety" className="mt-10 inline-block text-sm font-medium text-mint underline-offset-4 hover:underline">
            Read how CareScout handles your data
          </Link>
        </Reveal>
      </section>

      {/* Closing call to action */}
      <Reveal as="section" className="container-page pt-24 text-center">
        <h2 className="mx-auto max-w-2xl text-4xl font-extrabold tracking-[-0.02em] sm:text-5xl">Your next family doctor might already be taking patients.</h2>
        <p className="mx-auto mt-4 max-w-lg text-slate-600">Start a search with your postal code. It takes a few minutes, and you can keep browsing while the agents work.</p>
        <Link to="/find" className="btn-primary btn-lg mt-8">Find a doctor</Link>
      </Reveal>
    </>
  );
}
