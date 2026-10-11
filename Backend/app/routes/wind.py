"""
app/routes/wind.py
Wind field endpoint — serves a 4×4 grid of wind vectors covering Delhi
fetched from the Open-Meteo free forecast API (no API key required).

Data is cached in-memory for 30 minutes to avoid hammering Open-Meteo on
every page load.  Vectors are returned as u/v components (m/s) plus raw
speed and meteorological direction so the frontend particle layer can do
bilinear interpolation.
"""
from __future__ import annotations

import math
import httpx
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["Wind Field"])

# ── Delhi bounding box (lat 28.40–28.85, lon 76.85–77.55) ───────────────────
_LAT_MIN, _LAT_MAX = 28.40, 28.85
_LON_MIN, _LON_MAX = 76.85, 77.55
_GRID_N = 4  # 4×4 = 16 grid points

# ── In-memory cache ───────────────────────────────────────────────────────────
_cache: dict[str, Any] = {}
_CACHE_TTL_MINUTES = 30


def _build_grid_coords() -> list[tuple[float, float]]:
    """Generate evenly-spaced (lat, lon) pairs over the Delhi bounding box."""
    lats = [_LAT_MIN + (_LAT_MAX - _LAT_MIN) * i / (_GRID_N - 1) for i in range(_GRID_N)]
    lons = [_LON_MIN + (_LON_MAX - _LON_MIN) * j / (_GRID_N - 1) for j in range(_GRID_N)]
    return [(lat, lon) for lat in lats for lon in lons]


def _uv_from_speed_dir(speed: float, direction: float) -> tuple[float, float]:
    """
    Convert meteorological wind speed (m/s) and direction (degrees FROM) to
    u (eastward) and v (northward) Cartesian components.

        u = -speed * sin(radians(direction))
        v = -speed * cos(radians(direction))

    Meteorological convention: direction is where the wind blows FROM, so
    the flow vector points in the *opposite* direction.
    """
    rad = math.radians(direction)
    u = -speed * math.sin(rad)
    v = -speed * math.cos(rad)
    return round(u, 4), round(v, 4)


async def _fetch_open_meteo_wind() -> list[dict]:
    """
    Fetch the current-hour wind at every grid point from Open-Meteo.
    Uses the /v1/forecast endpoint with hourly=wind_speed_10m,wind_direction_10m
    and picks the most-recent completed hour.
    """
    coords = _build_grid_coords()
    grid_data: list[dict] = []

    async with httpx.AsyncClient(timeout=12.0) as client:
        for lat, lon in coords:
            url = (
                "https://api.open-meteo.com/v1/forecast"
                f"?latitude={lat:.4f}&longitude={lon:.4f}"
                "&hourly=wind_speed_10m,wind_direction_10m"
                "&forecast_days=1"
                "&timezone=Asia%2FKolkata"
            )
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

                hourly = data.get("hourly", {})
                times = hourly.get("time", [])
                speeds = hourly.get("wind_speed_10m", [])
                directions = hourly.get("wind_direction_10m", [])

                # Pick the hour whose timestamp is closest to now (but not future)
                now = datetime.now(tz=timezone(timedelta(hours=5, minutes=30)))
                now_str = now.strftime("%Y-%m-%dT%H:00")

                idx = 0
                for i, t in enumerate(times):
                    if t <= now_str:
                        idx = i

                speed = float(speeds[idx]) if speeds else 3.0
                direction = float(directions[idx]) if directions else 105.0
                u, v = _uv_from_speed_dir(speed, direction)

                grid_data.append({
                    "lat": round(lat, 4),
                    "lon": round(lon, 4),
                    "u": u,
                    "v": v,
                    "speed": round(speed, 2),
                    "direction": round(direction, 1),
                })
            except Exception as exc:
                # Fallback for a single grid point — use calm NW Delhi conditions
                u_fb, v_fb = _uv_from_speed_dir(3.0, 105.0)
                grid_data.append({
                    "lat": round(lat, 4),
                    "lon": round(lon, 4),
                    "u": u_fb,
                    "v": v_fb,
                    "speed": 3.0,
                    "direction": 105.0,
                })

    return grid_data


# ── Response schema ───────────────────────────────────────────────────────────

class WindGridPoint(BaseModel):
    lat: float
    lon: float
    u: float       # eastward component (m/s)
    v: float       # northward component (m/s)
    speed: float   # magnitude (m/s)
    direction: float  # meteorological direction FROM (°)


class WindFieldResponse(BaseModel):
    fetched_at: str
    grid: list[WindGridPoint]


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("/wind-field", response_model=WindFieldResponse)
async def get_wind_field():
    """
    Return a 4×4 grid of wind vectors (u/v components + speed/direction) over
    Delhi fetched from Open-Meteo.  Response is cached for 30 minutes.

    Consumers: WindParticleLayer in the frontend performs bilinear interpolation
    over this grid and colors each dispersion particle by the nearest AQI station.
    """
    global _cache

    now = datetime.now(tz=timezone.utc)

    # Return cached response if still fresh
    if _cache.get("data") and _cache.get("expires_at") and now < _cache["expires_at"]:
        return _cache["data"]

    # Fetch fresh data
    try:
        grid = await _fetch_open_meteo_wind()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Open-Meteo fetch failed: {exc}")

    response = WindFieldResponse(
        fetched_at=now.isoformat(),
        grid=[WindGridPoint(**pt) for pt in grid],
    )

    _cache = {
        "data": response,
        "expires_at": now + timedelta(minutes=_CACHE_TTL_MINUTES),
    }

    return response
