"""
main.py — Atmos Twin FastAPI Application Entry Point

Start the server:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.redis_client import get_redis, close_redis
from app.routes import aqi, weather, scenario, drift, wards, advisor


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks."""
    # Warm up Redis connection pool
    try:
        r = await get_redis()
        await r.ping()
        print("[startup] Redis connection OK")
    except Exception as e:
        print(f"[startup] WARNING: Redis not reachable — {e}")
        print("          Drift detection and stream ingestion will be unavailable.")

    yield  # app runs here

    await close_redis()
    print("[shutdown] Redis connection closed")


app = FastAPI(
    title="Atmos Twin — Environmental Intelligence API",
    description=(
        "Decision-support API for urban air quality digital twin. "
        "Provides AQI readings, weather data, scenario simulation, "
        "ward analytics, twin drift detection, and an LLM advisor."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(aqi.router)
app.include_router(weather.router)
app.include_router(scenario.router)
app.include_router(drift.router)
app.include_router(wards.router)
app.include_router(advisor.router)


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    """Simple liveness check."""
    try:
        r = await get_redis()
        await r.ping()
        redis_status = "ok"
    except Exception:
        redis_status = "unreachable"

    return {
        "status": "ok",
        "redis": redis_status,
        "version": "1.0.0",
    }


@app.get("/", tags=["System"])
async def root():
    return {
        "message": "Atmos Twin API is running",
        "docs": "/docs",
        "health": "/health",
    }
