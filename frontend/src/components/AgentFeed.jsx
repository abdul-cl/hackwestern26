import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, MinusCircle, RotateCcw, Square } from "lucide-react";
import { STAGES, recordedLabel } from "../hooks/useMission";
import CountUp from "./CountUp";
import LiveAgentView from "./LiveAgentView";

function StepIcon({ status }) {
  if (status === "active") return <Loader2 className="h-4 w-4 animate-spin" />;
  if (status === "done") return <Check className="h-4 w-4" />;
  if (status === "error") return <AlertTriangle className="h-4 w-4" />;
  if (status === "skipped") return <MinusCircle className="h-4 w-4" />;
  return null;
}

const STEP_STYLE = {
  active: "bg-brand text-white ring-brand",
  done: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  error: "bg-rose-50 text-rose-700 ring-rose-200",
  skipped: "bg-slate-100 text-slate-500 ring-slate-200",
};

const KIND_DOT = { stage: "bg-emerald-500", result: "bg-sky-500", error: "bg-rose-500", done: "bg-emerald-600", info: "bg-slate-300" };

/** Live progress bar + compact log for POST /api/mission/stream (state comes from useMission). */
export default function AgentFeed({ state, onStop, onReset }) {
  const [open, setOpen] = useState(true);
  const logList = useRef(null);
  const { running, stageStatus, log, agents, error, summary } = state;

  useEffect(() => {
    // keep the newest line in view by scrolling the log box itself (never the page)
    if (open && logList.current) logList.current.scrollTop = logList.current.scrollHeight;
  }, [log.length, open]);

  if (!running && log.length === 0) return null;

  // index of the furthest stage that has started (drives the progress line)
  const reached = Math.max(0, ...STAGES.map((s, i) => (stageStatus[s.key] ? i : 0)));
  const agentCounts =Object.values(agents).reduce((acc, s) => ({ ...acc, [s]: (acc[s] || 0) + 1 }), {});

  return (
    <section className="card animate-card-in p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{state.replay ? "Agent activity" : "Live agent activity"}</h2>
          {state.replay && (
            <span className="badge animate-pop-in bg-sky-50 text-sky-700 ring-sky-600/20" title="Demo searches replay a real CareScout search; ranking and the watchlist still run live">
              Replay of a real search, {recordedLabel(state.replay.recordedAt)} ({state.replay.speed || 8}x speed)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {running ? (
            <button onClick={onStop} className="btn-ghost py-1 text-xs"><Square className="h-3.5 w-3.5" /> Stop</button>
          ) : (
            <button onClick={onReset} className="btn-ghost py-1 text-xs"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
          )}
          <button onClick={() => setOpen((o) => !o)} className="btn-ghost px-2 py-1" aria-label={open ? "Hide log" : "Show log"}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* step-by-step progress: the line between the steps fills up to the stage that's running */}
      <ol className="relative mt-3 grid grid-cols-5 gap-2">
        <span className="absolute left-[10%] right-[10%] top-4 h-0.5 -translate-y-1/2 rounded-full bg-slate-200" aria-hidden="true" />
        <span
          className="absolute left-[10%] right-[10%] top-4 h-0.5 origin-left -translate-y-1/2 rounded-full bg-pine-500 transition-transform duration-700 ease-flow"
          style={{ transform: `translateY(-50%) scaleX(${reached / (STAGES.length - 1)})` }}
          aria-hidden="true"
        />
        {STAGES.map((s, i) => {
          const status = stageStatus[s.key];
          return (
            <li key={s.key} className="relative flex flex-col items-center gap-1 text-center">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ring-1 transition-colors duration-500 ${status === "active" ? "animate-pop-in" : ""} ${STEP_STYLE[status] || "bg-surface text-slate-400 ring-slate-200"}`}>
                <StepIcon status={status} /> {!status && i + 1}
              </div>
              <span className={`text-[11px] font-medium sm:text-xs ${status ? "text-slate-700" : "text-slate-400"}`}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      {Object.keys(agents).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="badge bg-slate-50 text-slate-600 ring-slate-200">{agentCounts.queued || 0} queued</span>
          <span className="badge bg-sky-50 text-sky-700 ring-sky-200">{agentCounts.scanning || 0} scanning</span>
          <span className="badge bg-emerald-50 text-emerald-700 ring-emerald-200">{agentCounts.done || 0} done</span>
          {running && (agentCounts.queued || agentCounts.scanning) ? (
            <span className="text-slate-400">Most re-checks take seconds; sites that need a browser agent take 1 to 3 min (2 at a time).</span>
          ) : null}
        </div>
      )}

      {/* a browser agent took over a clinic: watch its screen while it works */}
      {state.live && (
        <LiveAgentView
          key={state.live.liveUrl}
          className="mt-3"
          liveUrl={state.live.liveUrl}
          title={`TinyFish browser agent on ${state.live.clinicUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}`}
          steps={state.live.steps}
          done={state.live.done || !running}
        />
      )}

      {error && (
        <div className="mt-3 flex animate-slide-down items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {open && (
        <ul ref={logList} data-lenis-prevent className="mt-3 max-h-48 space-y-1 overflow-y-auto overscroll-contain rounded-lg bg-slate-50 p-2 text-xs">
          {log.map((l) => (
            <li key={l.id} className="flex animate-row-in items-start gap-2">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[l.kind] || KIND_DOT.info}`} />
              <span className="shrink-0 tabular-nums text-slate-400">{l.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              <span className={l.kind === "error" ? "text-rose-700" : "text-slate-700"}>{l.text}</span>
            </li>
          ))}
        </ul>
      )}

      {summary && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          {[
            ["Scanned", summary.total_scanned],
            ["Accepting", summary.accepting_count],
            ["Waitlist", summary.waitlist_count],
            ["Not accepting", summary.closed_count],
            ["Couldn't check", summary.failed_count],
          ].map(([label, n], i) => (
            <div key={label} style={{ animationDelay: `${i * 70}ms` }} className="animate-pop-in rounded-lg bg-slate-50 p-2">
              <div className="text-lg font-semibold text-slate-900"><CountUp value={n ?? 0} duration={0.9} /></div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      )}
      {summary && (summary.from_database != null || summary.rechecked != null) && (
        <p className="mt-2 text-xs text-slate-500">
          {summary.replay_recorded_at
            ? `${summary.rechecked ?? 0} clinic websites checked by CareScout's agents in a real search recorded ${recordedLabel(summary.replay_recorded_at)}, replayed here; ranked live just now.`
            : `${summary.from_database ?? 0} from the CareScout database, ${summary.rechecked ?? 0} checked live, in ${summary.duration_s}s.`}
          {summary.expired_count ? ` ${summary.expired_count} saved result${summary.expired_count === 1 ? " is" : "s are"} older than a week and marked "Needs a re-check".` : ""}
        </p>
      )}
    </section>
  );
}
