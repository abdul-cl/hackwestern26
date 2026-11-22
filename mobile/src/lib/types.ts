// Shapes of what the backend sends back (copied from the API notes in CLAUDE.md)

export type ClinicStatus = "accepting" | "waitlist" | "closed";

export type Clinic = {
  name: string;
  url: string;
  status: ClinicStatus;
  evidence_quote: string;
  waitlist_url: string | null;
  raw_notes: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
  last_checked?: string | null;
  checked_via?: "page" | "agent" | "saved" | null;
  expired?: boolean;
  status_age_days?: number | null;
};

export type RankedClinic = {
  name: string;
  url: string | null;
  score: number;
  reason: string;
  requirements: string[];
  next_step: string;
  coverage_tags: string[];
  phone_number: string | null;
  call_hours: string | null;
  call_script: string | null;
  posted_wait?: string | null; // only when the clinic posts a wait itself, never estimated
};

// what a card actually shows: scan data with the ranking info merged on top
export type MergedClinic = Clinic & Partial<RankedClinic> & { url: string; ranked: boolean };

export type Watch = {
  id: number;
  clinic_name: string;
  url: string;
  last_status: ClinicStatus;
  user_email: string;
  created_at: string;
  last_checked: string | null;
};

export type MissionSummary = {
  total_scanned: number;
  accepting_count: number;
  waitlist_count: number;
  closed_count: number;
  failed_count: number;
  watched_count: number;
  ranked: boolean;
  top_clinic: string | null;
  duration_s: number;
  from_database: number;
  rechecked: number;
  expired_count: number;
};

export type StageKey = "discover" | "scan" | "rank" | "watch" | "done";

export type MissionEvent =
  | { type: "stage"; stage: StageKey; message: string }
  | { type: "discovered"; urls: string[] }
  | { type: "agent_status"; url: string; message: string }
  | { type: "clinic_scanned"; clinic: Clinic }
  | { type: "ranked"; ranked_clinics: RankedClinic[] }
  | { type: "watched"; count: number; clinics: Watch[] }
  | { type: "error"; stage: StageKey; message: string }
  | { type: "done"; summary: MissionSummary };

export type MissionRequest = {
  city: string;
  user_postal_code: string | null;
  preferences: string[];
  language: string;
  coverage_type: string;
  user_email: string | null;
  auto_watch_closed: boolean;
  use_cache: boolean;
  max_clinics: number;
  refresh: "auto" | "all";
  clinic_urls?: string[]; // "Load more": check just these clinics
};

export type ApplyResult = {
  status: "ready_for_review" | "manual_required" | "error";
  filled_fields: Record<string, unknown>;
  summary: string;
  screenshot_url: string | null;
};

export type DoctorVerification = {
  verified: boolean;
  cpso_number: string | null;
  registration_status: string | null;
  specialty: string | null;
  languages: string[];
  gender: string | null;
  profile_url: string | null;
  notes: string;
  lookup_status: "found" | "not_found" | "timeout" | "error";
};

export type WatchAlert = {
  id: number;
  clinic_name: string;
  url: string;
  user_email: string;
  old_status: ClinicStatus;
  new_status: ClinicStatus;
  evidence_quote: string;
  message: string;
  simulated?: boolean;
  alert_id?: number;
  created_at?: string;
};

export type PatientInfo = { name: string; email: string; phone: string; postal_code: string; visit_reason?: string };
