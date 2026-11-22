import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, ExternalLink, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api";
import { useAppState } from "../state/AppState";
import StatusBadge from "./StatusBadge";

function ago(iso) {
  if (!iso) return "not checked yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "checked just now";
  if (mins < 60) return `checked ${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `checked ${h} h ago` : `checked ${Math.round(h / 24)} d ago`;
}

/** Monitored clinics (GET /api/watch), "Check All Now", alert history, and "Preview an alert" (changes nothing). */
export default function WatchdogView({ email, onEmail, onAlert, onChanged }) {
  const { publicDemo, emailAlerts } = useAppState();
  const [watches, setWatches] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [message, setMessage] = useState(null);
  const [note, setNote] = useState(null); // why a demo email wasn't sent (neutral, not an error)
  const [error, setError] = useState(null);
  const userEmail = email.includes("@") ? email.trim() : undefined;
  const [params, setParams] = useSearchParams();
  const autoSimulated = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [w, a] = await Promise.all([api.listWatches(userEmail), api.watchAlerts(userEmail, 10)]);
      setWatches(w.watched_clinics);
      setAlerts(a.alerts);
      onChanged?.(w.watched_clinics.length);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userEmail, onChanged]);

  useEffect(() => {
    load();
  }, [load]);

  const checkAll = async () => {
    setChecking(true);
    setMessage(null);
    setError(null);
    try {
      const r = await api.checkWatches(userEmail);
      setMessage(`Checked ${r.checked} clinic${r.checked === 1 ? "" : "s"}${r.failed ? ` (${r.failed} couldn't be checked)` : ""}. ${r.alerts.length ? `${r.alerts.length} changed!` : "No changes yet."}`);
      if (r.alerts[0]) onAlert(r.alerts[0]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  };

  // Demo: show the opening alert here and (sendEmail) email it to the watcher. Nothing about the clinic changes.
  const simulate = async (watchId, sendEmail = true) => {
    setSimulating(true);
    setError(null);
    setMessage(null);
    setNote(null);
    try {
      const r = await api.simulateOpening(watchId, sendEmail ? userEmail : undefined);
      onAlert(r.alert);
      if (r.email?.sent) setMessage(r.email.note);
      else if (r.email) setNote(r.email.note);
      else if (sendEmail && !userEmail) setNote("Showing the alert here. Enter the email you watched with (above) to get it by email too.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSimulating(false);
    }
  };

  // Arrived from "See what the alert looks like" at the end of a search: play the opening alert for that watch.
  useEffect(() => {
    const id = Number(params.get("simulate"));
    if (!id || autoSimulated.current || loading) return;
    autoSimulated.current = true;
    setParams({}, { replace: true });
    if (watches.some((w) => w.id === id)) simulate(id, false); // just the on-page preview: no email from a link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, loading, watches]);

  const remove = async (w) => {
    if (!userEmail) {
      setError("Enter the email you watched this clinic with (above) to stop watching it.");
      document.getElementById("wd-email")?.focus();
      return;
    }
    try {
      await api.deleteWatch(w.id, userEmail);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="wd-email">Your email</label>
              <input id="wd-email" type="email" className="input w-64 max-w-full" value={email} onChange={(e) => onEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <button onClick={checkAll} disabled={checking || watches.length === 0 || publicDemo} className="btn-primary" title={publicDemo ? "Live checks are off on the public demo" : undefined}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check All Now
            </button>
          </div>
        </div>
        {!userEmail && <p className="mt-2 text-xs text-amber-700">Showing everyone's watches with emails hidden. Enter your email to see only yours.</p>}
        {publicDemo && <p className="mt-2 text-xs text-slate-500">Live re-checks are turned off on this public demo. Use Simulate opening to see what an opening alert looks like.</p>}
        {checking && <p className="mt-2 text-xs text-slate-500">Agents are re-checking each clinic's website. This takes a few minutes.</p>}
        {emailAlerts && userEmail && (
          <p className="mt-2 text-xs text-slate-500">When a watched clinic really starts taking patients, CareScout emails {userEmail}.</p>
        )}
        {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
        {note && <p className="mt-2 text-sm text-slate-600">{note}</p>}
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      </section>

      <section className="card divide-y divide-slate-100">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading watched clinics...</div>
        ) : watches.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No watched clinics yet. Use <b>Watch Clinic</b> on any full clinic, or add your email before launching a search to auto-watch them.
          </div>
        ) : (
          watches.map((w, i) => (
            <div key={w.id} style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }} className="flex animate-row-in flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{w.clinic_name}</span>
                  <StatusBadge status={w.last_status} />
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <a href={w.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-emerald-700">
                    {w.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]} <ExternalLink className="h-3 w-3" />
                  </a>
                  <span>{ago(w.last_checked)}</span>
                  {!userEmail && <span>{w.user_email}</span>}
                </div>
              </div>
              <button onClick={() => simulate(w.id)} disabled={simulating} className="btn-ghost py-1 text-xs text-slate-400 hover:text-emerald-700" title="Demo: shows the opening alert and emails it to you. The clinic's real status doesn't change.">
                <Sparkles className="h-3.5 w-3.5" /> Simulate opening
              </button>
              <button onClick={() => remove(w)} className="btn-ghost px-2 py-1 text-slate-400 hover:text-rose-600" aria-label={`Stop watching ${w.clinic_name}`} title="Stop watching">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </section>

      {alerts.length > 0 && (
        <section className="card p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Bell className="h-4 w-4" /> Recent alerts</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {alerts.map((a) => (
              <li key={a.alert_id} className="flex animate-row-in items-start gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <span className="text-slate-700">{a.message}</span>
                {a.simulated && <span className="badge bg-slate-100 text-slate-500 ring-slate-200">demo</span>}
                <span className="ml-auto shrink-0 text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col items-center gap-2 text-center">
        <button onClick={() => simulate(undefined)} disabled={simulating || watches.length === 0} className="btn-secondary">
          {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Simulate opening (demo)
        </button>
        <p className="max-w-md text-xs text-slate-500">
          For live demos: pretends the newest watched clinic just opened. You see the alert here
          {emailAlerts ? " and get it by email (to the email above)" : ""}. The clinic's real status doesn't change.
          {!emailAlerts && " Email alerts are off on this server."}
        </p>
      </section>
    </div>
  );
}
