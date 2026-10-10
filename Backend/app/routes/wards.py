"""
app/routes/wards.py
Ward-level analytics endpoints.
Ward metadata (names, zones, drivers, actions) is seeded from the Kaggle dataset.
AQI values are fetched live from WAQI and matched to the nearest station per ward.
"""
from fastapi import APIRouter, HTTPException, Query
from app.models.schemas import WardsResponse, WardEntry
from app.services.aqi_service import fetch_city_aqi, get_band

router = APIRouter(prefix="/wards", tags=["Wards"])


# ── Ward metadata: only structural/contextual fields — NO static AQI ─────────
# aqi and pm25 are placeholders; they get overwritten by live WAQI data.
_DELHI_META = [
    dict(ward_name="Anand Vihar",           zone="East Delhi",       dominant_driver="Transport Hub + Stubble Influx",      recommended_action="Deploy Mist Cannons + Heavy Truck Ban on NH24",        keywords=["Anand Vihar", "Kaushambi", "Patparganj"]),
    dict(ward_name="ITO Junction",          zone="Central Delhi",    dominant_driver="Traffic Congestion",                   recommended_action="Traffic Signal Synchronization + Metro Subsidy",       keywords=["ITO", "Pragati Maidan", "Mandi House"]),
    dict(ward_name="Wazirpur Industrial",   zone="North West Delhi", dominant_driver="Small-Scale Industrial Emissions",     recommended_action="Industrial Stack Scrubber Audit & Emission Mandates", keywords=["Wazirpur", "Ashok Vihar", "Jahangirpuri"]),
    dict(ward_name="R K Puram",             zone="South Delhi",      dominant_driver="Vehicular Congestion (Ring Road)",     recommended_action="Heavy Vehicle Diversion & Anti-Smog Mist Guns",       keywords=["R K Puram", "RK Puram", "Sri Aurobindo"]),
    dict(ward_name="Dwarka Sector 8",       zone="South West Delhi", dominant_driver="Construction Dust & Metro Works",     recommended_action="Construction Site Enclosures & Dust Suppression",     keywords=["Dwarka", "NSIT", "Palam"]),
    dict(ward_name="Punjabi Bagh",          zone="West Delhi",       dominant_driver="Highway Traffic + Road Dust",          recommended_action="Mechanized Vacuum Sweepers on Ring Road Stretch",     keywords=["Punjabi Bagh", "Patel Nagar", "Shadipur"]),
    dict(ward_name="Rohini Sector 16",      zone="North Delhi",      dominant_driver="Construction + Vehicular Dust",       recommended_action="Green Belt Expansion & Dust Barrier Plantation",      keywords=["Rohini", "Alipur", "Narela"]),
    dict(ward_name="Lodhi Road",            zone="Central Delhi",    dominant_driver="Ambient Background",                   recommended_action="Green Canopy Maintenance & Monitoring",               keywords=["Lodhi", "Safdarjung", "JLN", "Lutyens"]),
    dict(ward_name="Mundka Industrial",     zone="West Delhi",       dominant_driver="Industrial + Freight Emissions",       recommended_action="Industrial Zone EV Freight Transition",               keywords=["Mundka", "Bawana", "Tikri"]),
]

_CITY_META: dict[str, list[dict]] = {
    "delhi": _DELHI_META,
    "noida": _DELHI_META,
}


def _aqi_category(aqi: float) -> str:
    if aqi > 300:
        return "severe"
    if aqi > 200:
        return "poor"
    if aqi > 100:
        return "moderate"
    return "good"


def _badge_category(aqi: float) -> str:
    """Map AQI to coarse 3-tier category used by filter pills."""
    if aqi > 200:
        return "severe"
    if aqi > 100:
        return "moderate"
    return "good"


async def _build_wards_with_live_aqi(city: str, meta_list: list[dict]) -> list[WardEntry]:
    """
    Fetch live AQI from WAQI for the city, then match each ward to the closest
    station by keyword. Wards with no keyword match get the city average AQI.
    """
    try:
        city_data = await fetch_city_aqi(city)
        stations  = city_data.stations
        city_avg  = city_data.avg_aqi
    except Exception:
        # If WAQI is unreachable return an empty list — caller raises 502
        raise

    wards: list[WardEntry] = []
    for ward_meta in meta_list:
        keywords = ward_meta.get("keywords", [])

        # Find best matching station by keyword scan
        matched = None
        for kw in keywords:
            matched = next(
                (s for s in stations if kw.lower() in s.station_name.lower()),
                None,
            )
            if matched:
                break

        aqi_val = float(matched.aqi) if matched else city_avg
        pm25_val = float(matched.pm25) if (matched and matched.pm25 is not None) else round(aqi_val * 0.6, 1)

        wards.append(WardEntry(
            ward_name=ward_meta["ward_name"],
            zone=ward_meta["zone"],
            aqi=round(aqi_val, 1),
            pm25=round(pm25_val, 1),
            dominant_driver=ward_meta["dominant_driver"],
            recommended_action=ward_meta["recommended_action"],
            category=_badge_category(aqi_val),
        ))

    return wards


@router.get("/{city}", response_model=WardsResponse)
async def get_wards(
    city: str,
    category: str = Query("all", pattern="^(all|severe|moderate|good)$"),
):
    """
    Return ward-level AQI rankings for a city.
    AQI values are fetched live from WAQI and matched to ward locations by keyword.
    Optional filter by category: severe | moderate | good | all.
    Falls back gracefully to Delhi metadata if city not explicitly configured.
    """
    key       = city.lower().strip()
    meta_list = _CITY_META.get(key, _DELHI_META)

    try:
        wards = await _build_wards_with_live_aqi(city, meta_list)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch live AQI for wards: {e}")

    filtered = wards if category == "all" else [w for w in wards if w.category == category]

    highest  = max(wards, key=lambda w: w.aqi)
    cleanest = min(wards, key=lambda w: w.aqi)

    from collections import Counter
    driver_counts  = Counter(w.dominant_driver.split("+")[0].strip() for w in wards)
    primary_driver = driver_counts.most_common(1)[0][0]

    return WardsResponse(
        city=city,
        wards=filtered,
        primary_driver_city=primary_driver,
        highest_severity_ward=f"{highest.ward_name} ({int(highest.aqi)} AQI)",
        cleanest_ward=f"{cleanest.ward_name} ({int(cleanest.aqi)} AQI)",
    )
