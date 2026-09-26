"""
app/services/gemini_service.py
Google Gemini 1.5 Flash client for the AI Advisor.
Injects live AQI/forecast/attribution context into every prompt
so answers are grounded in real model data, not generic LLM knowledge.
"""
from __future__ import annotations
import google.generativeai as genai
from app.core.config import settings
from app.models.schemas import AdvisorRequest, AdvisorResponse, BriefingResponse
from datetime import datetime, timezone

# Lazy init — configured on first call
_model = None


def _get_model():
    global _model
    if _model is None:
        genai.configure(api_key=settings.gemini_api_key)
        _model = genai.GenerativeModel("gemini-1.5-flash")
    return _model


# Language instruction map
_LANG_INSTRUCTIONS = {
    "en": "Respond in English.",
    "hi": "हिंदी में उत्तर दें। (Respond entirely in Hindi.)",
    "mr": "मराठीत उत्तर द्या. (Respond entirely in Marathi.)",
}

_SYSTEM_CONTEXT = """
You are the Atmos Twin AI Environmental Advisor — a civic decision-support assistant
for urban air quality management in Indian cities.

Your job is to answer questions using the real sensor data, forecasts, and attribution
figures provided in each prompt. NEVER make up numbers. Always cite the source values
from the context you are given. If a number is not available in the context, say so.

Keep answers concise (3–6 sentences max for chat, longer for briefings).
Always mention the AQI value, the dominant pollution source, and a recommended civic action.
"""


def _build_context_block(req: AdvisorRequest) -> str:
    """Build a structured context block injected into every prompt."""
    lines = [
        f"City: {req.city}",
        f"Current AQI: {req.context_aqi or 'not provided'}",
        f"Forecast Peak (next 24h): {req.context_forecast_peak or 'not provided'}",
        f"Dominant Pollution Source: {req.context_dominant_source or 'not provided'}",
        f"Timestamp: {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}",
    ]
    return "\n".join(lines)


async def ask_advisor(req: AdvisorRequest) -> AdvisorResponse:
    """
    Send a grounded question to Gemini and return a structured response.
    Context (AQI, forecast, attribution) is injected from the caller
    so the LLM always answers from real data.
    """
    model = _get_model()
    lang_instruction = _LANG_INSTRUCTIONS.get(req.language, _LANG_INSTRUCTIONS["en"])
    context_block = _build_context_block(req)

    prompt = f"""{_SYSTEM_CONTEXT}

--- Live Data Context ---
{context_block}

--- Question ---
{req.question}

--- Instruction ---
{lang_instruction}
"""

    response = model.generate_content(prompt)
    answer = response.text.strip()

    # Track which context fields were used
    sources_used = []
    if req.context_aqi:
        sources_used.append("live_aqi")
    if req.context_forecast_peak:
        sources_used.append("forecast")
    if req.context_dominant_source:
        sources_used.append("attribution")

    return AdvisorResponse(
        answer=answer,
        language=req.language,
        sources_used=sources_used,
        city=req.city,
    )


async def generate_daily_briefing(
    city: str,
    aqi: float,
    forecast_peak: float,
    attribution: dict,
    confidence_pct: float,
    recommended_action: str,
) -> BriefingResponse:
    """
    Generate a structured daily air quality briefing using a fixed prompt template.
    Returns both section-by-section and full plain text output.
    """
    model = _get_model()
    today = datetime.now(timezone.utc).strftime("%d %B %Y")

    prompt = f"""{_SYSTEM_CONTEXT}

Generate a structured daily air quality intelligence briefing for {city} on {today}.
Use ONLY the data provided below — do not invent figures.

--- Data ---
Current AQI: {aqi}
Forecast Peak (next 24h): {forecast_peak}
Source Attribution:
  - Vehicular/Traffic: {attribution.get('traffic_pct', 'N/A')}%
  - Industrial: {attribution.get('industrial_pct', 'N/A')}%
  - Biomass/Stubble: {attribution.get('biomass_pct', 'N/A')}%
  - Road Dust: {attribution.get('dust_pct', 'N/A')}%
Model Confidence: {confidence_pct}%
Recommended Civic Action: {recommended_action}

--- Format ---
Respond in JSON with exactly these keys:
{{
  "executive_summary": "2-3 sentence summary",
  "source_attribution": "2-3 sentence breakdown of pollution sources",
  "recommended_interventions": "2-3 sentence action plan",
  "public_health_advisory": "1-2 sentence advice for residents"
}}
Respond in English only for this briefing.
"""

    response = model.generate_content(prompt)
    raw = response.text.strip()

    # Try to parse JSON, fall back to raw text in executive_summary
    import json, re
    sections: dict[str, str] = {}
    try:
        # Strip markdown code fences if present
        cleaned = re.sub(r"```(?:json)?|```", "", raw).strip()
        sections = json.loads(cleaned)
    except Exception:
        sections = {"executive_summary": raw}

    full_text = "\n\n".join(
        f"## {k.replace('_', ' ').title()}\n{v}"
        for k, v in sections.items()
    )

    return BriefingResponse(
        city=city,
        date=today,
        sections=sections,
        full_text=full_text,
    )
