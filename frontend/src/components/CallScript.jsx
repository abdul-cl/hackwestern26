import { useState } from "react";
import { Check, Clock, Copy, Phone } from "lucide-react";

/** "519-473-0530 ext. 2197" -> "tel:519-473-0530,2197" (the comma makes phones pause, then dial the extension). */
function telHref(phone) {
  const [main, ext] = phone.split(/\s*(?:ext\.?|extension|x)\s*/i);
  const clean = (s) => (s || "").replace(/[^\d+()-]/g, "");
  return "tel:" + clean(main) + (ext ? "," + clean(ext) : "");
}

/** For clinics without an online waitlist: phone, hours and a read-aloud script (in the chosen language). */
export default function CallScript({ clinic }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clinic.call_script || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {clinic.phone_number ? (
          <a href={telHref(clinic.phone_number)} className="btn-primary py-1.5">
            <Phone className="h-4 w-4" /> Call {clinic.phone_number}
          </a>
        ) : (
          <span className="text-slate-500">No phone number listed on the clinic's site.</span>
        )}
        {clinic.call_hours && (
          <span className="flex items-center gap-1 text-slate-600"><Clock className="h-4 w-4" /> {clinic.call_hours}</span>
        )}
      </div>
      {clinic.call_script ? (
        <div className="relative rounded-md bg-surface p-3 ring-1 ring-slate-200">
          <button onClick={copy} className="btn-ghost absolute right-1 top-1 px-2 py-1 text-xs" aria-label="Copy script">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <p className="whitespace-pre-line pr-8 text-slate-700">{clinic.call_script}</p>
        </div>
      ) : (
        <p className="text-slate-500">No call script for this clinic.</p>
      )}
    </div>
  );
}
