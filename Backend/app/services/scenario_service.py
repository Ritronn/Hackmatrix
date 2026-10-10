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
    "stubble":  "Biomass & Crop Residue Burning Interception",
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


# ═════════════════════════════════════════════════════════════════════════════
# Budget-Constrained Intervention Planning  (Addition 1 — Final Round)
# ═════════════════════════════════════════════════════════════════════════════

from itertools import combinations as _combinations

# Max-level inputs per intervention key
_MAX_LEVELS = {
    "traffic":  {"traffic_restriction_pct": 50},
    "industry": {"industrial_curtailment_pct": 40},
    "mist":     {"mist_units": 100},
    "const":    {"construction_halt_pct": 100},
}


def find_best_packages(
    budget_crore: float,
    baseline_aqi: float = 187.0,
    unavailable: list[str] | None = None,
    city: str = "Delhi",
) -> dict:
    """
    Enumerate all non-empty subsets of available interventions,
    keep those fitting within budget, rank by AQI reduction.
    Returns top-3 feasible packages, 1 infeasible example,
    and sensitivity analysis for ±10 Cr budget shift.
    """
    unavailable = unavailable or []
    all_keys = [k for k in _MAX_LEVELS if k not in unavailable]

    packages: list[dict] = []
    for r in range(1, len(all_keys) + 1):
        for combo in _combinations(all_keys, r):
            # Build ScenarioInput with selected interventions at max level
            kwargs = {"city": city, "baseline_aqi": baseline_aqi}
            for key in combo:
                kwargs.update(_MAX_LEVELS[key])
            inp = ScenarioInput(**kwargs)
            result = run_scenario(inp)

            cost = result.total_cost_crore
            drop = result.aqi_reduction
            packages.append({
                "interventions": [_NAMES[k] for k in combo],
                "keys": list(combo),
                "total_cost_crore": round(cost, 2),
                "aqi_reduction": round(drop, 1),
                "simulated_aqi": result.simulated_aqi,
                "reduction_pct": result.reduction_pct,
                "feasible": cost <= budget_crore,
                "roi": round(drop / cost, 3) if cost > 0 else 0.0,
                "er_visits_avoided": result.er_visits_avoided_per_day,
                "economic_saving_crore": result.economic_saving_crore,
            })

    feasible = sorted(
        [p for p in packages if p["feasible"]],
        key=lambda x: x["aqi_reduction"],
        reverse=True,
    )
    infeasible = sorted(
        [p for p in packages if not p["feasible"]],
        key=lambda x: x["aqi_reduction"],
        reverse=True,
    )

    # Sensitivity: how does the best package change with ±10 Cr?
    sensitivity = {}
    for delta_label, delta in [("minus_10cr", -10), ("plus_10cr", +10)]:
        alt_budget = max(5, budget_crore + delta)
        alt_feasible = sorted(
            [p for p in packages if p["total_cost_crore"] <= alt_budget],
            key=lambda x: x["aqi_reduction"],
            reverse=True,
        )
        sensitivity[delta_label] = {
            "budget_crore": alt_budget,
            "best_aqi_reduction": alt_feasible[0]["aqi_reduction"] if alt_feasible else 0,
            "best_package": alt_feasible[0]["interventions"] if alt_feasible else [],
            "n_feasible": len(alt_feasible),
        }

    return {
        "budget_crore": budget_crore,
        "baseline_aqi": baseline_aqi,
        "unavailable": unavailable,
        "top_packages": feasible[:3],
        "infeasible_example": infeasible[0] if infeasible else None,
        "total_combos_evaluated": len(packages),
        "n_feasible": len(feasible),
        "n_infeasible": len(infeasible),
        "sensitivity": sensitivity,
        "cost_assumptions_note": "All costs are illustrative estimates in ₹ Crore — clearly labeled as modeled data.",
    }
