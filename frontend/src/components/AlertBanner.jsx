import { BellRing, ExternalLink, X } from "lucide-react";

/** Prominent green banner for a clinic that just opened (real check or simulated demo). */
export default function AlertBanner({ alert, onClose }) {
  if (!alert) return null;
  return (
    <div className="sticky top-16 z-[999] animate-slide-down border-b border-brand-active bg-brand text-white" role="alert">
      <div className="container-page flex flex-wrap items-start gap-3 py-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 animate-pulse" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {alert.clinic_name} is now {alert.new_status === "waitlist" ? "taking waitlist sign-ups" : "accepting new patients"}!
            {alert.simulated && <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-xs font-medium">demo</span>}
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
