import { BellRing, Eye, ExternalLink, X } from "lucide-react";

/**
 * Banner for a clinic that just opened. A preview (simulate-opening) is about a real clinic that has NOT changed, so
 * it looks different (neutral, dashed, "Preview" label) and says plainly that it's an example, never real news.
 */
export default function AlertBanner({ alert, onClose }) {
  if (!alert) return null;

  if (alert.simulated) {
    return (
      <div className="sticky top-16 z-[999] animate-slide-down border-b border-slate-200 bg-surface" role="status">
        <div className="container-page flex flex-wrap items-start gap-3 py-3">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
          <div className="min-w-0 flex-1 rounded-lg border border-dashed border-pine-400 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              <span className="badge bg-amber-50 text-amber-700 ring-amber-600/20">Preview, not real news</span>
              What an opening alert looks like
            </div>
            <div className="mt-0.5 text-sm text-slate-600">{alert.message}</div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close preview"><X className="h-4 w-4" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-16 z-[999] animate-slide-down border-b border-brand-active bg-brand text-white" role="alert">
      <div className="container-page flex flex-wrap items-start gap-3 py-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 animate-pulse" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {alert.clinic_name} is now {alert.new_status === "waitlist" ? "taking waitlist sign-ups" : "accepting new patients"}!
          </div>
          <div className="text-sm text-white/85">{alert.message}</div>
        </div>
        <a href={alert.url} target="_blank" rel="noreferrer" className="btn shrink-0 bg-white py-1.5 text-[#0C5848] hover:bg-mint">
          Open clinic <ExternalLink className="h-4 w-4" />
        </a>
        <button onClick={onClose} className="rounded p-1 hover:bg-white/10" aria-label="Dismiss alert"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
