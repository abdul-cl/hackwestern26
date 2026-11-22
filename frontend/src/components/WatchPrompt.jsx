import { useState } from "react";
import { Link } from "react-router-dom";
import { BellPlus, BellRing, Loader2 } from "lucide-react";
import { api } from "../api";
import { DEMO_EMAIL } from "../config";
import { displayStatus } from "../lib/clinics";
import { useAppState } from "../state/AppState";

/**
 * End of a search: what happens to the clinics that are full. Nothing is watched unless the person asks:
 * - they gave an email before searching -> the search watched the full clinics (says so, links to the alert);
 * - otherwise -> one click watches them (with their email, or the shared demo watchlist on the public demo).
 */
export default function WatchPrompt({ clinics, watched }) {
  const { search, setSearch, publicDemo, refreshWatchCount } = useAppState();
  const [email, setEmail] = useState(search.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mine, setMine] = useState([]); // watches made here
  const full = clinics.filter((c) => displayStatus(c) === "closed");
  const watches = watched.length ? watched : mine;

  if (watches.length) {
    return (
      <div className="flex animate-slide-down flex-wrap items-center gap-3 rounded-xl bg-accent/60 px-4 py-3">
        <BellRing className="h-5 w-5 shrink-0 text-pine-700" />
        <p className="min-w-0 flex-1 text-sm text-ink">
          Watching {watches.length} full clinic{watches.length === 1 ? "" : "s"}. When one starts taking patients, you get an alert.
        </p>
        <Link to={`/watchdog?simulate=${watches[0].id}`} className="btn-primary py-1.5">Preview the alert</Link>
      </div>
    );
  }
  if (!full.length) return null;

  const names = full.length === 1 ? full[0].name : `${full.length} clinics`;
  const watchAll = async (userEmail) => {
    if (!userEmail.includes("@")) {
      setError("Enter your email so CareScout can tell you when they open.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const made = [];
      for (const c of full) made.push(await api.addWatch(c, userEmail));
      setMine(made);
      setSearch((s) => ({ ...s, email: userEmail })); // the Watchdog page then shows these watches
      refreshWatchCount();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-slide-down rounded-xl border border-slate-200 bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <BellPlus className="h-5 w-5 shrink-0 text-pine-600" />
        <p className="min-w-0 flex-1 text-sm text-ink">
          {names} {full.length === 1 ? "isn't" : "aren't"} taking new patients right now. Want an alert when {full.length === 1 ? "it opens" : "one opens"}?
        </p>
        {publicDemo ? (
          <button onClick={() => watchAll(DEMO_EMAIL)} disabled={busy} className="btn-primary py-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellPlus className="h-4 w-4" />} Try it with the demo watchlist
          </button>
        ) : (
          <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), watchAll(email.trim()))}>
            <input type="email" className="input w-56 py-1.5" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email for opening alerts" />
            <button disabled={busy} className="btn-primary py-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellPlus className="h-4 w-4" />} Watch {full.length === 1 ? "it" : "them"}
            </button>
          </form>
        )}
      </div>
      {publicDemo && <p className="mt-1.5 text-xs text-slate-500">This public demo uses a shared demo watchlist, so your own email isn't needed or stored.</p>}
      {error && <p className="mt-1.5 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
