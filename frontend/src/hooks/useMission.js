import { useCallback, useReducer, useRef } from "react";
import { api } from "../api";
import { isFailedScan } from "../lib/clinics";

export const STAGES = [
  { key: "discover", label: "Scout" },
  { key: "scan", label: "Browser Swarm" },
  { key: "rank", label: "Triage" },
  { key: "watch", label: "Watchdog" },
  { key: "done", label: "Done" },
];

const initial = {
  running: false,
  stage: null, // current stage key
  stageStatus: {}, // { discover: "active" | "done" | "error" | "skipped" }
  log: [], // [{ id, time, kind, stage, text }]
  urls: [], // discovered order
  agents: {}, // { [url]: "queued" | "scanning" | "done" }
  scanned: {}, // { [url]: Clinic }
  ranked: null, // RankedClinic[]
  watched: [], // Watch[]
  summary: null,
  error: null, // fatal error (request failed / stream broke)
  stopped: false,
};

let logId = 0;
const entry = (kind, text, stage) => ({ id: ++logId, time: new Date(), kind, text, stage });

function markStage(stageStatus, stage) {
  const next = { ...stageStatus };
  for (const s of STAGES) {
    if (s.key === stage) break;
    if (next[s.key] === "active" || !next[s.key]) next[s.key] = next[s.key] === "error" ? "error" : "done";
  }
  if (next[stage] !== "error") next[stage] = "active";
  return next;
}

function reducer(state, action) {
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
    case "reset":
      return initial;
    default:
      return state;
  }
}

function applyEvent(state, e) {
  switch (e.type) {
    case "stage": {
      const skipped = e.stage === "watch" && /skipped/i.test(e.message);
      const stageStatus = markStage(state.stageStatus, e.stage);
      if (skipped) stageStatus.watch = "skipped";
      return { ...state, stage: e.stage, stageStatus, log: [...state.log, entry("stage", e.message, e.stage)] };
    }
    case "discovered": {
      const agents = Object.fromEntries(e.urls.map((u) => [u, "queued"]));
      return {
        ...state,
        urls: e.urls,
        agents,
        log: [...state.log, entry("info", `Found ${e.urls.length} clinic website${e.urls.length === 1 ? "" : "s"}.`, "discover")],
      };
    }
    case "agent_status": {
      const scanning = /started/i.test(e.message);
      return { ...state, agents: { ...state.agents, [e.url]: scanning ? "scanning" : state.agents[e.url] || "queued" } };
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
        log: [...state.log, entry("result", text, "scan")],
      };
    }
    case "ranked":
      return {
        ...state,
        ranked: e.ranked_clinics,
        log: [...state.log, entry("info", `Ranked ${e.ranked_clinics.length} clinics.`, "rank")],
      };
    case "watched":
      return {
        ...state,
        watched: e.clinics,
        log: [...state.log, entry("info", `Watching ${e.count} full clinic${e.count === 1 ? "" : "s"} for openings.`, "watch")],
      };
    case "error":
      return {
        ...state,
        stageStatus: { ...state.stageStatus, [e.stage]: "error" },
        log: [...state.log, entry("error", e.message, e.stage)],
      };
    case "done": {
      const stageStatus = { ...state.stageStatus };
      for (const s of STAGES) if (stageStatus[s.key] === "active") stageStatus[s.key] = "done";
      stageStatus.done = "done";
      const s = e.summary || {};
      return {
        ...state,
        running: false,
        stage: "done",
        stageStatus,
        summary: e.summary,
        log: [...state.log, entry("done", `Done in ${s.duration_s ?? "?"}s: ${s.accepting_count ?? 0} accepting, ${s.waitlist_count ?? 0} waitlist, ${s.closed_count ?? 0} closed.`, "done")],
      };
    }
    default:
      return state;
  }
}

/** Runs POST /api/mission/stream and keeps all of its live state. */
export function useMission() {
  const [state, dispatch] = useReducer(reducer, initial);
  const controller = useRef(null);

  const start = useCallback(async (body) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    dispatch({ type: "start" });
    try {
      await api.missionStream(body, (event) => dispatch({ type: "event", event }), ctrl.signal);
      dispatch({ type: "finished" });
    } catch (e) {
      if (e.name === "AbortError") return; // stop() already updated the state
      dispatch({ type: "fail", message: e.message || "The mission failed." });
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

  return { state, start, stop, reset };
}
