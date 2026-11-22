"""Request / response models for every endpoint. Size caps keep one bad request from burning credits."""
from pydantic import BaseModel, Field

class ScanRequest(BaseModel):
    city: str = Field("London, ON", max_length=100)
    preferences: list[str] = Field([], max_length=20)
    clinic_urls: list[str] = Field([], max_length=50)  # pick_urls() enforces MAX_SCAN_URLS after dedup
    use_cache: bool = False
    user_postal_code: str | None = Field(None, max_length=12)  # e.g. "N6A 3K7" -> adds distance_km


class DiscoverRequest(BaseModel):
    city: str = Field("London, ON", max_length=100)
    max_results: int = 5


class RankRequest(BaseModel):
    preferences: list[str] = Field([], max_length=20)
    clinics: list[dict] = Field(max_length=30)
    language: str = Field("English", max_length=40)
    coverage_type: str = Field("OHIP", max_length=40)


class PatientInfo(BaseModel):
    name: str = Field(max_length=120)
    email: str = Field(max_length=200)
    phone: str = Field(max_length=40)
    postal_code: str = Field(max_length=12)
    visit_reason: str | None = Field(None, max_length=500)  # optional: symptoms / why they want a family doctor


class ApplyRequest(BaseModel):
    waitlist_url: str = Field(max_length=2000)
    patient_info: PatientInfo


class RankedClinic(BaseModel):
    name: str
    url: str | None = None  # the clinic's url from the input, so the frontend can join without matching names
    score: int
    reason: str
    requirements: list[str]
    next_step: str
    coverage_tags: list[str] = []
    phone_number: str | None = None
    call_hours: str | None = None
    call_script: str | None = None
    posted_wait: str | None = None  # a wait time the clinic itself posts (e.g. "about 6 months"), never estimated


class RankResponse(BaseModel):
    ranked_clinics: list[RankedClinic]


class UrlPicks(BaseModel):
    clinic_urls: list[str]


class WatchRequest(BaseModel):
    clinic_name: str = Field(max_length=200)
    url: str = Field(max_length=2000)
    last_status: str = Field(max_length=20)
    user_email: str = Field(max_length=200)


class VerifyDoctorRequest(BaseModel):
    doctor_name: str = Field(min_length=2, max_length=100)
    city: str = Field("London", max_length=100)


class MissionRequest(BaseModel):
    city: str = Field("London, ON", max_length=100)
    user_postal_code: str | None = Field(None, max_length=12)
    preferences: list[str] = Field([], max_length=20)
    language: str = Field("English", max_length=40)
    coverage_type: str = Field("OHIP", max_length=40)
    user_email: str | None = Field(None, max_length=200)
    auto_watch_closed: bool = True
    use_cache: bool = False
    clinic_urls: list[str] = Field([], max_length=50)  # optional: skip discovery and scan these
    max_clinics: int = 5  # how many clinics this search includes (clamped 1-25)
    refresh: str = Field("auto", max_length=10)  # auto: re-check out-of-date clinics | all: re-check every clinic | none: saved only


class SimulateRequest(BaseModel):
    watch_id: int | None = None


class PageExtract(BaseModel):
    """What Gemini reads off a clinic's web page (refresh.py)."""
    name: str = ""
    status: str = "unknown"  # accepting | waitlist | closed | unknown
    evidence_quote: str = ""
    waitlist_url: str | None = None
    address: str | None = None
    raw_notes: str = ""
    better_url: str | None = None  # a link on the page that probably says whether they take new patients


class RefreshRequest(BaseModel):
    url: str = Field(max_length=2000)
    city: str = Field("London, ON", max_length=100)
    user_postal_code: str | None = Field(None, max_length=12)


class SeedRequest(BaseModel):
    city: str = Field("London, ON", max_length=100)
    max_new: int = 10  # clamped 1-20
