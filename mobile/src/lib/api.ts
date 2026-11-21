// Every backend call goes through here, same as frontend/src/api.js
import { fetch as expoFetch } from "expo/fetch";
import { API_BASE_URL, API_KEY } from "./config";
import type { Clinic, MissionEvent, MissionRequest, Watch } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (API_KEY) h["X-API-Key"] = API_KEY;
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
  return new ApiError(detail, res.status);
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
  health: () => request<{ status: string; public_demo: boolean }>("GET", "/health"),
  missionStream: (body: MissionRequest, onEvent: (e: MissionEvent) => void, signal?: AbortSignal) =>
    streamPost("/api/mission/stream", body, onEvent, signal),
  addWatch: (clinic: Pick<Clinic, "name" | "url" | "status">, userEmail: string) =>
    request("POST", "/api/watch", {
      body: { clinic_name: clinic.name, url: clinic.url, last_status: clinic.status, user_email: userEmail },
    }),
  listWatches: (userEmail?: string) =>
    request<{ watched_clinics: Watch[] }>("GET", "/api/watch", { query: { user_email: userEmail } }),
  refreshClinic: (url: string, city: string, postalCode?: string) =>
    request<{ clinic: Clinic; method: string; status_changed?: boolean; error?: string }>("POST", "/api/clinics/refresh", {
      body: { url, city, user_postal_code: postalCode || null },
    }),
};
