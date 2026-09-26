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
_PUNE_META = [
    dict(ward_name="Bhosari MIDC",         zone="PCMC Industrial",  dominant_driver="Industrial Emissions + Metal Dust",  recommended_action="Stack Scrubber Audit & Dust Collector Mandate",       keywords=["Bhosari", "Chakan", "MIDC", "Alandi"]),
    dict(ward_name="Akurdi Chowk",          zone="PCMC Central",     dominant_driver="Highway Freight + SME Engineering",  recommended_action="Anti-Smog Mist Cannons & Heavy Transit Diversion",   keywords=["Akurdi", "Nigdi", "Pimpri", "Chinchwad"]),
    dict(ward_name="Katraj Bypass",         zone="South Pune",       dominant_driver="Diesel Truck Corridor",              recommended_action="Night Heavy Vehicle Windows & EV Freight Corridors",  keywords=["Katraj", "Dhankawadi", "Kondhwa"]),
    dict(ward_name="Shivaji Nagar",         zone="Central Pune",     dominant_driver="Vehicular Congestion",               recommended_action="Traffic Signal Synchronization & PMPML Bus Priority",  keywords=["Shivaji", "Shivajinagar", "Swargate", "Pune"]),
    dict(ward_name="Hadapsar / Magarpatta", zone="East Pune",        dominant_driver="IT Commute + Road Re-suspension",    recommended_action="Mechanized Vacuum Sweepers on Kharadi-Hadapsar Road", keywords=["Hadapsar", "Magarpatta", "Kharadi"]),
    dict(ward_name="Wakad / Hinjawadi",     zone="PCMC / IT Park",   dominant_driver="Construction Dust & Commute",        recommended_action="Construction Site Enclosures & Tech-Park Shuttles",   keywords=["Wakad", "Hinjawadi", "Baner"]),
    dict(ward_name="Kothrud / Paud Road",   zone="West Pune",        dominant_driver="Valley Basin Inversion",             recommended_action="Low-Emission Neighborhood Zone Enforcement",          keywords=["Kothrud", "Karve", "Erandwane"]),
    dict(ward_name="Viman Nagar",           zone="North East Pune",  dominant_driver="Airport Transit + Civil Works",      recommended_action="Dust Suppression Misting along Nagar Road",           keywords=["Viman", "Nagar Road", "Airport"]),
    dict(ward_name="Pashan / IISER Belt",   zone="West Green Zone",  dominant_driver="Ambient Background",                 recommended_action="Urban Forest Canopy Protection & Bio-Monitoring",    keywords=["Pashan", "IISER", "Bavdhan", "Aundh"]),
]

_MUMBAI_META = [
    dict(ward_name="Deonar / Chembur",      zone="Eastern Suburbs",  dominant_driver="Refinery Emissions + Landfill VOCs", recommended_action="VOC Leak Detection & Waste Capping Interventions",   keywords=["Deonar", "Chembur", "Trombay"]),
    dict(ward_name="Andheri East",          zone="Western Suburbs",  dominant_driver="Metro Works + Airport Traffic",      recommended_action="Mechanized Sweeping & Construction Barricading",      keywords=["Andheri", "Chakala", "SEEPZ"]),
    dict(ward_name="Bandra Kurla Complex",  zone="Central Business", dominant_driver="Commercial Commute Fleet",           recommended_action="Mandatory Zero-Emission Commercial Shuttles",          keywords=["Bandra", "Kurla", "BKC"]),
    dict(ward_name="Sion / Kurla Junction", zone="Central Mumbai",   dominant_driver="EEH Highway Diesel Traffic",         recommended_action="High-Pressure Anti-Smog Guns on Flyover Corridors",   keywords=["Sion", "Kurla", "Dharavi"]),
    dict(ward_name="Borivali West",         zone="North Suburbs",    dominant_driver="Ambient Background (Sanjay Gandhi NP)", recommended_action="National Park Eco-Buffer Zone Safeguarding",     keywords=["Borivali", "Kandivali", "Dahisar"]),
    dict(ward_name="Worli Sea Face",        zone="South Central",    dominant_driver="Marine Boundary Dispersion",         recommended_action="Continuous Coastal Baseline Air Station Tracking",    keywords=["Worli", "Prabhadevi", "Dadar"]),
    dict(ward_name="Colaba",                zone="South Mumbai",     dominant_driver="Coastal Sea Breeze Dilution",        recommended_action="Heritage Area Pedestrianization & Canopy Care",       keywords=["Colaba", "Cuffe Parade", "Nariman"]),
]

_NASHIK_META = [
    dict(ward_name="Satpur MIDC",           zone="Industrial West",  dominant_driver="Engineering Ancillaries + Dust",    recommended_action="Industrial Zone Emission Scrubbing Audits",           keywords=["Satpur", "MIDC", "Ambad"]),
    dict(ward_name="Nashik Road Station",   zone="Rail Corridor",    dominant_driver="Inter-City Bus & Diesel Transit",   recommended_action="EV Feeder Buses & Clean Transit Terminal Policy",      keywords=["Nashik Road", "Deolali", "Panchavati"]),
    dict(ward_name="Panchavati",            zone="Godavari Basin",   dominant_driver="River Basin Atmospheric Inversion", recommended_action="Low-Emission Heritage Zone & Sweeping",               keywords=["Panchavati", "Godavari", "Nashik City"]),
    dict(ward_name="Gangapur Road",         zone="North West Green", dominant_driver="Ambient Background",                recommended_action="Green Corridor Maintenance & Urban Forest Expansion", keywords=["Gangapur", "Nashik"]),
]

_THANE_META = [
    dict(ward_name="Wagle Estate",          zone="Industrial Thane", dominant_driver="Chemical & Small Industrial Units", recommended_action="Stack Air Filter Mandates & Inspection Patrols",      keywords=["Wagle", "Thane", "Majiwada"]),
    dict(ward_name="Ghodbunder Road",       zone="Freight Transit",  dominant_driver="Interstate Heavy Truck Traffic",    recommended_action="Heavy Freight Speed Management & Mist Guns",           keywords=["Ghodbunder", "Thane", "Kapurbawdi"]),
    dict(ward_name="Upvan Lake Belt",       zone="Yeoor Foothills",  dominant_driver="Ambient Background",                recommended_action="Eco-Sensitive Zone Preservation",                      keywords=["Upvan", "Yeoor", "Thane West"]),
]

_DELHI_META = [
    dict(ward_name="Anand Vihar",           zone="East Delhi",       dominant_driver="Transport + Stubble",               recommended_action="Deploy Mist Cannons + Heavy Truck Ban",               keywords=["Anand Vihar", "Kaushambi", "Patparganj"]),
    dict(ward_name="ITO Junction",          zone="Central Delhi",    dominant_driver="Traffic Congestion",                recommended_action="Traffic Signal Synchronization + Metro Subsidy",      keywords=["ITO", "Pragati Maidan", "Mandi House"]),
    dict(ward_name="Lodhi Road",            zone="South Delhi",      dominant_driver="Ambient Background",                recommended_action="Green Canopy Maintenance & Monitoring",               keywords=["Lodhi", "Safdarjung", "Lutyens"]),
]

_AKURDI_META = [
    dict(ward_name="Akurdi Khandoba Mal",   zone="MIDC Sector",      dominant_driver="Automotive & Foundry Emissions",    recommended_action="Deploy Mobile Mist Guns + Industrial Stack Checks",   keywords=["Akurdi", "Khandoba", "PCMC"]),
    dict(ward_name="Thergaon / Dange Chowk",zone="PCMC Chokepoint",  dominant_driver="Peak Traffic Choke + Bus Transit",  recommended_action="Flyover Traffic Flow Decongestion & Sweeper Deployment", keywords=["Thergaon", "Dange", "Rahatani"]),
    dict(ward_name="Akurdi Railway Station",zone="Transit Hub",       dominant_driver="Auto-Rickshaw Idling & Rail Dust",  recommended_action="Shared EV Feeder Fleets & Anti-Idling Enforcement",   keywords=["Akurdi", "Railway", "Station"]),
    dict(ward_name="Nigdi Pradhikaran",     zone="NH48 Corridor",    dominant_driver="Highway Transit Dust",              recommended_action="Green Acoustic & Particulate Barrier Plantation",     keywords=["Nigdi", "Pradhikaran", "NH48"]),
    dict(ward_name="Pradhikaran Sector 24", zone="Residential",      dominant_driver="Ambient Background",                recommended_action="Maintain Tree Cover Density & Rooftop Sensors",       keywords=["Pradhikaran", "Sector 24", "Akurdi"]),
]

_CITY_META: dict[str, list[dict]] = {
    "pune":             _PUNE_META,
    "akurdi":           _AKURDI_META,
    "pcmc":             _AKURDI_META,
    "pimpri-chinchwad": _AKURDI_META,
    "mumbai":           _MUMBAI_META,
    "nashik":           _NASHIK_META,
    "thane":            _THANE_META,
    "maharashtra":      _PUNE_META,
    "delhi":            _DELHI_META,
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
    Falls back gracefully to Pune metadata if city not explicitly configured.
    """
    key       = city.lower().strip()
    meta_list = _CITY_META.get(key, _PUNE_META)

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
