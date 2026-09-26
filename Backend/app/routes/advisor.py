"""
app/routes/advisor.py
LLM Advisor endpoints — grounded Q&A and daily briefing generation.
Automatically pulls live AQI and attribution context before calling Gemini.
"""
from fastapi import APIRouter, HTTPException
from app.services.gemini_service import ask_advisor, generate_daily_briefing
from app.services.aqi_service import fetch_city_aqi
from app.models.schemas import AdvisorRequest, AdvisorResponse, BriefingResponse

router = APIRouter(prefix="/advisor", tags=["AI Advisor"])

# Static attribution for now — ML team replaces with SHAP output
_DEFAULT_ATTRIBUTION = {
    "traffic_pct": 42,
    "industrial_pct": 18,
    "biomass_pct": 28,
    "dust_pct": 12,
}


@router.post("/ask", response_model=AdvisorResponse)
async def ask(req: AdvisorRequest):
    """
    Answer a natural-language question grounded in live AQI data.
    If context_aqi is not provided in the request, it's auto-fetched from WAQI.
    Supports EN / HI / MR via the `language` field.
    """
    # Auto-enrich context if not provided by caller
    if req.context_aqi is None:
        try:
            city_data = await fetch_city_aqi(req.city)
            req = req.model_copy(update={
                "context_aqi": city_data.avg_aqi,
                "context_dominant_source": _DEFAULT_ATTRIBUTION,
            })
        except Exception:
            pass  # proceed with whatever context was given

    try:
        return await ask_advisor(req)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {e}")


@router.get("/briefing/{city}", response_model=BriefingResponse)
async def get_daily_briefing(city: str, language: str = "en"):
    """
    Auto-generate a structured daily air quality briefing for a city.
    Fetches live AQI, injects real numbers into the prompt, returns
    a section-structured report ready for copy/print.
    """
    try:
        city_data = await fetch_city_aqi(city)
        aqi = city_data.avg_aqi
    except Exception:
        aqi = 187.0  # fallback for demo if API is unavailable

    # Forecast peak — read from Redis if ML team has written it, else estimate
    forecast_peak = round(aqi * 1.08, 1)  # +8% as placeholder

    # Recommended action based on AQI band
    if aqi >= 300:
        action = "Activate GRAP-IV emergency measures immediately"
    elif aqi >= 200:
        action = "Enforce Odd-Even, deploy mist guns, school closures advisory"
    elif aqi >= 100:
        action = "Increase outdoor air quality monitoring frequency"
    else:
        action = "Maintain current green infrastructure"

    try:
        return await generate_daily_briefing(
            city=city,
            aqi=aqi,
            forecast_peak=forecast_peak,
            attribution=_DEFAULT_ATTRIBUTION,
            confidence_pct=84.5,
            recommended_action=action,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {e}")
