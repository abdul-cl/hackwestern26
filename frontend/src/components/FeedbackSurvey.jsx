import { useState } from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { api } from "../api";

const HELPED = [
  { key: "yes", label: "Yes" },
  { key: "somewhat", label: "Somewhat" },
  { key: "no", label: "No" },
];
const DONE_KEY = "carescout_feedback_sent";

const alreadySent = () => {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * A short, anonymous survey (POST /api/feedback): did this help, how easy was it, anything to tell us.
 * No email or health details are asked for. Shown once per browser; thanks message afterwards.
 */
export default function FeedbackSurvey({ page = "" }) {
  const [helped, setHelped] = useState(null);
  const [ease, setEase] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState(alreadySent() ? "sent-before" : "open"); // open | sending | sent | sent-before
  const [error, setError] = useState(null);

  if (state === "sent-before") return null;

  if (state === "sent") {
    return (
      <section className="card flex animate-pop-in items-center gap-3 p-5">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-pine-600" />
        <p className="text-sm text-ink">Thank you. Your answers help us make finding a family doctor a little easier.</p>
      </section>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!helped) {
      setError("Please answer the first question.");
      return;
    }
    setState("sending");
    setError(null);
    try {
      await api.feedback({ helped, ease: ease || null, comment: comment.trim(), page });
      try {
        localStorage.setItem(DONE_KEY, "1");
      } catch {
        /* private mode: we just might ask again next time */
      }
      setState("sent");
    } catch (err) {
      setError(err.message);
      setState("open");
    }
  };

  return (
    <section className="card animate-card-in p-5" aria-labelledby="feedback-title">
      <h2 id="feedback-title" className="text-lg font-bold">How did CareScout do?</h2>
      <p className="mt-1 text-xs text-slate-500">Three quick questions. Anonymous: please don't include your name or health details.</p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <fieldset>
          <legend className="text-sm font-medium text-ink">Did it help you find a clinic to try?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {HELPED.map((h) => (
              <button
                key={h.key}
                type="button"
                aria-pressed={helped === h.key}
                onClick={() => setHelped(h.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${helped === h.key ? "bg-brand text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-ink">How easy was it to use?</legend>
          <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} out of 5`}
                aria-pressed={ease === n}
                onClick={() => setEase(n)}
                onMouseEnter={() => setHover(n)}
                className="rounded p-0.5 transition-transform hover:scale-110"
              >
                <Star className={`h-6 w-6 ${(hover || ease) >= n ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} />
              </button>
            ))}
            <span className="ml-2 text-xs text-slate-500">{["", "Very hard", "Hard", "Okay", "Easy", "Very easy"][hover || ease]}</span>
          </div>
        </fieldset>

        <div>
          <label className="text-sm font-medium text-ink" htmlFor="fb-comment">Anything we should change or add? <span className="font-normal text-slate-400">(optional)</span></label>
          <textarea id="fb-comment" className="input mt-2 min-h-[72px] resize-y" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}
        <button className="btn-primary" disabled={state === "sending"}>
          {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" />} Send feedback
        </button>
      </form>
    </section>
  );
}
