"""
app/routes/scenario.py
Scenario simulation endpoints — what-if interventions and ROI leaderboard.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
from app.services.scenario_service import run_scenario, build_roi_leaderboard, find_best_packages
from app.models.schemas import ScenarioInput, ScenarioResult, ROILeaderboardResponse

router = APIRouter(prefix="/scenario", tags=["Scenario"])


@router.post("/simulate", response_model=ScenarioResult)
async def simulate_scenario(inp: ScenarioInput):
    """
    Run a what-if intervention simulation.
    Pass any combination of intervention levers; get back simulated AQI,
    health cost delta, economic saving, and total intervention cost.

    All figures are illustrative estimates — labeled as modeled data.
    """
    try:
        return run_scenario(inp)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/roi-leaderboard", response_model=ROILeaderboardResponse)
async def get_roi_leaderboard(
    city: str = Query("Delhi"),
    baseline_aqi: float = Query(187.0, ge=0),
):
    """
    Return interventions ranked by AQI reduction per ₹ Crore (ROI).
    Each intervention is evaluated independently at its maximum effective level.
    """
    try:
        return build_roi_leaderboard(city=city, baseline_aqi=baseline_aqi)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Addition 1: Budget-Constrained Intervention Planning ─────────────────────

class BudgetPlanRequest(BaseModel):
    budget_crore: float = Field(50.0, ge=5, le=200)
    baseline_aqi: float = Field(187.0, ge=0)
    unavailable_interventions: list[str] = []
    city: str = "Delhi"


@router.post("/budget-plan")
async def budget_plan(req: BudgetPlanRequest):
    """
    Find the best intervention packages under a declared budget constraint.
    Returns top-3 feasible combos, 1 infeasible example, and sensitivity to ±10 Cr.
    Declared assumptions: cost/response tables are illustrative estimates.
    """
    try:
        return find_best_packages(
            budget_crore=req.budget_crore,
            baseline_aqi=req.baseline_aqi,
            unavailable=req.unavailable_interventions,
            city=req.city,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

