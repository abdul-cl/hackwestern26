import { useCallback, useState } from "react";
import { useAppState } from "../state/AppState";
import WatchdogView from "../components/WatchdogView";
import ErrorBoundary from "../components/ErrorBoundary";
import { savedWatchEmail, saveWatchEmail } from "../lib/watchEmail";

export default function WatchdogPage() {
  const { search, setAlert, setWatchCount } = useAppState();
  // the email from this visit's search / "Watch it", else the one this browser last watched with (kept apart from the
  // search form, so opening the Watchdog never makes the next search auto-watch)
  const [email, setEmail] = useState(() => search.email || savedWatchEmail());
  const onEmail = useCallback((value) => {
    setEmail(value);
    saveWatchEmail(value);
  }, []);
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
        <WatchdogView email={email} onEmail={onEmail} onAlert={setAlert} onChanged={onChanged} />
      </ErrorBoundary>
    </div>
  );
}
