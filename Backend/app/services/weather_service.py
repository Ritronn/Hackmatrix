"""
app/services/weather_service.py
OpenWeatherMap client — current weather + wind vectors per city.
Wind u/v components are derived from speed + direction for the
frontend particle animation system.
"""
from __future__ import annotations
import math
import httpx
from datetime import datetime, timezone
from app.core.config import settings
from app.models.schemas import WeatherData

OWM_BASE = "https://api.openweathermap.org/data/2.5"

# Map degrees → compass label
_COMPASS = [
    "N","NNE","NE","ENE","E","ESE","SE","SSE",
    "S","SSW","SW","WSW","W","WNW","NW","NNW",
]


def _degrees_to_label(deg: float) -> str:
    idx = round(deg / 22.5) % 16
    return _COMPASS[idx]


def _wind_components(speed_ms: float, direction_deg: float) -> tuple[float, float]:
    """
    Convert meteorological wind (speed + direction) to u/v vector components.
    Meteorological convention: direction = where wind comes FROM.
    u = zonal (east positive), v = meridional (north positive).
    """
    rad = math.radians(direction_deg)
    u = -speed_ms * math.sin(rad)   # eastward component
    v = -speed_ms * math.cos(rad)   # northward component
    return round(u, 3), round(v, 3)


async def fetch_weather(city: str) -> WeatherData:
    """Fetch current weather for a city from OpenWeatherMap."""
    key = settings.openweather_api_key
    url = f"{OWM_BASE}/weather"
    params = {
        "q": f"{city},IN",
        "appid": key,
        "units": "metric",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    wind = data.get("wind", {})
    speed_ms = wind.get("speed", 0.0)
    direction_deg = wind.get("deg", 0.0)
    speed_kmh = round(speed_ms * 3.6, 2)

    u, v = _wind_components(speed_ms, direction_deg)

    return WeatherData(
        city=city,
        temperature_c=round(data["main"]["temp"], 1),
        humidity_pct=data["main"]["humidity"],
        wind_speed_kmh=speed_kmh,
        wind_direction_deg=direction_deg,
        wind_direction_label=_degrees_to_label(direction_deg),
        wind_u=u,
        wind_v=v,
        description=data["weather"][0]["description"].capitalize(),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
