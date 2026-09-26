"""
app/routes/wards.py
Ward-level analytics endpoints.
Ward data is seeded from the Kaggle dataset + WAQI live readings.
"""
from fastapi import APIRouter, HTTPException, Query
from app.models.schemas import WardsResponse, WardEntry

router = APIRouter(prefix="/wards", tags=["Wards"])

# Static ward data for Delhi NCR — in production this comes from
# the Kaggle dataset joined with live WAQI readings.
# The ML team can replace this with GP-interpolated per-ward values.
_DELHI_WARDS: list[WardEntry] = [
    WardEntry(ward_name="Anand Vihar",    zone="East Delhi",     aqi=218, pm25=142, dominant_driver="Transport + Stubble",   recommended_action="Deploy 12 Mist Cannons + Heavy Truck Ban",          category="severe"),
    WardEntry(ward_name="Jahangirpuri",   zone="North Delhi",    aqi=198, pm25=128, dominant_driver="Industrial Dust",        recommended_action="Halt Construction + Night Industrial Inspection",    category="severe"),
    WardEntry(ward_name="ITO Junction",   zone="Central Delhi",  aqi=187, pm25=118, dominant_driver="Traffic Congestion",     recommended_action="Traffic Signal Synchronization + Metro Subsidy",    category="severe"),
    WardEntry(ward_name="Wazirpur",       zone="North West",     aqi=182, pm25=114, dominant_driver="Metal Furnaces",         recommended_action="20% Industrial Emission Curtailment",               category="severe"),
    WardEntry(ward_name="Rohini Sector 8",zone="North West",     aqi=176, pm25=108, dominant_driver="Road Dust + Traffic",    recommended_action="Vacuum Sweeping + Odd-Even Enforcement",            category="severe"),
    WardEntry(ward_name="Shahdara",       zone="East Delhi",     aqi=172, pm25=104, dominant_driver="Biomass Burning",        recommended_action="Waste Burning Ban + Community Monitoring",          category="moderate"),
    WardEntry(ward_name="Dwarka Sector-8",zone="South West",     aqi=165, pm25=98,  dominant_driver="Road & Construction Dust",recommended_action="Mechanized Vacuum Sweeping",                      category="moderate"),
    WardEntry(ward_name="Saket",          zone="South Delhi",    aqi=148, pm25=86,  dominant_driver="Vehicular Exhaust",      recommended_action="EV Transition Incentives + Carpooling",            category="moderate"),
    WardEntry(ward_name="Vasant Kunj",    zone="South West",     aqi=134, pm25=76,  dominant_driver="Ambient Background",     recommended_action="Green Buffer Planting",                            category="moderate"),
    WardEntry(ward_name="Lodhi Road",     zone="South Delhi",    aqi=118, pm25=65,  dominant_driver="Ambient Background",     recommended_action="Green Canopy Maintenance & Monitoring",            category="good"),
]

_CITY_WARDS: dict[str, list[WardEntry]] = {
    "delhi": _DELHI_WARDS,
}


@router.get("/{city}", response_model=WardsResponse)
async def get_wards(
    city: str,
    category: str = Query("all", pattern="^(all|severe|moderate|good)$"),
):
    """
    Return ward-level AQI rankings for a city.
    Optional filter by category: severe | moderate | good | all.
    """
    key = city.lower()
    wards = _CITY_WARDS.get(key)
    if wards is None:
        raise HTTPException(status_code=404, detail=f"Ward data not yet available for '{city}'")

    filtered = wards if category == "all" else [w for w in wards if w.category == category]

    highest = max(wards, key=lambda w: w.aqi)
    cleanest = min(wards, key=lambda w: w.aqi)

    # Determine city-level primary driver (most common dominant_driver)
    from collections import Counter
    driver_counts = Counter(w.dominant_driver.split("+")[0].strip() for w in wards)
    primary_driver = driver_counts.most_common(1)[0][0]

    return WardsResponse(
        city=city,
        wards=filtered,
        primary_driver_city=primary_driver,
        highest_severity_ward=f"{highest.ward_name} ({int(highest.aqi)} AQI)",
        cleanest_ward=f"{cleanest.ward_name} ({int(cleanest.aqi)} AQI)",
    )
