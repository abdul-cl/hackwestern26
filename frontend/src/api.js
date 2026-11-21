// Every backend call lives here, so components never build URLs or parse errors themselves.
import { API_BASE_URL, API_KEY } from "./config";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Owner-only unlock for a public deployment: in your own browser's console run
 *   localStorage.setItem("carescout_admin_key", "<CARESCOUT_ADMIN_KEY>")
 * and reload. Live agents then work for you only; the key is never part of the site's code.
 */
function adminKey() {
  try {
    return localStorage.getItem("carescout_admin_key") || "";
  } catch {
    return "";
  }
}

function headers(json = true) {
  const h = {};
  if (json) h["Content-Type"] = "application/json";
  if (API_KEY) h["X-API-Key"] = API_KEY;
  const admin = adminKey();
  if (admin) h["X-Admin-Key"] = admin;
  return h;
}

async function errorFrom(res) {
  // Backend errors are always JSON { detail: string } (422 details can be a list of field errors).
  let detail = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") detail = body.detail;
    else if (Array.isArray(body.detail)) detail = body.detail.map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ");
  } catch {
    /* not JSON */
  }
  return new ApiError(detail, res.status);
}

async function request(method, path, { body, query, signal } = {}) {
  const url = new URL(API_BASE_URL + path);
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError(`Can't reach the CareScout backend at ${API_BASE_URL}. Is it running?`, 0);
  }
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

/**
 * POST an endpoint that answers with Server-Sent Events and call onEvent(obj) for every `data: {...}` message.
 * Lines starting with ":" are keep-alives and are ignored. Resolves when the stream ends; rejects on HTTP or
 * network errors. Pass an AbortSignal to stop it.
 */
export async function streamPost(path, body, onEvent, signal) {
  let res;
  try {
    res = await fetch(API_BASE_URL + path, { method: "POST", headers: headers(), body: JSON.stringify(body), signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError(`Can't reach the CareScout backend at ${API_BASE_URL}. Is it running?`, 0);
  }
  if (!res.ok) throw await errorFrom(res); // 401 / 422 / 500 arrive as normal JSON before the stream starts
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue; // keep-alive comments start with ":"
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        onEvent(JSON.parse(json));
      } catch (e) {
        console.warn("Skipping malformed stream event", json, e);
      }
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop(); // keep the incomplete tail for the next chunk
    parts.forEach(flush);
  }
  if (buffer.trim()) flush(buffer);
}

export const api = {
  health: () => request("GET", "/health"),
  missionStream: (body, onEvent, signal) => streamPost("/api/mission/stream", body, onEvent, signal),
  apply: (waitlistUrl, patientInfo) =>
    request("POST", "/api/apply", { body: { waitlist_url: waitlistUrl, patient_info: patientInfo } }),
  verifyDoctor: (doctorName, city) => request("POST", "/api/verify-doctor", { body: { doctor_name: doctorName, city } }),
  addWatch: (clinic, userEmail) =>
    request("POST", "/api/watch", {
      body: { clinic_name: clinic.name, url: clinic.url, last_status: clinic.status, user_email: userEmail },
    }),
  listWatches: (userEmail) => request("GET", "/api/watch", { query: { user_email: userEmail } }),
  checkWatches: (userEmail) => request("POST", "/api/watch/check", { query: { user_email: userEmail } }),
  deleteWatch: (id, userEmail) => request("DELETE", `/api/watch/${id}`, { query: { user_email: userEmail } }),
  watchAlerts: (userEmail, limit = 20) => request("GET", "/api/watch/alerts", { query: { user_email: userEmail, limit } }),
  listClinics: (city, postalCode, limit = 25) =>
    request("GET", "/api/clinics", { query: { city, postal_code: postalCode || undefined, limit } }),
  clinicStats: () => request("GET", "/api/clinics/stats"),
  refreshClinic: (url, city, postalCode) =>
    request("POST", "/api/clinics/refresh", { body: { url, city, user_postal_code: postalCode || null } }),
  simulateOpening: (watchId) => request("POST", "/api/watch/simulate-opening", { body: watchId ? { watch_id: watchId } : {} }),
};
