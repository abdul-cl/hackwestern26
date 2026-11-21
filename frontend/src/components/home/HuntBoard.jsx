import { useEffect, useState } from "react";
import { Check, Globe, Loader2, MapPin, RotateCcw, Sparkles } from "lucide-react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { STATUS_STYLE } from "../../lib/clinics";

// Fictional example clinics: this board illustrates a search, it is not real availability.
const ROWS = [
  { name: "Maplewood Family Health", status: "accepting", km: 1.8, quote: "Our physicians are now accepting new patients." },
  { name: "Riverstone Medical Clinic", status: "closed", km: 2.6, quote: "We are not accepting new patients at this time." },
  { name: "Cedar Lane Family Practice", status: "waitlist", km: 3.1, quote: "Join our waitlist using the online form below." },
  { name: "Northgate Health Centre", status: "closed", km: 4.4, quote: "Our practice is currently full." },
  { name: "Willow Park Clinic", status: "accepting", km: 4.9, quote: "Nurse practitioners are accepting new patients." },
];

const START = 500; // ms before the first agent starts
const GAP = 700; // a new agent starts every GAP ms (about two read at once, like the real backend)
const READ = 1400; // how long one "read" takes
const END = START + (ROWS.length - 1) * GAP + READ;

function rowState(i, t) {
  const begin = START + i * GAP;
  if (t < begin) return "queued";
  if (t < begin + READ) return "reading";
  return "done";
}

/** The hero's one orchestrated moment: CareScout's agents checking clinics, row by row, ending on the best match. */
export default function HuntBoard() {
  const reduced = useReducedMotion();
  const [t, setT] = useState(reduced ? END : 0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (reduced) {
      setT(END);
      return;
    }
    setT(0);
    const t0 = performance.now();
    let frame;
    const tick = (now) => {
      const elapsed = now - t0;
      setT(elapsed);
      if (elapsed < END + 100) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, run]);

  const states = ROWS.map((_, i) => rowState(i, t));
  const checked = states.filter((s) => s === "done").length;
  const finished = checked === ROWS.length;
  const best = ROWS[0];

  return (
    <div className="relative">
      {/* offset mint plate behind the board */}
      <div className="absolute -inset-3 -z-10 translate-x-4 translate-y-4 rounded-[28px] bg-accent sm:-inset-4" aria-hidden="true" />
      <div className="overflow-hidden rounded-3xl border border-pine-900/10 bg-surface shadow-[0_24px_60px_-28px_rgba(9,58,49,.35)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="font-display text-[15px] font-semibold text-ink">Checking clinics near N6A 3K7</div>
            <div className="text-xs text-slate-500" aria-live="polite">
              {finished ? "All 5 clinic websites checked" : `${checked} of ${ROWS.length} checked`}
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">Example search</span>
        </div>

        {/* progress */}
        <div className="h-1 bg-slate-100">
          <div className="h-full bg-pine-500 transition-[width] duration-300 ease-out" style={{ width: `${(checked / ROWS.length) * 100}%` }} />
        </div>

        <ul className="divide-y divide-slate-100">
          {ROWS.map((r, i) => {
            const s = states[i];
            const style = STATUS_STYLE[r.status];
            const isBest = finished && i === 0;
            return (
              <li key={r.name} className={`relative px-5 py-3 transition-colors duration-500 ${isBest ? "bg-pine-50" : ""}`}>
                {s === "reading" && <span className="absolute inset-y-0 left-0 w-full animate-sweep bg-gradient-to-r from-transparent via-pine-50 to-transparent" aria-hidden="true" />}
                <div className="relative flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                    {s === "reading" ? <Loader2 className="h-4 w-4 animate-spin text-pine-600" /> : s === "done" ? <Check className="h-4 w-4 text-pine-600" /> : <Globe className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{r.name}</div>
                    <div className="truncate text-xs text-slate-400">
                      {s === "queued" ? "Waiting for an agent" : s === "reading" ? "Reading the clinic's website" : <span className="italic text-slate-500">"{r.quote}"</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {s === "done" ? (
                      <span className={`badge animate-pop-in ${style.badge}`}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.pin }} />
                        {style.label}
                      </span>
                    ) : (
                      <span className="h-5 w-20 rounded-full bg-slate-100" aria-hidden="true" />
                    )}
                    <span className="flex items-center gap-0.5 text-[11px] text-slate-400"><MapPin className="h-3 w-3" />{r.km} km</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className={`flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5 transition-opacity duration-500 ${finished ? "opacity-100" : "opacity-0"}`} aria-hidden={!finished}>
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-pine-600" />
            <span className="text-slate-600">Best match: <b className="font-semibold text-ink">{best.name}</b>, {best.km} km away</span>
          </div>
          <button onClick={() => setRun((n) => n + 1)} className="btn-ghost px-2 py-1 text-xs" tabIndex={finished ? 0 : -1}>
            <RotateCcw className="h-3.5 w-3.5" /> Replay
          </button>
        </div>
      </div>
    </div>
  );
}
