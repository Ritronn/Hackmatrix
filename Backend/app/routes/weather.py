"""
app/routes/weather.py
Weather endpoints — current conditions + wind vectors per city.
"""
from fastapi import APIRouter, HTTPException
from app.services.weather_service import fetch_weather
from app.models.schemas import WeatherData

router = APIRouter(prefix="/weather", tags=["Weather"])


@router.get("/{city}", response_model=WeatherData)
async def get_weather(city: str):
    """
    Fetch current weather for a city.
    Returns temperature, humidity, wind speed/direction,
    and u/v wind vector components for the particle animation.
    """
    try:
        return await fetch_weather(city)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Weather API error: {e}")
