import { useEffect, useRef, useState } from "react";
import { BadgeCheck, BellRing, Hand, Phone, Play, RotateCcw } from "lucide-react";
import { useReducedMotion } from "../../hooks/useReducedMotion";

/** Fills an example waitlist form field by field when asked, and leaves Submit to the person. */
export function FormFillDemo() {
  const FIELDS = [
    ["Full name", "Priya Sharma"],
    ["Email", "priya.sharma@example.com"],
    ["Phone", "519-555-0142"],
    ["Postal code", "N6A 3K7"],
  ];
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(FIELDS.map(() => ""));
  const [state, setState] = useState("idle"); // idle | filling | done
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const start = () => {
    clearTimeout(timer.current);
    if (reduced) {
      setTyped(FIELDS.map(([, v]) => v));
      setState("done");
      return;
    }
    setState("filling");
    setTyped(FIELDS.map(() => ""));
    let f = 0;
    let c = 0;
    const step = () => {
      const target = FIELDS[f][1];
      c += 1;
      // capture now: f and c change before React runs the updater
      const field = f;
      const value = target.slice(0, c);
      setTyped((prev) => prev.map((v, i) => (i === field ? value : v)));
      if (c >= target.length) {
        f += 1;
        c = 0;
      }
      if (f < FIELDS.length) timer.current = setTimeout(step, c === 0 ? 220 : 28);
      else setState("done");
    };
    timer.current = setTimeout(step, 150);
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div className="font-display text-sm font-semibold text-ink">New patient waitlist</div>
        <span className="text-xs text-slate-400">clinic website</span>
      </div>
      <div className="mt-4 space-y-3">
        {FIELDS.map(([label], i) => (
          <div key={label}>
            <div className="mb-1 text-xs text-slate-500">{label}</div>
            <div className={`flex h-9 items-center rounded-[10px] border px-3 text-sm transition-colors ${typed[i] ? "border-pine-300 bg-pine-50/60 text-ink" : "border-slate-200 text-slate-300"}`}>
              {typed[i] || " "}
              {state === "filling" && typed[i] && typed[i].length < FIELDS[i][1].length && <span className="ml-px h-4 w-px animate-pulse bg-pine-600" />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <button onClick={start} disabled={state === "filling"} className="btn-secondary">
          {state === "done" ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {state === "done" ? "Fill it again" : "Fill it in"}
        </button>
        <div className="flex items-center gap-2">
          {state === "done" && (
            <span className="flex animate-pop-in items-center gap-1 text-xs font-medium text-pine-700">
              <Hand className="h-3.5 w-3.5" /> Paused for you
            </span>
          )}
          <span className={`rounded-[10px] border-2 border-dashed px-3.5 py-1.5 text-sm font-semibold ${state === "done" ? "border-pine-500 text-pine-700" : "border-slate-200 text-slate-300"}`}>
            Submit
          </span>
        </div>
      </div>
    </div>
  );
}

const SCRIPTS = {
  English: { dir: "ltr", text: "Hello, I'm looking for a family doctor. Are you accepting new patients?" },
  French: { dir: "ltr", text: "Bonjour, je cherche un médecin de famille. Acceptez-vous de nouveaux patients?" },
  Punjabi: { dir: "ltr", text: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ਇੱਕ ਫੈਮਿਲੀ ਡਾਕਟਰ ਲੱਭ ਰਿਹਾ ਹਾਂ। ਕੀ ਤੁਸੀਂ ਨਵੇਂ ਮਰੀਜ਼ ਲੈ ਰਹੇ ਹੋ?" },
  Arabic: { dir: "rtl", text: "مرحبًا، أبحث عن طبيب أسرة. هل تستقبلون مرضى جددًا؟" },
  Mandarin: { dir: "ltr", text: "您好，我在找家庭医生。请问你们现在接收新病人吗？" },
};

/** A call script that switches language when a tab is clicked. */
export function CallScriptDemo() {
  const [lang, setLang] = useState("English");
  const s = SCRIPTS[lang];
  return (
    <div className="card p-5">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Script language">
        {Object.keys(SCRIPTS).map((l) => (
          <button
            key={l}
            role="tab"
            aria-selected={l === lang}
            onClick={() => setLang(l)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${l === lang ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <p key={lang} dir={s.dir} lang={{ English: "en", French: "fr", Punjabi: "pa", Arabic: "ar", Mandarin: "zh" }[lang]} className="mt-4 min-h-[72px] animate-row-in font-display text-lg leading-snug text-ink">
        {s.text}
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
        <span className="text-slate-500">Mon to Fri, 8 am to 4 pm</span>
        <span className="btn-primary pointer-events-none py-1.5"><Phone className="h-4 w-4" /> Call clinic</span>
      </div>
    </div>
  );
}

/** A full clinic "opens" when the button is pressed, showing the alert people get. */
export function WatchAlertDemo() {
  const [opened, setOpened] = useState(false);
  return (
    <div className="card overflow-hidden">
      <div className="space-y-2 p-5">
        {[
          ["Riverstone Medical Clinic", opened ? "accepting" : "closed"],
          ["Northgate Health Centre", "closed"],
        ].map(([name, status]) => (
          <div key={name} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
            <span className="font-medium text-ink">{name}</span>
            <span className={`badge transition-colors duration-500 ${status === "accepting" ? "bg-pine-50 text-pine-700 ring-pine-600/20" : "bg-rose-50 text-rose-700 ring-rose-600/20"}`}>
              {status === "accepting" ? "Accepting" : "Not accepting"}
            </span>
          </div>
        ))}
      </div>
      {opened ? (
        <div className="flex animate-slide-down items-start gap-3 bg-pine-600 px-5 py-4 text-white">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-semibold">Riverstone Medical Clinic is now accepting new patients</div>
            <div className="text-pine-100">It was full when you started watching. Spots fill quickly.</div>
          </div>
          <button onClick={() => setOpened(false)} className="text-xs text-pine-100 underline">Reset</button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
          <span className="text-sm text-slate-500">Watching 2 full clinics</span>
          <button onClick={() => setOpened(true)} className="btn-secondary py-1.5">Simulate an opening</button>
        </div>
      )}
    </div>
  );
}

/** What a verified doctor looks like. */
export function VerifyDemo() {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-base font-semibold text-ink">Dr. Jane Doe</div>
          <div className="text-sm text-slate-500">Family Medicine, London</div>
        </div>
        <span className="badge bg-pine-50 text-pine-700 ring-pine-600/20"><BadgeCheck className="h-3.5 w-3.5" /> CPSO verified</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Registration</dt><dd className="font-medium text-ink">Active member</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Languages</dt><dd className="font-medium text-ink">English, French</dd></div>
      </dl>
      <p className="mt-3 text-xs text-slate-400">Example profile. Real results link to the official CPSO register.</p>
    </div>
  );
}
