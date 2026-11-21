import { forwardRef, useState } from "react";
import { BellPlus, Check, Clock, ExternalLink, FileSignature, Loader2, MapPin, Phone, Quote, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { checkedLabel, displayStatus, isFailedScan } from "../lib/clinics";
import { useAppState } from "../state/AppState";
import StatusBadge from "./StatusBadge";
import CallScript from "./CallScript";
import VerifyDoctor from "./VerifyDoctor";

function ScoreRing({ score }) {
  if (score == null) return null;
  const color = score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-500" : "text-rose-500";
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-12 w-12 shrink-0" title={`Match score ${score}/100`}>
      <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-100" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className={color} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-800">{score}</span>
    </div>
  );
}

/** One clinic: scan + ranking data, and its actions (apply / call / verify doctor / watch). */
const ClinicCard = forwardRef(function ClinicCard({ clinic, selected, onSelect, onApply, email, city, onWatched }, ref) {
  const [panel, setPanel] = useState(null); // "call" | "verify" | null
  const [watchEmail, setWatchEmail] = useState("");
  const [watchState, setWatchState] = useState({ loading: false, done: false, error: null, askEmail: false });
  const { publicDemo, search, mission } = useAppState();
  const [recheck, setRecheck] = useState({ loading: false, note: null, error: null });
  const checked = checkedLabel(clinic);
  const failed = isFailedScan(clinic);
  const status = displayStatus(clinic);
  const host = String(clinic.url).replace(/^https?:\/\/(www\.)?/, "").split("/")[0];

  const toggle = (p) => setPanel((cur) => (cur === p ? null : p));

  // Re-check this one clinic now (quick page read; a browser agent if the site needs one).
  const recheckNow = async () => {
    setRecheck({ loading: true, note: null, error: null });
    try {
      const r = await api.refreshClinic(clinic.url, city, search.postalCode);
      mission.updateClinic(r.clinic);
      const note = r.method === "failed" ? `Couldn't re-check right now (${r.error}). Showing the last saved result.`
        : r.status_changed ? "Status changed since the last check." : r.method === "unchanged" ? "No change on the clinic's website." : "Up to date.";
      setRecheck({ loading: false, note, error: null });
    } catch (e) {
      setRecheck({ loading: false, note: null, error: e.message });
    }
  };

  const watch = async () => {
    const userEmail = (email || watchEmail).trim();
    if (!userEmail.includes("@")) {
      setWatchState((s) => ({ ...s, askEmail: true, error: userEmail ? "Enter a valid email." : null }));
      return;
    }
    setWatchState({ loading: true, done: false, error: null, askEmail: false });
    try {
      await api.addWatch(clinic, userEmail);
      setWatchState({ loading: false, done: true, error: null, askEmail: false });
      onWatched?.(userEmail);
    } catch (e) {
      setWatchState({ loading: false, done: false, error: e.message, askEmail: true });
    }
  };

  return (
    <article
      ref={ref}
      onClick={() => onSelect(clinic.url)}
      className={`card scroll-mt-24 p-4 transition ${selected ? "ring-2 ring-emerald-500" : "hover:border-slate-300"}`}
    >
      <div className="flex items-start gap-3">
        <ScoreRing score={clinic.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-slate-900">{failed ? host : clinic.name}</h3>
            <StatusBadge clinic={clinic} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {clinic.distance_km != null && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{clinic.distance_km} km away</span>}
            {clinic.address && <span className="truncate">{clinic.address}</span>}
            <a href={clinic.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-emerald-700">
              {host} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {clinic.coverage_tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {clinic.coverage_tags.map((t) => <span key={t} className="badge bg-sky-50 text-sky-700 ring-sky-600/20">{t}</span>)}
            </div>
          )}
        </div>
      </div>

      {failed ? (
        <p className="mt-3 text-sm text-slate-600">We couldn't check this clinic's website automatically. Visit the site or call them directly.</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          {clinic.reason && <p className="text-slate-700">{clinic.reason}</p>}
          {clinic.next_step && <p className="font-medium text-emerald-800"><span className="text-slate-500">Next step: </span>{clinic.next_step}</p>}
          {clinic.requirements?.length > 0 && (
            <ul className="list-inside list-disc text-xs text-slate-600">
              {clinic.requirements.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          {clinic.evidence_quote && (
            <blockquote className="flex gap-2 rounded-lg bg-slate-50 p-2 text-xs italic text-slate-600">
              <Quote className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{clinic.evidence_quote}</span>
            </blockquote>
          )}
          {!clinic.ranked && <p className="text-xs text-slate-400">Ranking pending...</p>}
        </div>
      )}

      {(checked || recheck.note || recheck.error) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {checked && <span className="flex items-center gap-1 text-slate-400"><Clock className="h-3.5 w-3.5" />{checked}</span>}
          {recheck.note && <span className="text-pine-700">{recheck.note}</span>}
          {recheck.error && <span className="text-rose-700">{recheck.error}</span>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {clinic.waitlist_url ? (
          <button onClick={() => onApply(clinic)} className="btn-primary py-1.5">
            <FileSignature className="h-4 w-4" /> Auto-Fill Waitlist
          </button>
        ) : (
          !failed && (
            <button onClick={() => toggle("call")} className={`btn-secondary py-1.5 ${panel === "call" ? "bg-slate-100" : ""}`}>
              <Phone className="h-4 w-4" /> {panel === "call" ? "Hide Call Script" : "View Call Script"}
            </button>
          )
        )}
        <button onClick={() => toggle("verify")} className={`btn-secondary py-1.5 ${panel === "verify" ? "bg-slate-100" : ""}`}>
          <ShieldCheck className="h-4 w-4" /> Verify Doctor (CPSO)
        </button>
        {!publicDemo && /^https?:\/\//.test(clinic.url) && (
          <button onClick={recheckNow} disabled={recheck.loading} className="btn-ghost py-1.5" title="Check this clinic's website again now">
            <RefreshCw className={`h-4 w-4 ${recheck.loading ? "animate-spin" : ""}`} /> {recheck.loading ? "Checking..." : "Re-check"}
          </button>
        )}
        {status === "closed" && (
          watchState.done ? (
            <span className="btn py-1.5 text-emerald-700"><Check className="h-4 w-4" /> Watching</span>
          ) : (
            <button onClick={watch} disabled={watchState.loading} className="btn-secondary py-1.5">
              {watchState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellPlus className="h-4 w-4" />} Watch Clinic
            </button>
          )
        )}
      </div>

      {watchState.askEmail && !email && (
        <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="email"
            className="input py-1.5"
            placeholder="Email for opening alerts"
            value={watchEmail}
            onChange={(e) => setWatchEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && watch()}
          />
          <button onClick={watch} className="btn-primary py-1.5">Watch</button>
        </div>
      )}
      {watchState.error && <p className="mt-1 text-xs text-rose-700">{watchState.error}</p>}

      <div onClick={(e) => e.stopPropagation()}>
        {panel === "call" && <CallScript clinic={clinic} />}
        {panel === "verify" && <VerifyDoctor city={city} />}
      </div>
    </article>
  );
});

export default ClinicCard;
