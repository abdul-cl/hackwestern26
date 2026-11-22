// Runs POST /api/mission/stream and keeps all the live state for the Find screen.
// Pretty much a straight port of frontend/src/hooks/useMission.js
import { useCallback, useEffect, useReducer, useRef } from "react";
import { api } from "@/lib/api";
import { isFailedScan } from "@/lib/clinics";
import type { Clinic, MissionEvent, MissionRequest, MissionSummary, RankedClinic, StageKey, Watch } from "@/lib/types";

export const STAGES: { key: StageKey; label: string }[] = [
  { key: "discover", label: "Scout" },
  { key: "scan", label: "Swarm" },
  { key: "rank", label: "Triage" },
  { key: "watch", label: "Watchdog" },
  { key: "done", label: "Done" },
];

const RANK_LIMIT = 30; // the backend's /api/rank cap

export type StageStatus = "active" | "done" | "error" | "skipped";
export type AgentStatus = "queued" | "scanning" | "done";
export type LogEntry = { id: number; time: Date; kind: "info" | "stage" | "result" | "error" | "done"; text: string };

export type MissionState = {
  running: boolean;
  stage: StageKey | null;
  stageStatus: Partial<Record<StageKey, StageStatus>>;
  log: LogEntry[];
  urls: string[];
  agents: Record<string, AgentStatus>;
  scanned: Record<string, Clinic>;
  ranked: RankedClinic[] | null;
  watched: Watch[];
  summary: MissionSummary | null;
  error: string | null;
  stopped: boolean;
  restoredAt: string | null; // set when these are the saved results from last time, not a live search
  preview: Clinic[]; // saved clinics shown straight away while the agents confirm them
  loadingMore: boolean;
  noMore: boolean; // "Load more" found nothing new
  rankError: string | null; // ranking failed (Gemini busy): results show unranked with "Retry ranking"
  rankRetrying: boolean;
};

const initial: MissionState = {
  running: false,
  stage: null,
  stageStatus: {},
  log: [],
  urls: [],
  agents: {},
  scanned: {},
  ranked: null,
  watched: [],
  summary: null,
  error: null,
  stopped: false,
  restoredAt: null,
  preview: [],
  loadingMore: false,
  noMore: false,
  rankError: null,
  rankRetrying: false,
};

let logId = 0;
const entry = (kind: LogEntry["kind"], text: string): LogEntry => ({ id: ++logId, time: new Date(), kind, text });

// marks everything before this stage as done and this one as active
function markStage(stageStatus: MissionState["stageStatus"], stage: StageKey) {
  const next = { ...stageStatus };
  for (const s of STAGES) {
    if (s.key === stage) break;
    if (next[s.key] === "active" || !next[s.key]) next[s.key] = "done";
  }
  if (next[stage] !== "error") next[stage] = "active";
  return next;
}

type Action =
  | { type: "start" }
  | { type: "event"; event: MissionEvent }
  | { type: "fail"; message: string }
  | { type: "stopped" }
  | { type: "finished" }
  | { type: "clinic_updated"; clinic: Clinic }
  | { type: "restore"; saved: Pick<MissionState, "urls" | "scanned" | "ranked" | "summary"> & { savedAt: string } }
  | { type: "reset" }
  | { type: "preview"; clinics: Clinic[] }
  | { type: "more_start" }
  | { type: "more_event"; event: MissionEvent }
  | { type: "more_ranked"; ranked: RankedClinic[] }
  | { type: "more_end"; added: number; error?: string }
  | { type: "rank_retry" }
  | { type: "rank_retry_done"; ranked: RankedClinic[] }
  | { type: "rank_retry_failed"; message: string };

function reducer(state: MissionState, action: Action): MissionState {
  switch (action.type) {
    case "start":
      return { ...initial, running: true, log: [entry("info", "Launching CareScout mission...")] };
    case "event":
      return applyEvent(state, action.event);
    case "fail":
      return { ...state, running: false, preview: [], error: action.message, log: [...state.log, entry("error", action.message)] };
    case "stopped":
      return { ...state, running: false, preview: [], stopped: true, log: [...state.log, entry("info", "Mission stopped.")] };
    case "finished":
      return { ...state, running: false, preview: [] };
    case "clinic_updated":
      return {
        ...state,
        scanned: { ...state.scanned, [action.clinic.url]: { ...state.scanned[action.clinic.url], ...action.clinic } },
      };
    case "restore":
      // the saved results from last time. no log, so the live feed stays hidden and the
      // Find screen shows the "saved on this phone" notice instead
      return {
        ...initial,
        urls: action.saved.urls,
        scanned: action.saved.scanned,
        ranked: action.saved.ranked,
        summary: action.saved.summary,
        restoredAt: action.saved.savedAt,
      };
    case "reset":
      return initial;
    case "rank_retry":
      return { ...state, rankRetrying: true, log: [...state.log, entry("stage", "Retrying the ranking...")] };
    case "rank_retry_done":
      return {
        ...state,
        rankRetrying: false,
        rankError: null,
        ranked: action.ranked,
        stageStatus: { ...state.stageStatus, rank: "done" },
        log: [...state.log, entry("info", `Ranked ${action.ranked.length} clinics.`)],
      };
    case "rank_retry_failed":
      return { ...state, rankRetrying: false, rankError: action.message, log: [...state.log, entry("error", `Ranking failed again: ${action.message}`)] };
    case "preview":
      // only useful while nothing real has come back yet
      return state.running ? { ...state, preview: action.clinics.filter((c) => !state.scanned[c.url]) } : state;
    case "more_start":
      return { ...state, loadingMore: true, noMore: false, log: [...state.log, entry("info", "Loading more clinics...")] };
    case "more_event":
      return applyMoreEvent(state, action.event);
    case "more_ranked":
      return { ...state, ranked: action.ranked, log: [...state.log, entry("info", `Re-ranked all ${action.ranked.length} clinics.`)] };
    case "more_end": {
      const summary = state.summary ? { ...state.summary, ...countStatuses(state.scanned) } : state.summary;
      const text = action.error || (action.added ? `Added ${action.added} more clinic${action.added === 1 ? "" : "s"}.` : "No more clinics saved for this area.");
      return {
        ...state,
        loadingMore: false,
        noMore: !action.error && action.added === 0,
        summary,
        log: [...state.log, entry(action.error ? "error" : "info", text)],
      };
    }
  }
}

// recount after "Load more" so the stats line up with the cards
function countStatuses(scanned: Record<string, Clinic>) {
  const all = Object.values(scanned);
  const failed = all.filter(isFailedScan);
  const ok = all.filter((c) => !isFailedScan(c));
  return {
    total_scanned: all.length,
    accepting_count: ok.filter((c) => c.status === "accepting").length,
    waitlist_count: ok.filter((c) => c.status === "waitlist").length,
    closed_count: ok.filter((c) => c.status === "closed").length,
    failed_count: failed.length,
  };
}

// a "Load more" run only adds clinics; it never replaces the list, ranking or stages
function applyMoreEvent(state: MissionState, e: MissionEvent): MissionState {
  switch (e.type) {
    case "agent_status":
    case "clinic_scanned":
      return applyEvent(state, e);
    case "watched":
      return { ...state, watched: [...state.watched, ...e.clinics.filter((w) => !state.watched.some((x) => x.url === w.url))] };
    case "error":
      return { ...state, log: [...state.log, entry("error", e.message)] };
    default:
      return state;
  }
}

function applyEvent(state: MissionState, e: MissionEvent): MissionState {
  switch (e.type) {
    case "stage": {
      const stageStatus = markStage(state.stageStatus, e.stage);
      if (e.stage === "watch" && /skipped/i.test(e.message)) stageStatus.watch = "skipped";
      return { ...state, stage: e.stage, stageStatus, log: [...state.log, entry("stage", e.message)] };
    }
    case "discovered": {
      const agents = Object.fromEntries(e.urls.map((u) => [u, "queued" as AgentStatus]));
      const n = e.urls.length;
      return { ...state, urls: e.urls, agents, log: [...state.log, entry("info", `Found ${n} clinic website${n === 1 ? "" : "s"}.`)] };
    }
    case "agent_status": {
      // "Up to date..." means done, "Reading/started/Following..." means it's working on it
      const status: AgentStatus = /^up to date/i.test(e.message)
        ? "done"
        : /reading|started|following/i.test(e.message) ? "scanning" : "queued";
      return { ...state, agents: { ...state.agents, [e.url]: status } };
    }
    case "clinic_scanned": {
      const c = e.clinic;
      const preview = state.preview.length ? state.preview.filter((p) => p.url !== c.url) : state.preview;
      const urls = state.urls.includes(c.url) ? state.urls : [...state.urls, c.url];
      const text = isFailedScan(c) ? `Couldn't check ${c.url.replace(/^https?:\/\//, "")}` : `${c.name}: ${c.status}`;
      return {
        ...state,
        urls,
        agents: { ...state.agents, [c.url]: "done" },
        scanned: { ...state.scanned, [c.url]: c },
        preview,
        log: [...state.log, entry("result", text)],
      };
    }
    case "ranked":
      return {
        ...state,
        ranked: e.ranked_clinics,
        log: [...state.log, entry("info", `Ranked ${e.ranked_clinics.length} clinics.`)],
      };
    case "watched":
      return {
        ...state,
        watched: e.clinics,
        log: [...state.log, entry("info", `Watching ${e.count} full clinic${e.count === 1 ? "" : "s"} for openings.`)],
      };
    case "error":
      // not fatal, just show it and keep going
      return {
        ...state,
        rankError: e.stage === "rank" ? e.message : state.rankError,
        stageStatus: { ...state.stageStatus, [e.stage]: "error" },
        log: [...state.log, entry("error", e.message)],
      };
    case "done": {
      const stageStatus = { ...state.stageStatus };
      for (const s of STAGES) if (stageStatus[s.key] === "active") stageStatus[s.key] = "done";
      stageStatus.done = "done";
      const s = e.summary || ({} as MissionSummary);
      const text = `Done in ${s.duration_s ?? "?"}s: ${s.accepting_count ?? 0} accepting, ${s.waitlist_count ?? 0} waitlist, ${s.closed_count ?? 0} closed.`;
      return { ...state, running: false, preview: [], stage: "done", stageStatus, summary: e.summary, log: [...state.log, entry("done", text)] };
    }
    default:
      return state;
  }
}

export function useMission() {
  const [state, dispatch] = useReducer(reducer, initial);
  const controller = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const start = useCallback(async (body: MissionRequest) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    dispatch({ type: "start" });
    // saved results straight from the database so the screen isn't empty while the agents work.
    // if this fails it doesn't matter, the live search still runs
    api
      .listClinics(body.city, body.user_postal_code, body.max_clinics, false)
      .then((r) => {
        if (!ctrl.signal.aborted) dispatch({ type: "preview", clinics: r.clinics || [] });
      })
      .catch(() => {});
    try {
      await api.missionStream(body, (event) => dispatch({ type: "event", event }), ctrl.signal);
      dispatch({ type: "finished" });
    } catch (e: any) {
      if (e?.name === "AbortError" || ctrl.signal.aborted) return; // stop() already handled it
      dispatch({ type: "fail", message: e?.message || "The mission failed." });
    } finally {
      if (controller.current === ctrl) controller.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (controller.current) {
      controller.current.abort();
      controller.current = null;
      if (!stateRef.current.loadingMore) dispatch({ type: "stopped" }); // loadMore reports its own stop
    }
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    dispatch({ type: "reset" });
  }, []);

  // swap in one clinic after a re-check without running the whole search again
  const updateClinic = useCallback((clinic: Clinic) => dispatch({ type: "clinic_updated", clinic }), []);

  const restore = useCallback(
    (saved: Pick<MissionState, "urls" | "scanned" | "ranked" | "summary"> & { savedAt: string }) => dispatch({ type: "restore", saved }),
    [],
  );

  // "Load 5 more": finds clinics we haven't shown yet, checks only those, then re-ranks everything together
  const loadMore = useCallback(async (body: MissionRequest, count = 5) => {
    const cur = stateRef.current;
    if (cur.running || cur.loadingMore) return;
    const ctrl = new AbortController();
    controller.current = ctrl;
    dispatch({ type: "more_start" });
    try {
      const shown = new Set([...cur.urls, ...Object.keys(cur.scanned)]);
      const { clinics } = await api.listClinics(body.city, body.user_postal_code, 200, !body.use_cache);
      const next = (clinics || []).map((c) => c.url).filter((u) => !shown.has(u)).slice(0, count);
      if (!next.length) return dispatch({ type: "more_end", added: 0 });

      await api.missionStream({ ...body, clinic_urls: next, max_clinics: next.length }, (event) => dispatch({ type: "more_event", event }), ctrl.signal);

      // re-rank with everyone in, so a new clinic can end up at the top
      const all = { ...stateRef.current.scanned };
      // the ranker takes at most 30, so send the most useful ones: open clinics first, then closest
      const order = { accepting: 0, waitlist: 1, closed: 2 } as Record<string, number>;
      const good = Object.values(all)
        .filter((c) => !isFailedScan(c))
        .sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9))
        .slice(0, RANK_LIMIT);
      if (good.length) {
        try {
          const r = await api.rank(good, body.language, body.coverage_type);
          if (r.ranked_clinics?.length) dispatch({ type: "more_ranked", ranked: r.ranked_clinics });
        } catch {
          // ranking is a bonus, new clinics still show (unranked) under the others
        }
      }
      dispatch({ type: "more_end", added: next.filter((u) => all[u]).length });
    } catch (e: any) {
      if (e?.name === "AbortError" || ctrl.signal.aborted) return dispatch({ type: "more_end", added: 0, error: "Stopped loading more." });
      dispatch({ type: "more_end", added: 0, error: e?.message || "Couldn't load more clinics." });
    } finally {
      if (controller.current === ctrl) controller.current = null;
    }
  }, []);

  // ranking failed (usually Gemini overloaded): rank what's on screen again, without a new search
  const lastBody = useRef<MissionRequest | null>(null);
  const startSearch = useCallback(
    (body: MissionRequest) => {
      lastBody.current = body;
      return start(body);
    },
    [start],
  );
  const retryRank = useCallback(async () => {
    const clinics = Object.values(stateRef.current.scanned).filter((c) => !isFailedScan(c));
    if (!clinics.length) return;
    dispatch({ type: "rank_retry" });
    try {
      const b = lastBody.current;
      const r = await api.rank(clinics.slice(0, RANK_LIMIT), b?.language || "English", b?.coverage_type || "OHIP");
      dispatch({ type: "rank_retry_done", ranked: r.ranked_clinics });
    } catch (e: any) {
      dispatch({ type: "rank_retry_failed", message: e?.message || "ranking is unavailable" });
    }
  }, []);

  return { state, start: startSearch, stop, reset, updateClinic, restore, loadMore, retryRank };
}

export type Mission = ReturnType<typeof useMission>;
