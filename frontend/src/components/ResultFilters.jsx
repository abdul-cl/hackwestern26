import { SlidersHorizontal, X } from "lucide-react";
import { displayStatus } from "../lib/clinics";
import { COVERAGE_LABELS } from "../config";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "accepting", label: "Accepting" },
  { key: "waitlist", label: "Waitlist open" },
  { key: "closed", label: "Not accepting" },
];

// Words in a clinic's coverage badges (from its own website, via the ranking) that mean it takes this coverage.
const COVERAGE_WORDS = {
  OHIP: ["ohip"],
  UHIP: ["uhip"],
  Uninsured: ["uninsured", "no ohip", "without ohip", "no health card", "free"],
};

/** True when the clinic's own site says it takes this coverage. Clinics that don't say are not counted as a match. */
export function takesCoverage(clinic, coverage) {
  const words = COVERAGE_WORDS[coverage] || [coverage.toLowerCase()];
  return (clinic.coverage_tags || []).some((t) => words.some((w) => t.toLowerCase().includes(w)));
}

export function applyFilters(clinics, filters, coverage) {
  return clinics.filter(
    (c) => (filters.status === "all" || displayStatus(c) === filters.status) && (!filters.coverageOnly || takesCoverage(c, coverage)),
  );
}

/**
 * Filters above the results: status, and "takes my coverage" (so people with OHIP, UHIP or no coverage see the
 * clinics that say they'll take them). Counts are shown so an empty filter is never a surprise.
 */
export default function ResultFilters({ clinics, filters, onChange, coverage, ranked }) {
  const count = (key) => (key === "all" ? clinics.length : clinics.filter((c) => displayStatus(c) === key).length);
  const coverageCount = clinics.filter((c) => takesCoverage(c, coverage)).length;
  const shown = applyFilters(clinics, filters, coverage).length;
  const active = filters.status !== "all" || filters.coverageOnly;

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
              onClick={() => onChange({ ...filters, status: f.key })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filters.status === f.key ? "bg-ink text-paper" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {f.label} <span className="tabular-nums opacity-70">{count(f.key)}</span>
            </button>
          ))}
        </div>
        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <button
          type="button"
          aria-pressed={filters.coverageOnly}
          disabled={!ranked}
          title={ranked ? undefined : "Available once the results are ranked"}
          onClick={() => onChange({ ...filters, coverageOnly: !filters.coverageOnly })}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${filters.coverageOnly ? "bg-brand text-white ring-brand" : "bg-surface text-slate-700 ring-slate-200 hover:bg-slate-50"}`}
        >
          Takes {COVERAGE_LABELS[coverage]?.short || coverage} <span className="tabular-nums opacity-70">{coverageCount}</span>
        </button>
        {active && (
          <button type="button" onClick={() => onChange({ status: "all", coverageOnly: false })} className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-ink">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
      {active && (
        <p className="mt-2 text-xs text-slate-500">
          Showing {shown} of {clinics.length} clinics.
          {filters.coverageOnly && ` Clinics whose website doesn't mention ${COVERAGE_LABELS[coverage]?.short || coverage} are hidden; call them to ask.`}
        </p>
      )}
    </div>
  );
}
