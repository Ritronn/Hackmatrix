"""
app/routes/drift.py
Twin Drift Detection endpoints.
"""
from fastapi import APIRouter, HTTPException, Query
from app.services.drift_service import check_drift, store_forecast_snapshot, store_observed_snapshot
from app.models.schemas import DriftStatusResponse
from pydantic import BaseModel

router = APIRouter(prefix="/drift", tags=["Twin Drift"])


@router.get("/status", response_model=DriftStatusResponse)
async def get_drift_status(
    city: str = Query("Delhi"),
    threshold_pct: float = Query(25.0, ge=5, le=100),
):
    """
    Return current twin drift status for a city.
    Compares latest forecast (from Redis) against latest observed readings.
    Active anomalies are flagged if divergence exceeds threshold_pct.
    """
    try:
        return await check_drift(city=city, threshold_pct=threshold_pct)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Internal endpoints used by the ML team & ingestion worker ──────────────

class ForecastSnapshot(BaseModel):
    city: str
    snapshot: dict[str, float]  # { station_id: predicted_aqi }


class ObservedSnapshot(BaseModel):
    city: str
    snapshot: dict[str, dict]   # { station_id: { "aqi": float, "name": str } }


@router.post("/forecast-snapshot", include_in_schema=False)
async def write_forecast_snapshot(body: ForecastSnapshot):
    """Internal: ML team writes latest forecast here for drift comparison."""
    await store_forecast_snapshot(body.city, body.snapshot)
    return {"status": "ok"}


@router.post("/observed-snapshot", include_in_schema=False)
async def write_observed_snapshot(body: ObservedSnapshot):
    """Internal: ingestion consumer writes latest observed readings here."""
    await store_observed_snapshot(body.city, body.snapshot)
    return {"status": "ok"}
