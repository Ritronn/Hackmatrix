"""
app/routes/aqi.py
AQI endpoints — current readings, station lookup, hotspot map data.
"""
from fastapi import APIRouter, HTTPException, Query
from app.services.aqi_service import fetch_city_aqi, fetch_station_aqi, get_band
from app.models.schemas import CityAQIResponse, StationReading, HotspotMapResponse, HotspotPoint
from app.core.redis_client import get_redis
import json
from datetime import datetime, timezone

router = APIRouter(prefix="/twin", tags=["AQI"])


@router.get("/{city}/current", response_model=CityAQIResponse)
async def get_city_current(city: str):
    """
    Fetch current AQI for all monitoring stations in a city.
    Returns the dominant (highest AQI) station, all stations, city average, and band.
    """
    try:
        return await fetch_city_aqi(city)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream API error: {e}")


@router.get("/station/{station_id}", response_model=StationReading)
async def get_station(station_id: str):
    """Fetch a single WAQI monitoring station by its numeric UID."""
    try:
        return await fetch_station_aqi(station_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream API error: {e}")


@router.get("/{city}/hotspots", response_model=HotspotMapResponse)
async def get_hotspot_map(city: str):
    """
    Return interpolated hotspot map data for a city.
    If the ML team has precomputed GP interpolation results in Redis, those are served.
    Otherwise falls back to station-only scatter points.
    """
    redis = await get_redis()
    cache_key = f"hotspots:{city.lower()}:latest"
    cached = await redis.get(cache_key)

    if cached:
        data = json.loads(cached)
        return HotspotMapResponse(**data)

    # Fallback: use raw station readings as scatter points
    try:
        city_data = await fetch_city_aqi(city)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    points = [
        HotspotPoint(
            latitude=s.latitude,
            longitude=s.longitude,
            aqi=float(s.aqi),
            confidence=0.9,  # high confidence at station locations
        )
        for s in city_data.stations
    ]

    return HotspotMapResponse(
        city=city,
        points=points,
        timestamp=datetime.now(timezone.utc).isoformat(),
        source="station-only",
    )
