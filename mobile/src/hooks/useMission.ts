// Runs POST /api/mission/stream and keeps all the live state for the Find screen.
// Pretty much a straight port of frontend/src/hooks/useMission.js
import { useCallback, useReducer, useRef } from "react";
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
  | { type: "reset" };

function reducer(state: MissionState, action: Action): MissionState {
  switch (action.type) {
    case "start":
      return { ...initial, running: true, log: [entry("info", "Launching CareScout mission...")] };
    case "event":
      return applyEvent(state, action.event);
    case "fail":
      return { ...state, running: false, error: action.message, log: [...state.log, entry("error", action.message)] };
    case "stopped":
      return { ...state, running: false, stopped: true, log: [...state.log, entry("info", "Mission stopped.")] };
    case "finished":
      return { ...state, running: false };
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
      const urls = state.urls.includes(c.url) ? state.urls : [...state.urls, c.url];
      const text = isFailedScan(c) ? `Couldn't check ${c.url.replace(/^https?:\/\//, "")}` : `${c.name}: ${c.status}`;
      return {
        ...state,
        urls,
        agents: { ...state.agents, [c.url]: "done" },
        scanned: { ...state.scanned, [c.url]: c },
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
        stageStatus: { ...state.stageStatus, [e.stage]: "error" },
        log: [...state.log, entry("error", e.message)],
      };
    case "done": {
      const stageStatus = { ...state.stageStatus };
      for (const s of STAGES) if (stageStatus[s.key] === "active") stageStatus[s.key] = "done";
      stageStatus.done = "done";
      const s = e.summary || ({} as MissionSummary);
      const text = `Done in ${s.duration_s ?? "?"}s: ${s.accepting_count ?? 0} accepting, ${s.waitlist_count ?? 0} waitlist, ${s.closed_count ?? 0} closed.`;
      return { ...state, running: false, stage: "done", stageStatus, summary: e.summary, log: [...state.log, entry("done", text)] };
    }
    default:
      return state;
  }
}

export function useMission() {
  const [state, dispatch] = useReducer(reducer, initial);
  const controller = useRef<AbortController | null>(null);

  const start = useCallback(async (body: MissionRequest) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    dispatch({ type: "start" });
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
      dispatch({ type: "stopped" });
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

  return { state, start, stop, reset, updateClinic, restore };
}

export type Mission = ReturnType<typeof useMission>;
