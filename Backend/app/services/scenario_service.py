"""
app/services/scenario_service.py
Intervention scenario engine.
Applies a simplified linear perturbation model over baseline AQI.
All cost/feasibility weights are illustrative estimates — clearly labeled.
The ML team can replace the AQI calculation with their model output later.
"""
from __future__ import annotations
from app.models.schemas import (
    ScenarioInput, ScenarioResult, ROIEntry, ROILeaderboardResponse, AQIBand
)
from app.services.aqi_service import get_band

# ── Illustrative weight tables (clearly labeled as estimated) ──
# AQI reduction coefficients per unit of intervention
_REDUCTION = {
    "traffic":    lambda pct: (pct / 50.0) * 22.0,    # max 22 AQI at 50% restriction
    "industry":   lambda pct: (pct / 40.0) * 16.0,    # max 16 AQI at 40% curtailment
    "mist":       lambda n:   (n   / 100.0) * 12.0,   # max 12 AQI at 100 units
    "const":      lambda pct: (pct / 100.0) * 8.0,    # max 8 AQI at 100% halt
    "metro":      4.5,                                  # flat benefit
    "stubble":    9.5,                                  # flat benefit
}

# Cost in ₹ Crore
_COST = {
    "traffic":    lambda pct: (pct / 50.0) * 15.0,
    "industry":   lambda pct: (pct / 40.0) * 18.0,
    "mist":       lambda n:   (n   / 100.0) * 10.0,
    "const":      lambda pct: (pct / 100.0) * 7.0,
    "metro":      6.0,
    "stubble":    4.0,
}

# Feasibility labels
_FEASIBILITY = {
    "traffic":  "Medium",
    "industry": "Low",
    "mist":     "High",
    "const":    "Medium",
    "metro":    "High",
    "stubble":  "Medium",
}

# Human-readable names
_NAMES = {
    "traffic":  "Odd-Even & Heavy Vehicle Restriction",
    "industry": "Industrial Kiln & Furnace Curtailment",
    "mist":     "Anti-Smog Mist Guns & Road Sweepers",
    "const":    "Construction & Demolition Halt",
    "metro":    "Free Metro & EV Bus Fares",
    "stubble":  "Stubble Drone Interception",
}


def run_scenario(inp: ScenarioInput) -> ScenarioResult:
    """
    Re-forecast AQI after applying all interventions.
    Returns simulated AQI, reduction, health cost delta, and total cost.
    """
    drops: dict[str, float] = {
        "traffic":  _REDUCTION["traffic"](inp.traffic_restriction_pct),
        "industry": _REDUCTION["industry"](inp.industrial_curtailment_pct),
        "mist":     _REDUCTION["mist"](inp.mist_units),
        "const":    _REDUCTION["const"](inp.construction_halt_pct),
        "metro":    _REDUCTION["metro"] if inp.metro_subsidy else 0.0,
        "stubble":  _REDUCTION["stubble"] if inp.stubble_interception else 0.0,
    }
    costs: dict[str, float] = {
        "traffic":  _COST["traffic"](inp.traffic_restriction_pct),
        "industry": _COST["industry"](inp.industrial_curtailment_pct),
        "mist":     _COST["mist"](inp.mist_units),
        "const":    _COST["const"](inp.construction_halt_pct),
        "metro":    _COST["metro"] if inp.metro_subsidy else 0.0,
        "stubble":  _COST["stubble"] if inp.stubble_interception else 0.0,
    }

    total_drop = sum(drops.values())
    total_cost = sum(costs.values())
    simulated = max(30.0, inp.baseline_aqi - total_drop)
    reduction_pct = (total_drop / inp.baseline_aqi * 100) if inp.baseline_aqi else 0.0

    # Health proxies (illustrative)
    er_avoided = int(total_drop * 2.8)
    econ_saved = round(total_drop * 0.32, 2)

    return ScenarioResult(
        simulated_aqi=round(simulated, 1),
        aqi_reduction=round(total_drop, 1),
        reduction_pct=round(reduction_pct, 1),
        er_visits_avoided_per_day=er_avoided,
        economic_saving_crore=econ_saved,
        total_cost_crore=round(total_cost, 2),
        band=get_band(simulated),
    )


def build_roi_leaderboard(city: str, baseline_aqi: float) -> ROILeaderboardResponse:
    """
    Run each intervention independently at its maximum value
    and rank by AQI reduction per ₹ Crore (ROI).
    """
    max_inputs = {
        "traffic":  ScenarioInput(city=city, baseline_aqi=baseline_aqi, traffic_restriction_pct=50),
        "industry": ScenarioInput(city=city, baseline_aqi=baseline_aqi, industrial_curtailment_pct=40),
        "mist":     ScenarioInput(city=city, baseline_aqi=baseline_aqi, mist_units=100),
        "const":    ScenarioInput(city=city, baseline_aqi=baseline_aqi, construction_halt_pct=100),
        "metro":    ScenarioInput(city=city, baseline_aqi=baseline_aqi, metro_subsidy=True),
        "stubble":  ScenarioInput(city=city, baseline_aqi=baseline_aqi, stubble_interception=True),
    }

    entries: list[ROIEntry] = []
    for key, inp in max_inputs.items():
        result = run_scenario(inp)
        cost = result.total_cost_crore
        drop = result.aqi_reduction
        roi = round(drop / cost, 3) if cost > 0 else 0.0
        entries.append(ROIEntry(
            rank=0,  # assigned after sort
            intervention=_NAMES[key],
            aqi_drop=drop,
            cost_crore=cost,
            roi_per_crore=roi,
            feasibility=_FEASIBILITY[key],
        ))

    entries.sort(key=lambda e: e.roi_per_crore, reverse=True)
    for i, e in enumerate(entries, 1):
        e.rank = i

    return ROILeaderboardResponse(
        city=city,
        baseline_aqi=baseline_aqi,
        interventions=entries,
    )
