"""
app/models/schemas.py
All Pydantic request/response models used across the API.
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


# ─── Shared ──────────────────────────────────────────────────────────────────

class AQIBand(BaseModel):
    label: str          # "Good" | "Satisfactory" | "Moderate" | "Poor" | "Very Poor" | "Severe"
    color: str          # hex color matching the design system
    min_aqi: int
    max_aqi: int


# ─── AQI / Stations ──────────────────────────────────────────────────────────

class StationReading(BaseModel):
    station_id: str
    station_name: str
    city: str
    latitude: float
    longitude: float
    aqi: int
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    no2: Optional[float] = None
    co: Optional[float] = None
    o3: Optional[float] = None
    so2: Optional[float] = None
    timestamp: str                  # ISO 8601
    source: str = "WAQI"            # "WAQI" | "replayed"


class CityAQIResponse(BaseModel):
    city: str
    country: str = "IN"
    dominant_station: StationReading
    stations: list[StationReading]
    avg_aqi: float
    band: AQIBand
    data_source: str                # "live" | "replayed"


# ─── Weather ─────────────────────────────────────────────────────────────────

class WeatherData(BaseModel):
    city: str
    temperature_c: float
    humidity_pct: float
    wind_speed_kmh: float
    wind_direction_deg: float
    wind_direction_label: str       # "NW", "SE", etc.
    wind_u: Optional[float] = None  # u-component m/s  (for particle animation)
    wind_v: Optional[float] = None  # v-component m/s
    description: str
    timestamp: str


# ─── Forecast (served from ML team's output) ─────────────────────────────────

class ForecastPoint(BaseModel):
    timestamp: str
    aqi_predicted: float
    aqi_lower: float                # 5th percentile
    aqi_upper: float                # 95th percentile
    confidence_pct: float           # 0–100


class ForecastResponse(BaseModel):
    city: str
    station_id: Optional[str] = None
    horizon_hours: int
    points: list[ForecastPoint]
    model_version: str = "lightgbm-quantile-v1"
    generated_at: str


# ─── Hotspot / Spatial Map ───────────────────────────────────────────────────

class HotspotPoint(BaseModel):
    latitude: float
    longitude: float
    aqi: float
    confidence: float               # 0–1, from GP variance proxy


class HotspotMapResponse(BaseModel):
    city: str
    points: list[HotspotPoint]
    timestamp: str
    source: str                     # "interpolated" | "station-only"


# ─── Source Attribution ───────────────────────────────────────────────────────

class AttributionBreakdown(BaseModel):
    traffic_pct: float
    industrial_pct: float
    biomass_pct: float
    dust_pct: float
    other_pct: float
    method: str = "SHAP-proxy"      # set by ML team when real SHAP available
    note: str = "Inputs are simulated proxies — clearly labeled as modeled data"


# ─── Scenario Simulator ───────────────────────────────────────────────────────

class ScenarioInput(BaseModel):
    city: str = "Delhi"
    baseline_aqi: float = 187.0
    traffic_restriction_pct: float = Field(0.0, ge=0, le=50)
    industrial_curtailment_pct: float = Field(0.0, ge=0, le=40)
    mist_units: int = Field(0, ge=0, le=100)
    construction_halt_pct: float = Field(0.0, ge=0, le=100)
    metro_subsidy: bool = False
    stubble_interception: bool = False


class ScenarioResult(BaseModel):
    simulated_aqi: float
    aqi_reduction: float
    reduction_pct: float
    er_visits_avoided_per_day: int
    economic_saving_crore: float
    total_cost_crore: float
    confidence_pct: float = 84.5
    band: AQIBand
    note: str = "Figures are illustrative estimates — based on simplified linear model"


class ROIEntry(BaseModel):
    rank: int
    intervention: str
    aqi_drop: float
    cost_crore: float
    roi_per_crore: float            # aqi_drop / cost_crore
    feasibility: str                # "High" | "Medium" | "Low"


class ROILeaderboardResponse(BaseModel):
    city: str
    baseline_aqi: float
    interventions: list[ROIEntry]


# ─── Ward / Neighborhood ─────────────────────────────────────────────────────

class WardEntry(BaseModel):
    ward_name: str
    zone: str
    aqi: float
    pm25: float
    dominant_driver: str
    recommended_action: str
    category: str                   # "severe" | "moderate" | "good"


class WardsResponse(BaseModel):
    city: str
    wards: list[WardEntry]
    primary_driver_city: str
    highest_severity_ward: str
    cleanest_ward: str


# ─── Twin Drift Detection ─────────────────────────────────────────────────────

class DriftEvent(BaseModel):
    station_id: str
    station_name: str
    city: str
    forecast_value: float
    observed_value: float
    divergence_pct: float
    threshold_pct: float
    is_anomaly: bool
    likely_cause: str
    timestamp: str


class DriftStatusResponse(BaseModel):
    city: str
    active_anomalies: int
    events: list[DriftEvent]
    last_checked: str


# ─── LLM Advisor ─────────────────────────────────────────────────────────────

class AdvisorRequest(BaseModel):
    question: str
    city: str = "Delhi"
    language: str = "en"            # "en" | "hi" | "mr"
    context_aqi: Optional[float] = None
    context_forecast_peak: Optional[float] = None
    context_dominant_source: Optional[str] = None


class AdvisorResponse(BaseModel):
    answer: str
    language: str
    sources_used: list[str]         # e.g. ["live_aqi", "forecast", "attribution"]
    city: str
    model: str = "gemini-1.5-flash"


class BriefingResponse(BaseModel):
    city: str
    date: str
    sections: dict[str, str]        # {"executive_summary": "...", "attribution": "...", ...}
    full_text: str
    model: str = "gemini-1.5-flash"
