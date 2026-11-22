import { useState } from "react";
import { Check, Clock, Copy, Phone } from "lucide-react";
import { useAppState } from "../state/AppState";

const LANG_CODE = { English: "en", French: "fr", Arabic: "ar", Mandarin: "zh", Punjabi: "pa" };

/** "519-473-0530 ext. 2197" -> "tel:519-473-0530,2197" (the comma makes phones pause, then dial the extension). */
function telHref(phone) {
  const [main, ext] = phone.split(/\s*(?:ext\.?|extension|x)\s*/i);
  const clean = (s) => (s || "").replace(/[^\d+()-]/g, "");
  return "tel:" + clean(main) + (ext ? "," + clean(ext) : "");
}

// Any letter outside the Latin alphabets (Arabic, Chinese, Gurmukhi...): that text is in the patient's language.
const NON_LATIN = /[^\u0000-ɏḀ-ỿ\s\d\p{P}\p{S}]/u;

/**
 * Split the script into display lines: { kind: "say" | "meaning" | "note" | "gap", text }.
 * "say" = what the patient reads out (English / French), "meaning" = its translation, "note" = heading + checklist.
 * Handles the translation on its own line ("(meaning: ...)") or on the same line in brackets.
 */
function scriptLines(script) {
  const out = [];
  for (const raw of script.split("\n")) {
    const line = raw.trim();
    if (!line) {
      out.push({ kind: "gap" });
      continue;
    }
    const own = line.match(/^\((?:meaning:\s*)?(.+)\)$/i);
    if (own) {
      out.push({ kind: "meaning", text: own[1] });
      continue;
    }
    const inline = line.match(/^(.*\S)\s*\((?:meaning:\s*)?(.+)\)$/i);
    if (inline && (NON_LATIN.test(inline[2]) || /^\(meaning/i.test(line.slice(inline[1].length).trim()))) {
      out.push({ kind: "say", text: inline[1] }, { kind: "meaning", text: inline[2] });
      continue;
    }
    out.push({ kind: line.startsWith("-") || NON_LATIN.test(line) ? "note" : "say", text: line });
  }
  return out;
}

/** For clinics without an online waitlist: phone, hours and a read-aloud script (in the chosen language). */
export default function CallScript({ clinic }) {
  const [copied, setCopied] = useState(false);
  const { search } = useAppState();
  const patientLang = LANG_CODE[search.language] || "en";
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
          {/* Lines to say (English / French) come first; "(meaning: ...)" lines and the checklist are in the patient's
              language. dir="auto" lets Arabic lines run right to left; lang helps screen readers pronounce them. */}
          <div className="pr-8 text-slate-700">
            {scriptLines(clinic.call_script).map((l, i) =>
              l.kind === "gap" ? (
                <div key={i} className="h-2" />
              ) : (
                <p key={i} dir="auto" lang={l.kind === "say" ? (search.language === "French" ? "fr" : "en") : patientLang}
                   className={l.kind === "meaning" ? "mb-1.5 text-xs text-slate-500" : l.kind === "say" ? "font-medium" : ""}>
                  {l.text}
                </p>
              ),
            )}
          </div>
        </div>
      ) : (
        <p className="text-slate-500">No call script for this clinic.</p>
      )}
    </div>
  );
}
