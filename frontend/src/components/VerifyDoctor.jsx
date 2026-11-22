import { useState } from "react";
import { BadgeCheck, ExternalLink, Loader2, SearchCheck, ShieldAlert } from "lucide-react";
import { api } from "../api";
import { useAppState } from "../state/AppState";

/** Small drawer: look a doctor up on the official CPSO register (POST /api/verify-doctor). */
export default function VerifyDoctor({ city }) {
  const { publicDemo } = useAppState();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const verify = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setResult(await api.verifyDoctor(name.trim(), (city || "London").split(",")[0].trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (publicDemo) {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Doctor lookups run a live agent, which is turned off on this public demo. You can search the{" "}
        <a href="https://register.cpso.on.ca/" target="_blank" rel="noreferrer" className="font-medium text-pine-700 underline-offset-2 hover:underline">
          official CPSO register <ExternalLink className="inline h-3 w-3" />
        </a>{" "}
        directly.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <form onSubmit={verify} className="flex gap-2">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Doctor's name, e.g. Jane Smith"
          minLength={2}
          maxLength={100}
          aria-label="Doctor's name"
        />
        <button className="btn-secondary shrink-0" disabled={loading || name.trim().length < 2}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />} Verify
        </button>
      </form>
      {loading && <p className="mt-2 text-xs text-slate-500">Checking the official CPSO register. Usually about 10 seconds.</p>}
      {error && <p className="mt-2 text-rose-700">{error}</p>}
      {result && (
        <div className="mt-3 space-y-1.5">
          {result.verified ? (
            <span className="badge bg-emerald-50 text-emerald-700 ring-emerald-600/20"><BadgeCheck className="h-3.5 w-3.5" /> CPSO verified</span>
          ) : (
            <span className="badge bg-amber-50 text-amber-700 ring-amber-600/20">
              <ShieldAlert className="h-3.5 w-3.5" />
              {result.lookup_status === "found" ? "Not active" : result.lookup_status === "not_found" ? "Not found" : "Couldn't verify"}
            </span>
          )}
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            {result.cpso_number && (<><dt className="text-slate-500">CPSO #</dt><dd className="font-medium text-slate-800">{result.cpso_number}</dd></>)}
            {result.registration_status && (<><dt className="text-slate-500">Status</dt><dd className="text-slate-800">{result.registration_status}</dd></>)}
            {result.specialty && (<><dt className="text-slate-500">Specialty</dt><dd className="text-slate-800">{result.specialty}</dd></>)}
            {result.languages?.length > 0 && (<><dt className="text-slate-500">Languages</dt><dd className="text-slate-800">{result.languages.join(", ")}</dd></>)}
          </dl>
          {result.notes && <p className="text-xs text-slate-600">{result.notes}</p>}
          {result.profile_url && (
            <a href={result.profile_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline">
              Official CPSO profile <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
