import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, Loader2, MapPinned, RotateCcw, Sparkles } from "lucide-react";
import { useAppState } from "../state/AppState";
import { mergeClinics } from "../lib/clinics";
import MissionForm from "../components/MissionForm";
import AgentFeed from "../components/AgentFeed";
import ClinicMap from "../components/ClinicMap";
import ClinicCard from "../components/ClinicCard";
import ApplyModal from "../components/ApplyModal";
import ErrorBoundary from "../components/ErrorBoundary";
import NextSteps from "../components/NextSteps";
import WatchPrompt from "../components/WatchPrompt";
import { useFlip } from "../hooks/useFlip";
import { scrollToTarget } from "../lib/motion";

function EmptyState() {
  const steps = [
    { icon: MapPinned, title: "Find the clinics", text: "Searches your city for family practices." },
    { icon: Bot, title: "Read every website", text: "Agents check who's accepting new patients." },
    { icon: Sparkles, title: "Rank them for you", text: "Sorted for your coverage, language and distance." },
  ];
  return (
    <div className="card animate-card-in p-8">
      <h2 className="text-xl font-bold">Your results will appear here</h2>
      <p className="mt-1 text-sm text-slate-500">
        Press <b className="text-ink">Launch CareScout</b> to start. A live search takes a few minutes; Demo mode shows saved results instantly.
      </p>
      <ol className="mt-6 grid gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-paper">{i + 1}</span>
              {title}
            </div>
            <div className="mt-2 flex items-start gap-2 text-xs text-slate-500">
              <Icon className="h-4 w-4 shrink-0 text-pine-600" />
              {text}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function FindPage() {
  const { search, setSearch, mission, launch, refreshWatchCount, publicDemo } = useAppState();
  const { state, stop, reset, retryRank } = mission;
  const [params, setParams] = useSearchParams();
  const [selectedUrl, setSelectedUrl] = useState(null);
  const [applyFor, setApplyFor] = useState(null);
  const cardRefs = useRef({});
  const email = search.email.trim();

  const clinics = useMemo(() => mergeClinics(state.scanned, state.urls, state.ranked), [state.scanned, state.urls, state.ranked]);
  // cards glide to their ranked position when ranking arrives
  useFlip(clinics.map((c) => c.url), cardRefs);

  // /find?demo=1 (from the home page): switch on Demo mode and run it straight away (once).
  const demoStarted = useRef(false);
  useEffect(() => {
    if (params.get("demo") === "1" && !demoStarted.current) {
      demoStarted.current = true;
      setParams({}, { replace: true });
      setSearch((s) => ({ ...s, useCache: true }));
      if (!state.running) launch({ useCache: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLaunch = () => {
    setSelectedUrl(null);
    launch();
  };

  const selectClinic = useCallback((url) => {
    setSelectedUrl(url);
    const card = cardRefs.current[url];
    if (card) scrollToTarget(card, { offset: -96 });
  }, []);

  return (
    <div className="container-page space-y-4 py-8">
      <div className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight">Find a family doctor</h1>
        <p className="mt-1 text-slate-500">Tell CareScout where you are and what you need. Agents check each clinic's website for you.</p>
      </div>

      <MissionForm values={search} onChange={setSearch} onLaunch={onLaunch} onStop={stop} running={state.running} publicDemo={publicDemo} />
      <AgentFeed state={state} onStop={stop} onReset={reset} />
      {/* full clinics: watched only if the person gave an email or asks here */}
      {state.summary && !state.running && <WatchPrompt key={state.log[0]?.id} clinics={clinics} watched={state.watched} />}

      {clinics.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-2">
            <div className="h-[360px] lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
              <ErrorBoundary label="The map">
                <ClinicMap clinics={clinics} selectedUrl={selectedUrl} onSelect={selectClinic} />
              </ErrorBoundary>
            </div>
          </div>
          <div className="min-w-0 space-y-3 lg:col-span-3">
            {state.rankError && !state.running && (
              <div className="flex animate-slide-down flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="min-w-0 flex-1">
                  Ranking is unavailable right now (the AI model is busy), so these results aren't sorted for you yet. Everything else is up to date.
                </span>
                <button onClick={retryRank} disabled={state.rankRetrying} className="btn-secondary py-1.5">
                  {state.rankRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Retry ranking
                </button>
              </div>
            )}
            {clinics.map((c, i) => (
              <ErrorBoundary key={c.url} label={`The card for ${c.name || c.url}`}>
                <ClinicCard
                  ref={(el) => (cardRefs.current[c.url] = el)}
                  clinic={c}
                  enterDelay={Math.min(i, 8) * 45}
                  selected={c.url === selectedUrl}
                  onSelect={setSelectedUrl}
                  onApply={setApplyFor}
                  email={email}
                  city={search.city}
                  onWatched={refreshWatchCount}
                />
              </ErrorBoundary>
            ))}
          </div>
        </div>
      ) : (
        !state.running && state.log.length === 0 && <EmptyState />
      )}

      {state.summary && !state.running && <NextSteps />}

      {applyFor && <ApplyModal clinic={applyFor} defaults={search} onClose={() => setApplyFor(null)} />}
    </div>
  );
}
