import { Info, Loader2, Rocket, Square } from "lucide-react";
import { COVERAGE_OPTIONS, LANGUAGE_OPTIONS } from "../config";

/** The mission search bar. Controlled by the page (values / onChange) so other views can reuse the same email/postal code. */
export default function MissionForm({ values, onChange, onLaunch, onStop, running, publicDemo = false }) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

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
          <label className="label" htmlFor="coverage">Coverage</label>
          <select id="coverage" className="input" value={values.coverage} onChange={set("coverage")}>
            {COVERAGE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {publicDemo ? (
          <p className="flex items-start gap-2 text-sm text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-pine-600" />
            <span>This public demo shows saved results from London, ON. Live agents run when CareScout is set up locally.</span>
          </p>
        ) : (
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded accent-emerald-600" checked={values.useCache} onChange={set("useCache")} />
            Use Cache (Demo Mode)
            <span className="text-xs text-slate-400">instant replay of saved results</span>
          </label>
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
