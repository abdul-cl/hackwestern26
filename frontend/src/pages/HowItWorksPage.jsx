import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";

const AGENTS = [
  {
    name: "Scout",
    what: "Searches the web for family practices and family health teams in your city, then has Gemini drop anything that isn't a clinic you could join, like directories, walk-in-only clinics and review sites.",
    tech: "TinyFish search + Gemini",
  },
  {
    name: "Browser Swarm",
    what: "Opens each clinic's website in a real browser and reads it like a person would. It records whether they're accepting new patients, the sentence that says so, any waitlist form, the address, phone number and hours.",
    tech: "TinyFish browser agents, two at a time",
  },
  {
    name: "Triage",
    what: "Scores every clinic for you, using your health coverage, your language and how far it is from your postal code. It writes the reason and your next step in the language you chose, and a call script for clinics that only take patients by phone.",
    tech: "Gemini",
  },
  {
    name: "Watchdog",
    what: "Keeps a list of clinics that were full and checks them again. When one starts accepting patients, you get an alert with the quote from their site.",
    tech: "TinyFish + a small database",
  },
];

const RESULTS = [
  ["Accepting", "The clinic's site says it's taking new patients now."],
  ["Waitlist open", "You can't book yet, but you can join their list."],
  ["Not accepting", "The clinic says it's full. Watch it to hear when that changes."],
  ["Couldn't check", "The site didn't load or blocked the agent. Visit it or call them directly."],
];

const FAQ = [
  ["Is CareScout free?", "Yes. It was built at Hack Western to help people across Ontario find a family doctor."],
  ["Does it sign me up with a clinic?", "No. When a clinic has an online form, CareScout fills it in and stops before the final Submit button, so you review it and send it yourself. It never submits anything for you."],
  ["How current are the results?", "Each search reads the clinic websites at that moment. A clinic's status can change quickly, so check the quote on each result and act soon on any clinic that's accepting."],
  ["Why does a search take a few minutes?", "Agents read real clinic websites, and each one can take a minute or two. You'll see every clinic's progress live, and you can browse other pages while they work."],
  ["What does the match score mean?", "It's how well a clinic fits you, from 0 to 100, based on whether it's accepting, your coverage, your language and distance. It's guidance, not a rating of the clinic's care."],
  ["I don't have OHIP. Can I still use it?", "Yes. Choose UHIP or Uninsured and CareScout favours clinics whose sites say they take those patients, and marks the rest as 'Check eligibility'."],
];

export default function HowItWorksPage() {
  return (
    <div className="container-page py-12">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-extrabold tracking-[-0.02em] sm:text-5xl">How CareScout works</h1>
        <p className="mt-4 text-lg text-slate-600">
          Finding a family doctor usually means checking dozens of clinic websites and phone lines. CareScout splits that work between four agents and shows you what each one finds.
        </p>
      </header>

      <section className="mt-14" aria-labelledby="agents">
        <h2 id="agents" className="text-2xl font-bold tracking-tight">The four agents</h2>
        <ol className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          {AGENTS.map((a, i) => (
            <li key={a.name} className="grid gap-3 py-6 md:grid-cols-[180px,1fr,220px] md:gap-8">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink font-display text-sm font-bold text-white">{i + 1}</span>
                <span className="font-display text-lg font-semibold text-ink">{a.name}</span>
              </div>
              <p className="max-w-prose text-slate-600">{a.what}</p>
              <p className="text-sm text-slate-400 md:text-right">{a.tech}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 grid gap-10 lg:grid-cols-2" aria-labelledby="results">
        <div>
          <h2 id="results" className="text-2xl font-bold tracking-tight">Reading your results</h2>
          <p className="mt-3 max-w-md text-slate-600">
            Every clinic shows its status and the exact sentence from its website that the status is based on.
          </p>
        </div>
        <dl className="card divide-y divide-slate-100">
          {RESULTS.map(([term, desc]) => (
            <div key={term} className="grid grid-cols-[130px,1fr] gap-4 px-5 py-4 text-sm">
              <dt className="font-semibold text-ink">{term}</dt>
              <dd className="text-slate-600">{desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="safety" className="mt-16 scroll-mt-24 rounded-[28px] bg-mint/50 p-6 sm:p-10" aria-labelledby="safety-title">
        <h2 id="safety-title" className="text-2xl font-bold tracking-tight">Privacy and safety</h2>
        <ul className="mt-6 grid gap-6 md:grid-cols-2">
          <li>
            <div className="font-semibold text-ink">CareScout never presses Submit</div>
            <p className="mt-1 text-sm text-slate-600">Waitlist forms are filled in and left for you to check and send. If an agent ever reports that a form was sent, CareScout tells you right away.</p>
          </li>
          <li>
            <div className="font-semibold text-ink">It only reads public pages</div>
            <p className="mt-1 text-sm text-slate-600">Agents read the same clinic websites you could. They don't log in anywhere or get around CAPTCHAs; if a site blocks them, you're asked to finish that one yourself.</p>
          </li>
          <li>
            <div className="font-semibold text-ink">Your details are used for one thing</div>
            <p className="mt-1 text-sm text-slate-600">Your name, email, phone and postal code are only typed into the form you ask CareScout to fill. Your email is only used for your watchlist alerts.</p>
          </li>
          <li>
            <div className="font-semibold text-ink">It's not medical advice</div>
            <p className="mt-1 text-sm text-slate-600">CareScout helps you find a clinic. For health advice call Health811, and in an emergency call 911.</p>
          </li>
        </ul>
      </section>

      <section className="mt-16 max-w-3xl" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-bold tracking-tight">Questions</h2>
        <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink">
                {q}
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="mt-2 max-w-prose text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mt-16 flex flex-wrap items-center gap-3">
        <Link to="/find" className="btn-primary btn-lg">Find a doctor</Link>
        <Link to="/find?demo=1" className="btn-secondary btn-lg">Watch a demo search</Link>
      </div>
    </div>
  );
}
