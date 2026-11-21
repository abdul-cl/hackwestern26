import { useState } from "react";
import { CheckCircle2, ExternalLink, MonitorPlay } from "lucide-react";

/**
 * The TinyFish browser agent's own screen, live, while it works (search re-checks and Auto-Fill).
 * liveUrl comes from TinyFish (an https page streaming the agent's browser). It only works while the agent runs, so
 * once `done` the frame is replaced by a short note. "Open in a new tab" is there in case the page won't embed.
 */
export default function LiveAgentView({ liveUrl, title, steps = [], done = false, className = "" }) {
  const [loaded, setLoaded] = useState(false);
  const last = steps[steps.length - 1];
  return (
    <div className={`animate-slide-down overflow-hidden rounded-xl border border-slate-200 bg-surface ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs">
        {done ? <CheckCircle2 className="h-4 w-4 text-pine-600" /> : <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" /></span>}
        <span className="font-semibold text-ink">{done ? "The agent finished" : "Live"}</span>
        <span className="min-w-0 flex-1 truncate text-slate-500">{title}</span>
        {!done && (
          <a href={liveUrl} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 font-medium text-pine-700 hover:underline">
            Open in a new tab <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {!done ? (
        <div className="relative aspect-video w-full bg-slate-100">
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <MonitorPlay className="h-6 w-6 animate-pulse text-pine-600" />
              Connecting to the agent's browser...
            </div>
          )}
          <iframe
            src={liveUrl}
            title={`Live view: ${title}`}
            className="absolute inset-0 h-full w-full"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin"
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : null}
      {last && (
        <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600" aria-live="polite">
          <span className="text-slate-400">{done ? "Last step: " : "Now: "}</span>
          {last}
        </p>
      )}
    </div>
  );
}
