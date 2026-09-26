"""
app/services/drift_service.py
Twin Drift Detection — compares forecast vs. actual incoming readings.
Uses a simple residual threshold (CUSUM-ready structure).
Reads forecast from Redis, compares with latest WAQI reading.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from app.core.redis_client import get_redis
from app.models.schemas import DriftEvent, DriftStatusResponse

# Residual threshold: flag divergence above this % as anomaly
DEFAULT_THRESHOLD_PCT = 25.0

# Likely cause heuristics based on magnitude and time context
def _likely_cause(divergence_pct: float, observed: float) -> str:
    if observed > 300:
        return "Severe pollution event — possible stubble burning or industrial accident"
    if observed > 220:
        return "Agricultural burning plume (stubble / crop residue) transported by wind"
    if divergence_pct > 50:
        return "Sharp local emission spike — likely Diwali firecrackers or industrial flare"
    if divergence_pct > 30:
        return "Unexpected traffic surge or thermal inversion trapping particulate matter"
    return "Minor model divergence — boundary layer depth or wind direction shift"


async def check_drift(city: str, threshold_pct: float = DEFAULT_THRESHOLD_PCT) -> DriftStatusResponse:
    """
    Pull latest forecasts and observed readings from Redis for a city,
    compute residuals per station, and flag anomalies.
    """
    redis = await get_redis()

    # ── Pull latest forecast frames ──────────────────────────
    forecast_key = f"forecast:{city.lower()}:latest"
    raw_forecast = await redis.get(forecast_key)
    forecasts: dict[str, float] = {}
    if raw_forecast:
        try:
            data = json.loads(raw_forecast)
            # Expects {station_id: predicted_aqi, ...}
            for station_id, aqi in data.items():
                forecasts[station_id] = float(aqi)
        except Exception:
            pass

    # ── Pull latest observed readings ────────────────────────
    observed_key = f"observed:{city.lower()}:latest"
    raw_observed = await redis.get(observed_key)
    observed: dict[str, dict] = {}
    if raw_observed:
        try:
            observed = json.loads(raw_observed)
        except Exception:
            pass

    events: list[DriftEvent] = []
    now = datetime.now(timezone.utc).isoformat()

    for station_id, forecast_aqi in forecasts.items():
        obs = observed.get(station_id)
        if obs is None:
            continue

        actual_aqi = float(obs.get("aqi", forecast_aqi))
        div_pct = abs(actual_aqi - forecast_aqi) / forecast_aqi * 100 if forecast_aqi else 0.0

        events.append(DriftEvent(
            station_id=station_id,
            station_name=obs.get("name", station_id),
            city=city,
            forecast_value=round(forecast_aqi, 1),
            observed_value=round(actual_aqi, 1),
            divergence_pct=round(div_pct, 1),
            threshold_pct=threshold_pct,
            is_anomaly=div_pct >= threshold_pct,
            likely_cause=_likely_cause(div_pct, actual_aqi) if div_pct >= threshold_pct else "",
            timestamp=now,
        ))

    active = sum(1 for e in events if e.is_anomaly)

    return DriftStatusResponse(
        city=city,
        active_anomalies=active,
        events=events,
        last_checked=now,
    )


async def store_forecast_snapshot(city: str, snapshot: dict[str, float]) -> None:
    """
    Called by the ML team's pipeline (or ingestion worker) to write
    the latest per-station forecast into Redis so drift detection can read it.
    snapshot = { "station_id": predicted_aqi_float, ... }
    """
    redis = await get_redis()
    key = f"forecast:{city.lower()}:latest"
    await redis.set(key, json.dumps(snapshot), ex=3600)  # expires in 1 hour


async def store_observed_snapshot(city: str, snapshot: dict[str, dict]) -> None:
    """
    Called by the ingestion consumer to write the latest per-station
    observed readings into Redis.
    snapshot = { "station_id": {"aqi": float, "name": str}, ... }
    """
    redis = await get_redis()
    key = f"observed:{city.lower()}:latest"
    await redis.set(key, json.dumps(snapshot), ex=3600)
