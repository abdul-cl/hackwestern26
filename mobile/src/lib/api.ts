// Every backend call goes through here, same as frontend/src/api.js
import { fetch as expoFetch } from "expo/fetch";
import { API_BASE_URL, API_KEY } from "./config";
import type { ApplyResult, Clinic, DoctorVerification, Feedback, MissionEvent, MissionRequest, PatientInfo, RankedClinic, Watch, WatchAlert } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// owner-only unlock for the public deployment (same as the website's localStorage key).
// it's typed in on the How it works tab and kept on the phone, never baked into the app
let adminKey = "";
export function setAdminKey(key: string) {
  adminKey = key.trim();
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (API_KEY) h["X-API-Key"] = API_KEY;
  if (adminKey) h["X-Admin-Key"] = adminKey;
  return h;
}

const unreachable = () =>
  new ApiError(`Can't reach the CareScout backend at ${API_BASE_URL}. Is it running?`, 0);

// backend errors come back as { detail: "..." }, anything else means we hit the wrong server
async function errorFrom(res: { status: number; json: () => Promise<any> }) {
  let detail = `The CareScout API at ${API_BASE_URL} didn't answer properly (HTTP ${res.status}). Check EXPO_PUBLIC_API_URL.`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") detail = body.detail;
    else if (Array.isArray(body.detail)) {
      detail = body.detail.map((d: any) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ");
    }
  } catch {
    // not json, keep the message above
  }
  return new ApiError(friendlyDetail(detail), res.status);
}

// the backend's "X_API_KEY is missing" errors are meant for developers, so say what it means for the user
export const SETUP_HINT = "isn't set up on this server";
function friendlyDetail(detail: string) {
  if (/TINYFISH_API_KEY is missing/i.test(detail)) {
    return `Live search ${SETUP_HINT} yet (its TinyFish key is missing). Turn on Demo mode to see saved results, or add the key to backend/.env and restart the backend.`;
  }
  if (/GEMINI_API_KEY is missing/i.test(detail)) {
    return `Ranking ${SETUP_HINT} yet (its Gemini key is missing). Add the key to backend/.env and restart the backend.`;
  }
  return detail;
}

type RequestOpts = { body?: unknown; query?: Record<string, string | number | undefined | null> };

async function request<T>(method: string, path: string, { body, query }: RequestOpts = {}): Promise<T> {
  let url = API_BASE_URL + path;
  const params = Object.entries(query || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  if (params.length) url += "?" + params.join("&");

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw unreachable();
  }
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

// POSTs to an SSE endpoint and calls onEvent for each "data: {...}" message.
// RN's normal fetch can't read a stream, which is why this one uses expo/fetch.
export async function streamPost(
  path: string,
  body: unknown,
  onEvent: (e: MissionEvent) => void,
  signal?: AbortSignal,
) {
  let res;
  try {
    res = await expoFetch(API_BASE_URL + path, {
      method: "POST",
      headers: { ...headers(), Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    throw unreachable();
  }
  if (!res.ok) throw await errorFrom(res); // 401/422/500 show up as normal json before the stream starts
  if (!res.body) throw new ApiError("The backend didn't send a stream back.", res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue; // lines starting with ":" are keep-alives
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        onEvent(JSON.parse(json));
      } catch (e) {
        console.warn("Skipping bad stream event", json, e);
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? ""; // last piece might be cut off, save it for the next chunk
    parts.forEach(flush);
  }
  if (buffer.trim()) flush(buffer);
}

export const api = {
  health: () => request<{ status: string; public_demo: boolean; apply?: boolean }>("GET", "/health"),
  missionStream: (body: MissionRequest, onEvent: (e: MissionEvent) => void, signal?: AbortSignal) =>
    streamPost("/api/mission/stream", body, onEvent, signal),
  apply: (waitlistUrl: string, patientInfo: PatientInfo) =>
    request<ApplyResult>("POST", "/api/apply", { body: { waitlist_url: waitlistUrl, patient_info: patientInfo } }),
  // a full postal code -> its city, so the search runs where the patient lives
  locate: (postalCode: string) => request<{ city: string | null }>("GET", "/api/locate", { query: { postal_code: postalCode } }),
  feedback: (body: Feedback) => request<{ ok: boolean }>("POST", "/api/feedback", { body }),
  verifyDoctor: (doctorName: string, city: string) =>
    request<DoctorVerification>("POST", "/api/verify-doctor", { body: { doctor_name: doctorName, city } }),
  // saved clinics for a city, straight from the database (no agents), used to show results instantly
  listClinics: (city: string, postalCode: string | null, limit: number, includeUnchecked = false) =>
    request<{ clinics: Clinic[] }>("GET", "/api/clinics", {
      query: { city, postal_code: postalCode || undefined, limit, include_unchecked: includeUnchecked ? "true" : undefined },
    }),
  // re-ranks a whole list together, used after "Load more" so old and new clinics are scored side by side
  rank: (clinics: Clinic[], language: string, coverageType: string) =>
    request<{ ranked_clinics: RankedClinic[] }>("POST", "/api/rank", {
      body: { clinics, language, coverage_type: coverageType, preferences: [] },
    }),
  addWatch: (clinic: Pick<Clinic, "name" | "url" | "status">, userEmail: string) =>
    request("POST", "/api/watch", {
      body: { clinic_name: clinic.name, url: clinic.url, last_status: clinic.status, user_email: userEmail },
    }),
  listWatches: (userEmail?: string) =>
    request<{ watched_clinics: Watch[] }>("GET", "/api/watch", { query: { user_email: userEmail } }),
  checkWatches: (userEmail?: string) =>
    request<{ checked: number; failed: number; alerts: WatchAlert[] }>("POST", "/api/watch/check", { query: { user_email: userEmail } }),
  deleteWatch: (id: number, userEmail: string) =>
    request<{ deleted: boolean; id: number }>("DELETE", `/api/watch/${id}`, { query: { user_email: userEmail } }),
  watchAlerts: (userEmail?: string, limit = 20) =>
    request<{ alerts: WatchAlert[] }>("GET", "/api/watch/alerts", { query: { user_email: userEmail, limit } }),
  simulateOpening: (watchId?: number) =>
    request<{ alert: WatchAlert }>("POST", "/api/watch/simulate-opening", { body: watchId ? { watch_id: watchId } : {} }),
  refreshClinic: (url: string, city: string, postalCode?: string) =>
    request<{ clinic: Clinic; method: string; status_changed?: boolean; error?: string | null }>("POST", "/api/clinics/refresh", {
      body: { url, city, user_postal_code: postalCode || null },
    }),
};
