import { useCallback } from "react";
import { useAppState } from "../state/AppState";
import WatchdogView from "../components/WatchdogView";
import ErrorBoundary from "../components/ErrorBoundary";

export default function WatchdogPage() {
  const { search, setSearch, setAlert, setWatchCount } = useAppState();
  const onEmail = useCallback((value) => setSearch((s) => ({ ...s, email: value })), [setSearch]);
  const onChanged = useCallback((n) => setWatchCount(n), [setWatchCount]);

  return (
    <div className="container-page py-8">
      <div className="mb-6 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Watchdog</h1>
        <p className="mt-1 text-slate-500">
          Full clinics you're watching. CareScout re-checks their websites and alerts you when one starts accepting patients.
        </p>
      </div>
      <ErrorBoundary label="The Watchdog">
        <WatchdogView email={search.email} onEmail={onEmail} onAlert={setAlert} onChanged={onChanged} />
      </ErrorBoundary>
    </div>
  );
}
