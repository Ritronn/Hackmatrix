"""
app/services/aqi_service.py
WAQI API client — fetches current AQI for a city using named station slugs.

The /search/ endpoint is unreliable — it does a global fuzzy text match and
returns unrelated international stations. Instead we use the /feed/{slug}/
endpoint with a curated map of city → known WAQI station slugs.

NOTE on data freshness:
  WAQI's free token serves live data for DPCCC (Delhi) and some municipal
  stations, but SAFAR (Pune/Mumbai) data may be stale if the token hasn't
  been refreshed. Register a personal token at https://aqicn.org/api/ and
  set WAQI_API_TOKEN in .env to get the freshest cache for all Indian cities.
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone, timedelta
import httpx
from app.core.config import settings
from app.models.schemas import StationReading, CityAQIResponse, AQIBand

WAQI_BASE = "https://api.waqi.info"

# AQI band definitions (Indian AQI scale)
AQI_BANDS: list[AQIBand] = [
    AQIBand(label="Good",         color="#4CAF50", min_aqi=0,   max_aqi=50),
    AQIBand(label="Satisfactory", color="#8BC34A", min_aqi=51,  max_aqi=100),
    AQIBand(label="Moderate",     color="#FFC107", min_aqi=101, max_aqi=200),
    AQIBand(label="Poor",         color="#FF9800", min_aqi=201, max_aqi=300),
    AQIBand(label="Very Poor",    color="#F44336", min_aqi=301, max_aqi=400),
    AQIBand(label="Severe",       color="#7B1FA2", min_aqi=401, max_aqi=9999),
]

# City name (lowercase) → list of WAQI slug strings.
# All slugs are tried in parallel; slugs returning "-" AQI or errors are skipped.
CITY_SLUGS: dict[str, list[str]] = {
    "pune":             ["pune", "pimpri"],
    "mumbai":           ["mumbai", "bandra"],
    "delhi":            ["delhi", "delhi/punjabi-bagh"],
    "nashik":           ["nashik", "@9071"],
    "thane":            ["thane"],
    "nagpur":           ["nagpur", "@9070"],
    "akurdi":           ["pimpri", "pune"],
    "pcmc":             ["pimpri", "pune"],
    "pimpri-chinchwad": ["pimpri", "pune"],
    "maharashtra":      ["pune", "mumbai"],
    "kolkata":          ["kolkata"],
    "chennai":          ["chennai"],
    "bangalore":        ["bangalore"],
    "bengaluru":        ["bangalore"],
    "hyderabad":        ["hyderabad"],
    "ahmedabad":        ["ahmedabad"],
}

DEFAULT_SLUGS = ["pune"]

# How old a reading can be before we flag it as stale (48 h is generous)
STALE_THRESHOLD = timedelta(hours=48)


def get_band(aqi: float) -> AQIBand:
    for band in AQI_BANDS:
        if band.min_aqi <= aqi <= band.max_aqi:
            return band
    return AQI_BANDS[-1]


def _parse_waqi_time(time_obj: dict) -> datetime | None:
    """Parse WAQI time object → UTC datetime. Returns None on failure."""
    try:
        iso = time_obj.get("iso") or time_obj.get("s")
        if not iso:
            return None
        # Try ISO first
        try:
            return datetime.fromisoformat(iso)
        except ValueError:
            pass
        # Fall back to plain "YYYY-MM-DD HH:MM:SS" (assume local, treat as UTC)
        return datetime.strptime(iso, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def _fetch_slug(client: httpx.AsyncClient, slug: str, city: str) -> StationReading | None:
    """Fetch a single WAQI slug feed, validate freshness, return StationReading or None."""
    token = settings.waqi_api_token
    # Support both named slugs (/feed/pune/) and UID-based (/feed/@9071/)
    path  = f"@{slug[1:]}" if slug.startswith("@") else slug
    try:
        resp = await client.get(f"{WAQI_BASE}/feed/{path}/?token={token}", timeout=8.0)
        resp.raise_for_status()
        payload = resp.json()
    except Exception:
        return None

    if payload.get("status") != "ok":
        return None

    d       = payload["data"]
    aqi_val = d.get("aqi")

    if aqi_val in (None, "-", ""):
        return None

    try:
        aqi = int(aqi_val)
    except (ValueError, TypeError):
        return None

    # ── Freshness check ───────────────────────────────────────────────────────
    reading_time = _parse_waqi_time(d.get("time", {}))
    now_utc      = datetime.now(timezone.utc)
    is_stale     = False
    if reading_time:
        # Make both timezone-aware for comparison
        if reading_time.tzinfo is None:
            reading_time = reading_time.replace(tzinfo=timezone.utc)
        age = now_utc - reading_time
        is_stale = age > STALE_THRESHOLD
        if is_stale:
            # Log but still return — caller can decide whether to use it
            print(f"[aqi_service] STALE: {slug} reading is {age.days}d old ({reading_time.isoformat()})")

    iaqi     = d.get("iaqi", {})
    city_obj = d.get("city", {})
    geo      = city_obj.get("geo", [0.0, 0.0])

    return StationReading(
        station_id=str(d.get("idx", slug)),
        station_name=city_obj.get("name", slug),
        city=city,
        latitude=float(geo[0]) if isinstance(geo, list) and len(geo) > 0 else 0.0,
        longitude=float(geo[1]) if isinstance(geo, list) and len(geo) > 1 else 0.0,
        aqi=aqi,
        pm25=iaqi.get("pm25", {}).get("v") if isinstance(iaqi.get("pm25"), dict) else None,
        pm10=iaqi.get("pm10", {}).get("v") if isinstance(iaqi.get("pm10"), dict) else None,
        no2=iaqi.get("no2",  {}).get("v") if isinstance(iaqi.get("no2"),  dict) else None,
        co=iaqi.get("co",    {}).get("v") if isinstance(iaqi.get("co"),   dict) else None,
        o3=iaqi.get("o3",    {}).get("v") if isinstance(iaqi.get("o3"),   dict) else None,
        so2=iaqi.get("so2",  {}).get("v") if isinstance(iaqi.get("so2"),  dict) else None,
        timestamp=reading_time.isoformat() if reading_time else now_utc.isoformat(),
        source="WAQI" if not is_stale else "WAQI-cached",
    )


async def fetch_city_aqi(city: str) -> CityAQIResponse:
    """
    Fetch AQI for a city using curated WAQI slug feeds.
    All slugs for the city are fetched in parallel; valid results are aggregated.
    """
    key   = city.lower().strip()
    slugs = CITY_SLUGS.get(key, DEFAULT_SLUGS)

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_fetch_slug(client, slug, city) for slug in slugs],
            return_exceptions=False,
        )

    stations = [r for r in results if r is not None]

    if not stations:
        raise ValueError(
            f"No AQI data available for '{city}'. "
            f"Tried slugs: {slugs}. WAQI may have no reading for this city."
        )

    stations.sort(key=lambda s: s.aqi, reverse=True)
    dominant = stations[0]
    avg_aqi  = sum(s.aqi for s in stations) / len(stations)

    # Use "replayed" source label when all stations are serving stale data
    all_stale   = all(s.source == "WAQI-cached" for s in stations)
    data_source = "replayed" if all_stale else "live"

    return CityAQIResponse(
        city=city,
        dominant_station=dominant,
        stations=stations,
        avg_aqi=round(avg_aqi, 1),
        band=get_band(avg_aqi),
        data_source=data_source,
    )


async def fetch_station_aqi(station_id: str) -> StationReading:
    """Fetch a single station by its WAQI station ID."""
    token = settings.waqi_api_token
    url   = f"{WAQI_BASE}/feed/@{station_id}/?token={token}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "ok":
        raise ValueError(f"WAQI error for station '{station_id}'")

    d        = data["data"]
    iaqi     = d.get("iaqi", {})
    city_obj = d.get("city", {})
    geo      = city_obj.get("geo", [0.0, 0.0])

    return StationReading(
        station_id=str(d.get("idx")),
        station_name=city_obj.get("name", "Unknown"),
        city=city_obj.get("name", "Unknown"),
        latitude=float(geo[0]),
        longitude=float(geo[1]),
        aqi=int(d.get("aqi", 0)),
        pm25=iaqi.get("pm25", {}).get("v") if isinstance(iaqi.get("pm25"), dict) else None,
        pm10=iaqi.get("pm10", {}).get("v") if isinstance(iaqi.get("pm10"), dict) else None,
        no2=iaqi.get("no2",  {}).get("v") if isinstance(iaqi.get("no2"),  dict) else None,
        co=iaqi.get("co",    {}).get("v") if isinstance(iaqi.get("co"),   dict) else None,
        o3=iaqi.get("o3",    {}).get("v") if isinstance(iaqi.get("o3"),   dict) else None,
        so2=iaqi.get("so2",  {}).get("v") if isinstance(iaqi.get("so2"),  dict) else None,
        timestamp=datetime.now(timezone.utc).isoformat(),
        source="WAQI",
    )
