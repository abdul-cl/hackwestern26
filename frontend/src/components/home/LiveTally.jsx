import { useEffect, useState } from "react";
import { api } from "../../api";
import { displayStatus } from "../../lib/clinics";
import CountUp from "../CountUp";

/**
 * One honest sentence from the live clinic database: how many London clinics CareScout tracks and how many say, on
 * their own website, that they take new patients. Uses the same list a search shows (no directories, one entry per
 * clinic website, nothing whose status is too old to trust). Hidden if the backend can't be reached.
 */
export default function LiveTally() {
  const [tally, setTally] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .listClinics("London, ON", null, 25)
      .then((r) => {
        if (!live || !r.clinics?.length) return;
        const current = r.clinics.filter((c) => !c.expired && displayStatus(c) !== "unknown");
        setTally({ total: r.clinics.length, accepting: current.filter((c) => c.status === "accepting").length });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!tally) return <p className="mt-6 h-6" aria-hidden="true" />;
  return (
    <p className="mt-6 animate-fade-in text-sm text-slate-600">
      Right now CareScout tracks <CountUp value={tally.total} className="font-semibold text-ink" /> London clinics, and{" "}
      <CountUp value={tally.accepting} className="font-semibold text-pine-700" /> of them say on their own website that they're taking new patients.
    </p>
  );
}
