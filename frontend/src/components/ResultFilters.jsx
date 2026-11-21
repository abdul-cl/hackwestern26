import { SlidersHorizontal, X } from "lucide-react";
import { displayStatus } from "../lib/clinics";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "accepting", label: "Accepting" },
  { key: "waitlist", label: "Waitlist open" },
  { key: "closed", label: "Not accepting" },
];

export function applyFilters(clinics, filters) {
  return clinics.filter((c) => filters.status === "all" || displayStatus(c) === filters.status);
}

/**
 * Status filter above the results (coverage is already chosen in the search form, and the ranking puts clinics that
 * take it first). Counts are shown so an empty filter is never a surprise.
 */
export default function ResultFilters({ clinics, filters, onChange }) {
  const count = (key) => (key === "all" ? clinics.length : clinics.filter((c) => displayStatus(c) === key).length);
  const shown = applyFilters(clinics, filters).length;
  const active = filters.status !== "all";

  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filters.status === f.key}
              onClick={() => onChange({ status: f.key })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filters.status === f.key ? "bg-ink text-paper" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {f.label} <span className="tabular-nums opacity-70">{count(f.key)}</span>
            </button>
          ))}
        </div>
        {active && (
          <button type="button" onClick={() => onChange({ status: "all" })} className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-ink">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
      {active && <p className="mt-2 text-xs text-slate-500">Showing {shown} of {clinics.length} clinics.</p>}
    </div>
  );
}
