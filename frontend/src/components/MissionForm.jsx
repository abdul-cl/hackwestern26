import { Clock, Info, Loader2, Rocket, Square } from "lucide-react";
import { COVERAGE_LABELS, COVERAGE_OPTIONS, LANGUAGE_OPTIONS, MAX_CLINICS } from "../config";

/** The mission search bar. Controlled by the page (values / onChange) so other views can reuse the same email/postal code. */
export default function MissionForm({ values, onChange, onLaunch, onStop, running, publicDemo = false }) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const savedOnly = publicDemo || values.useCache;
  const count = Number(values.maxClinics) || 0;

  const setCount = (e) => {
    const raw = e.target.value;
    onChange({ ...values, maxClinics: raw === "" ? "" : Math.max(1, Math.min(MAX_CLINICS, Math.round(Number(raw)) || 1)) });
  };

  const submit = (e) => {
    e.preventDefault();
    if (!running) onLaunch();
  };

  return (
    <form onSubmit={submit} className="card p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div className="col-span-2 md:col-span-1">
          <label className="label" htmlFor="city">City</label>
          <input id="city" className="input" value={values.city} onChange={set("city")} placeholder="London, ON" required />
        </div>
        <div>
          <label className="label" htmlFor="postal">Postal Code</label>
          <input id="postal" className="input" value={values.postalCode} onChange={set("postalCode")} placeholder="N6A 3K7" />
        </div>
        <div>
          <label className="label" htmlFor="coverage">Health coverage</label>
          <select id="coverage" className="input" value={values.coverage} onChange={set("coverage")}>
            {COVERAGE_OPTIONS.map((o) => <option key={o} value={o}>{COVERAGE_LABELS[o]?.long || o}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="language">Language</label>
          <select id="language" className="input" value={values.language} onChange={set("language")}>
            {LANGUAGE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="email">Email <span className="font-normal text-slate-400">(optional: auto-watch full clinics)</span></label>
          <input id="email" type="email" className="input" value={values.email} onChange={set("email")} placeholder="you@example.com" />
        </div>
      </div>

      <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-[150px,1fr] md:items-start">
        <div>
          <label className="label" htmlFor="max-clinics">Clinics to check</label>
          <input
            id="max-clinics"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_CLINICS}
            className="input"
            value={values.maxClinics}
            onChange={setCount}
            onBlur={() => !count && onChange({ ...values, maxClinics: 5 })}
            aria-describedby="max-clinics-note"
          />
        </div>
        <div id="max-clinics-note" className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 md:mt-5">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pine-600" />
          {savedOnly ? (
            <span>Up to {MAX_CLINICS} clinics. Saved results load instantly, so a bigger number doesn't make you wait.</span>
          ) : (
            <span>
              Up to {MAX_CLINICS} clinics. The more you add, the longer it can take: clinics checked in the last 12 hours load instantly,
              most others take a few seconds, but sites that need a browser agent take 1 to 3 minutes each (two at a time).
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {publicDemo ? (
          <p className="flex items-start gap-2 text-sm text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-pine-600" />
            <span>This public demo shows saved results from the CareScout database. Live checks run when CareScout is set up locally.</span>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 rounded accent-emerald-600" checked={values.useCache} onChange={set("useCache")} />
              Use Cache (Demo Mode)
              <span className="text-xs text-slate-400">saved results only, instant</span>
            </label>
            <label className={`flex select-none items-center gap-2 text-sm ${values.useCache ? "cursor-not-allowed text-slate-300" : "cursor-pointer text-slate-600"}`}>
              <input type="checkbox" className="h-4 w-4 rounded accent-emerald-600" checked={values.recheckAll && !values.useCache}
                disabled={values.useCache} onChange={set("recheckAll")} />
              Re-check every clinic
              <span className={`text-xs ${values.useCache ? "text-slate-300" : "text-slate-400"}`}>slower, ignores saved results</span>
            </label>
          </div>
        )}
        {running ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Agents working...
            </span>
            <button type="button" onClick={onStop} className="btn-secondary">
              <Square className="h-4 w-4" /> Stop
            </button>
          </div>
        ) : (
          <button type="submit" className="btn-primary px-5">
            <Rocket className="h-4 w-4" /> Launch CareScout
          </button>
        )}
      </div>
    </form>
  );
}
