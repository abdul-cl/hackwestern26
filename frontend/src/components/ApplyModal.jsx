import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Hand, Loader2, X } from "lucide-react";
import { api } from "../api";
import { useAppState } from "../state/AppState";

/**
 * Auto-fill a clinic's waitlist form (POST /api/apply). The backend's agent fills the fields and STOPS before
 * Submit, so the patient always reviews and submits on the clinic's own page.
 */
export default function ApplyModal({ clinic, defaults, onClose }) {
  const { publicDemo } = useAppState();
  const [form, setForm] = useState({ name: "", email: defaults.email || "", phone: "", postal_code: defaults.postalCode || "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !loading && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, onClose]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.apply(clinic.waitlist_url, form));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={() => !loading && onClose()}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5" role="dialog" aria-modal="true" aria-labelledby="apply-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="apply-title" className="text-base font-semibold text-slate-900">Auto-Fill Waitlist</h2>
            <p className="text-sm text-slate-500">{clinic.name}</p>
          </div>
          <button onClick={onClose} disabled={loading} className="btn-ghost px-2 py-1" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
          <Hand className="mt-0.5 h-4 w-4 shrink-0" />
          <span>CareScout fills in the form for you and <b>pauses before Submit</b>. You review and submit it yourself on the clinic's website.</span>
        </div>

        {publicDemo && (
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>Auto-fill runs a live browser agent, which is turned off on this public demo. You can open the clinic's form and fill it in yourself.</p>
            <div className="flex justify-end">
              <a href={clinic.waitlist_url} target="_blank" rel="noreferrer" className="btn-primary">
                Open the clinic's form <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        )}

        {!result && !publicDemo && (
          <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ap-name">Full name</label>
              <input id="ap-name" className="input" value={form.name} onChange={set("name")} required maxLength={120} autoComplete="name" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ap-email">Email</label>
              <input id="ap-email" type="email" className="input" value={form.email} onChange={set("email")} required maxLength={200} autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="ap-phone">Phone</label>
              <input id="ap-phone" type="tel" className="input" value={form.phone} onChange={set("phone")} required maxLength={40} autoComplete="tel" />
            </div>
            <div>
              <label className="label" htmlFor="ap-postal">Postal code</label>
              <input id="ap-postal" className="input" value={form.postal_code} onChange={set("postal_code")} required maxLength={12} autoComplete="postal-code" />
            </div>
            {error && <p className="text-sm text-rose-700 sm:col-span-2">{error}</p>}
            <div className="flex items-center justify-end gap-2 sm:col-span-2">
              {loading && <span className="text-xs text-slate-500">The agent is filling the form (up to ~2 min)...</span>}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />} Fill the form
              </button>
            </div>
          </form>
        )}

        {result && <ApplyResult result={result} clinic={clinic} onRetry={() => setResult(null)} />}
      </div>
    </div>
  );
}

function ApplyResult({ result, clinic, onRetry }) {
  const link = (
    <a href={clinic.waitlist_url} target="_blank" rel="noreferrer" className="btn-secondary">
      Open the clinic's form <ExternalLink className="h-4 w-4" />
    </a>
  );
  if (result.status === "ready_for_review") {
    const fields = Object.entries(result.filled_fields || {});
    return (
      <div className="mt-4 space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Ready for your review. Not submitted.</div>
            <div className="text-xs">The agent paused before the final Submit button. Open the form, check every field, and submit it yourself.</div>
          </div>
        </div>
        {fields.length > 0 && (
          <table className="w-full text-sm">
            <tbody>
              {fields.map(([k, v]) => (
                <tr key={k} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-3 text-slate-500">{k}</td>
                  <td className="py-1.5 font-medium text-slate-800">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {result.summary && <p className="text-xs text-slate-600">{result.summary}</p>}
        {result.screenshot_url && <img src={result.screenshot_url} alt="Filled form preview" className="w-full rounded-lg ring-1 ring-slate-200" />}
        <div className="flex justify-end">{link}</div>
      </div>
    );
  }
  const isError = result.status === "error";
  return (
    <div className="mt-4 space-y-3">
      <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${isError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">{isError ? "Something went wrong" : "Please complete this one yourself"}</div>
          <div className="text-xs">{result.summary}</div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onRetry} className="btn-ghost">Try again</button>
        {link}
      </div>
    </div>
  );
}
