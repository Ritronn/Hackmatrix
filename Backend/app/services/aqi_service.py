"""
app/services/aqi_service.py
WAQI API client — fetches current AQI + pollutant readings for a city.
Also handles reading replayed data from Redis (simulated live feed).
"""
from __future__ import annotations
import httpx
from datetime import datetime, timezone
from app.core.config import settings
from app.models.schemas import StationReading, CityAQIResponse, AQIBand

WAQI_BASE = "https://api.waqi.info"

# AQI band definitions (Indian AQI scale)
AQI_BANDS: list[AQIBand] = [
    AQIBand(label="Good",        color="#4CAF50", min_aqi=0,   max_aqi=50),
    AQIBand(label="Satisfactory",color="#8BC34A", min_aqi=51,  max_aqi=100),
    AQIBand(label="Moderate",    color="#FFC107", min_aqi=101, max_aqi=200),
    AQIBand(label="Poor",        color="#FF9800", min_aqi=201, max_aqi=300),
    AQIBand(label="Very Poor",   color="#F44336", min_aqi=301, max_aqi=400),
    AQIBand(label="Severe",      color="#7B1FA2", min_aqi=401, max_aqi=9999),
]


def get_band(aqi: float) -> AQIBand:
    for band in AQI_BANDS:
        if band.min_aqi <= aqi <= band.max_aqi:
            return band
    return AQI_BANDS[-1]


def _parse_station(raw: dict, city: str) -> StationReading | None:
    """Map a raw WAQI feed entry to our StationReading schema."""
    try:
        aqi_val = raw.get("aqi")
        if aqi_val in (None, "-"):
            return None
        aqi = int(aqi_val)
        iaqi = raw.get("iaqi", {})
        station = raw.get("station", {})
        geo = raw.get("geo", [0.0, 0.0])

        return StationReading(
            station_id=str(raw.get("uid", "unknown")),
            station_name=station.get("name", "Unknown"),
            city=city,
            latitude=float(geo[0]),
            longitude=float(geo[1]),
            aqi=aqi,
            pm25=iaqi.get("pm25", {}).get("v"),
            pm10=iaqi.get("pm10", {}).get("v"),
            no2=iaqi.get("no2", {}).get("v"),
            co=iaqi.get("co", {}).get("v"),
            o3=iaqi.get("o3", {}).get("v"),
            so2=iaqi.get("so2", {}).get("v"),
            timestamp=datetime.now(timezone.utc).isoformat(),
            source="WAQI",
        )
    except Exception:
        return None


async def fetch_city_aqi(city: str) -> CityAQIResponse:
    """
    Fetch all monitoring stations for a city from WAQI and return
    a CityAQIResponse with the dominant (highest AQI) station first.
    """
    token = settings.waqi_api_token
    url = f"{WAQI_BASE}/search/?token={token}&keyword={city}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "ok":
        raise ValueError(f"WAQI error for city '{city}': {data.get('data', 'unknown error')}")

    stations = [s for raw in data["data"] if (s := _parse_station(raw, city)) is not None]

    if not stations:
        raise ValueError(f"No valid station data returned for city '{city}'")

    stations.sort(key=lambda s: s.aqi, reverse=True)
    dominant = stations[0]
    avg_aqi = sum(s.aqi for s in stations) / len(stations)

    return CityAQIResponse(
        city=city,
        dominant_station=dominant,
        stations=stations,
        avg_aqi=round(avg_aqi, 1),
        band=get_band(avg_aqi),
        data_source="live",
    )


async def fetch_station_aqi(station_id: str) -> StationReading:
    """Fetch a single station by its WAQI station ID."""
    token = settings.waqi_api_token
    url = f"{WAQI_BASE}/feed/@{station_id}/?token={token}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "ok":
        raise ValueError(f"WAQI error for station '{station_id}'")

    d = data["data"]
    iaqi = d.get("iaqi", {})
    city_info = d.get("city", {})
    geo = city_info.get("geo", [0.0, 0.0])

    return StationReading(
        station_id=str(d.get("idx")),
        station_name=city_info.get("name", "Unknown"),
        city=city_info.get("name", "Unknown"),
        latitude=float(geo[0]),
        longitude=float(geo[1]),
        aqi=int(d.get("aqi", 0)),
        pm25=iaqi.get("pm25", {}).get("v"),
        pm10=iaqi.get("pm10", {}).get("v"),
        no2=iaqi.get("no2", {}).get("v"),
        co=iaqi.get("co", {}).get("v"),
        o3=iaqi.get("o3", {}).get("v"),
        so2=iaqi.get("so2", {}).get("v"),
        timestamp=datetime.now(timezone.utc).isoformat(),
        source="WAQI",
    )
