"""
app/services/ml_service.py
ML Model Integration — loads trained XGBoost artifacts and exposes
forecast, attribution, scenario simulation, and spatial interpolation.

Models are loaded from  ../../ML Model/New Model/  relative to the Backend dir.
All feature engineering mirrors the training pipeline (pipeline.py) exactly.
"""
from __future__ import annotations

import json
import os
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import numpy as np

# ── Lazy globals — populated by load_models() at startup ─────────────────────
_forecasting_model = None
_quantile_models: dict = {}   # {"q10": model, "q50": model, "q90": model}
_models_loaded = False

# ── Path to model artifacts ──────────────────────────────────────────────────
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent          # Backend/
_MODEL_DIR   = _BACKEND_DIR.parent / "ML Model" / "New Model"

# ── Feature columns (must match pipeline.py §6 exactly) ─────────────────────
FEATURE_COLS = [
    'day_of_week', 'is_weekend', 'month', 'doy_sin', 'doy_cos',
    'aqi_lag_1', 'aqi_lag_2', 'aqi_lag_3', 'aqi_lag_7',
    'aqi_rolling_mean_7', 'aqi_rolling_std_7',
    'pm_ratio',
    # Real pollutant tracers
    'NO2', 'NOx', 'CO', 'SO2', 'Benzene', 'Toluene',
    # Synthetic scenario levers
    'traffic_index_synthetic', 'industrial_index_synthetic', 'dust_construction_index_synthetic',
    'is_traffic_corridor', 'is_industrial_belt', 'is_residential',
    'temp_c', 'humidity_pct', 'wind_speed_kmh',
]

# ── Station classification (mirrors pipeline.py §5d) ────────────────────────
TRAFFIC_KEYWORDS  = ['ITO', 'R K Puram', 'RK Puram', 'Punjabi Bagh',
                     'CRRI Mathura Road', 'Sri Aurobindo Marg', 'IGI Airport',
                     'Major Dhyan Chand', 'Shadipur', 'Mathura Road',
                     'Pusa Road', 'East Arjun Nagar']
INDUSTRIAL_KEYWORDS = ['Anand Vihar', 'Wazirpur', 'Mundka', 'Bawana',
                        'Okhla', 'Patparganj', 'Narela', 'Vivek Vihar',
                        'Jahangirpuri']

# Default proxy values per station type (mean of training distribution)
PROXY_DEFAULTS = {
    'traffic_corridor':        {'traffic': 0.85, 'industrial': 0.30, 'dust': 0.65},
    'industrial_belt':         {'traffic': 0.62, 'industrial': 1.00, 'dust': 0.72},
    'residential_background':  {'traffic': 0.44, 'industrial': 0.25, 'dust': 0.34},
}

# Clamped proxy ranges for scenario sliders (training support, per pipeline.py §11 FIX)
PROXY_CLAMP = {
    'traffic':    (0.05, 1.5),
    'industrial': (0.05, 1.5),
    'dust':       (0.05, 1.5),
}

# ── Delhi station coordinates (same as pipeline.py §11) ─────────────────────
DELHI_COORDS = {
    'Alipur':(28.7955,77.1533), 'Anand Vihar':(28.6469,77.3164),
    'Ashok Vihar':(28.6953,77.1818), 'Aya Nagar':(28.4707,77.1099),
    'Bawana':(28.7762,77.0513), 'CRRI Mathura Road':(28.5512,77.2738),
    'DTU':(28.7501,77.1177), 'Dwarka':(28.5706,77.0714),
    'East Arjun Nagar':(28.6558,77.2904),
    'IGI Airport':(28.5627,77.1180), 'IHBAS':(28.6811,77.3050),
    'ITO':(28.6289,77.2424), 'Jahangirpuri':(28.7329,77.1687),
    'JLN Stadium':(28.5826,77.2389), 'Lodhi Road':(28.5918,77.2273),
    'Major Dhyan Chand':(28.6117,77.2378), 'Mandir Marg':(28.6364,77.2008),
    'Mundka':(28.6847,77.0722), 'NSIT Dwarka':(28.6090,77.0327),
    'Narela':(28.8531,77.0925), 'Nehru Nagar':(28.5679,77.2503),
    'North Campus':(28.6577,77.2099), 'Okhla':(28.5308,77.2713),
    'Patparganj':(28.6237,77.2872), 'Punjabi Bagh':(28.6737,77.1311),
    'Pusa':(28.6396,77.1463), 'R K Puram':(28.5631,77.1860),
    'Rohini':(28.7325,77.1196), 'Shadipur':(28.6515,77.1580),
    'Siri Fort':(28.5504,77.2157), 'Sonia Vihar':(28.7105,77.2490),
    'Sri Aurobindo Marg':(28.5311,77.1904),
    'Vivek Vihar':(28.6725,77.3152), 'Wazirpur':(28.6997,77.1652),
}


# ═════════════════════════════════════════════════════════════════════════════
# 1. Model Loading
# ═════════════════════════════════════════════════════════════════════════════

def load_models() -> bool:
    """Load XGBoost model artifacts from disk. Called once at startup."""
    global _forecasting_model, _quantile_models, _models_loaded

    try:
        from xgboost import XGBRegressor

        # Forecasting model
        fpath = _MODEL_DIR / "forecasting_model.json"
        if not fpath.exists():
            print(f"[ml_service] Model file not found: {fpath}")
            return False

        _forecasting_model = XGBRegressor()
        _forecasting_model.load_model(str(fpath))
        print(f"[ml_service] [OK] Loaded forecasting model from {fpath.name}")

        # Quantile models
        for tag in ['q10', 'q50', 'q90']:
            qpath = _MODEL_DIR / f"quantile_model_{tag}.json"
            if qpath.exists():
                qm = XGBRegressor()
                qm.load_model(str(qpath))
                _quantile_models[tag] = qm
                print(f"[ml_service] [OK] Loaded quantile model {tag}")
            else:
                print(f"[ml_service] [WARN] Quantile model {tag} not found at {qpath.name}")

        _models_loaded = True
        return True

    except Exception as e:
        print(f"[ml_service] ERROR loading models: {e}")
        _models_loaded = False
        return False


def models_ready() -> bool:
    return _models_loaded and _forecasting_model is not None


# ═════════════════════════════════════════════════════════════════════════════
# 2. Station Classification
# ═════════════════════════════════════════════════════════════════════════════

def classify_station(name: str) -> str:
    """Classify a station by its name → traffic_corridor | industrial_belt | residential_background."""
    s = str(name).lower()
    for kw in TRAFFIC_KEYWORDS:
        if kw.lower() in s:
            return 'traffic_corridor'
    for kw in INDUSTRIAL_KEYWORDS:
        if kw.lower() in s:
            return 'industrial_belt'
    return 'residential_background'


def get_station_coords(name: str) -> tuple[float, float]:
    """Best-effort lat/lon lookup for a Delhi station."""
    for kw, (lat, lon) in DELHI_COORDS.items():
        if kw.lower() in str(name).lower():
            return lat, lon
    return 28.6139, 77.2090   # Delhi centre fallback


# ═════════════════════════════════════════════════════════════════════════════
# 3. Feature Engineering
# ═════════════════════════════════════════════════════════════════════════════

def _build_feature_row(
    *,
    date: datetime,
    aqi_lag_1: float,
    aqi_lag_2: float,
    aqi_lag_3: float,
    aqi_lag_7: float,
    aqi_rolling_mean_7: float,
    aqi_rolling_std_7: float,
    pm_ratio: float = 0.55,
    station_type: str = 'residential_background',
    traffic_proxy: Optional[float] = None,
    industrial_proxy: Optional[float] = None,
    dust_proxy: Optional[float] = None,
    temp_c: float = 28.0,
    humidity_pct: float = 55.0,
    wind_speed_kmh: float = 10.0,
    # Real pollutant tracers (optional — use defaults if missing)
    no2: float = 40.0,
    nox: float = 50.0,
    co: float = 1.5,
    so2: float = 12.0,
    benzene: float = 3.0,
    toluene: float = 8.0,
) -> np.ndarray:
    """Build a single feature row matching FEATURE_COLS order."""
    defaults = PROXY_DEFAULTS.get(station_type, PROXY_DEFAULTS['residential_background'])
    tp = traffic_proxy    if traffic_proxy    is not None else defaults['traffic']
    ip = industrial_proxy if industrial_proxy is not None else defaults['industrial']
    dp = dust_proxy       if dust_proxy       is not None else defaults['dust']

    # Clamp proxies to training support range
    tp = max(PROXY_CLAMP['traffic'][0],    min(PROXY_CLAMP['traffic'][1],    tp))
    ip = max(PROXY_CLAMP['industrial'][0], min(PROXY_CLAMP['industrial'][1], ip))
    dp = max(PROXY_CLAMP['dust'][0],       min(PROXY_CLAMP['dust'][1],       dp))

    doy = date.timetuple().tm_yday

    is_tc  = 1 if station_type == 'traffic_corridor' else 0
    is_ib  = 1 if station_type == 'industrial_belt'  else 0
    is_res = 1 if station_type == 'residential_background' else 0

    row = [
        date.weekday(),                          # day_of_week
        int(date.weekday() >= 5),                # is_weekend
        date.month,                               # month
        math.sin(2 * math.pi * doy / 365),       # doy_sin
        math.cos(2 * math.pi * doy / 365),       # doy_cos
        aqi_lag_1,
        aqi_lag_2,
        aqi_lag_3,
        aqi_lag_7,
        aqi_rolling_mean_7,
        aqi_rolling_std_7,
        pm_ratio,
        no2, nox, co, so2, benzene, toluene,
        tp, ip, dp,
        is_tc, is_ib, is_res,
        temp_c, humidity_pct, wind_speed_kmh,
    ]
    return np.array(row, dtype=np.float64).reshape(1, -1)


# ═════════════════════════════════════════════════════════════════════════════
# 4. Forecast (1–3 day)
# ═════════════════════════════════════════════════════════════════════════════

def forecast_n_days(
    *,
    current_aqi: float,
    trailing_aqi: list[float],          # last 7+ known AQI values
    station_type: str = 'residential_background',
    temp_c: float = 28.0,
    humidity_pct: float = 55.0,
    wind_speed_kmh: float = 10.0,
    pm25: Optional[float] = None,
    pm10: Optional[float] = None,
    no2: float = 40.0,
    nox: float = 50.0,
    co: float = 1.5,
    so2: float = 12.0,
    benzene: float = 3.0,
    toluene: float = 8.0,
    xylene: float = 2.0,
    n: int = 3,
) -> list[dict]:
    """
    Recursive multi-day forecast using the trained XGBoost model.
    Returns list of {date, horizon, predicted_aqi, lower, upper, confidence_pct}.
    """
    if not models_ready():
        raise RuntimeError("ML models not loaded")

    # Ensure trailing history has enough values
    trail = list(trailing_aqi) if trailing_aqi else [current_aqi] * 8
    if len(trail) < 7:
        trail = [current_aqi] * (7 - len(trail)) + trail

    # PM ratio
    pm_ratio = 0.55
    if pm25 is not None and pm10 is not None and pm10 > 0:
        pm_ratio = pm25 / pm10

    now = datetime.now(timezone.utc)
    preds = []

    for step in range(n):
        target_date = now + timedelta(days=step + 1)

        # Build lag features from trail
        aqi_lag_1 = trail[-1]
        aqi_lag_2 = trail[-2] if len(trail) >= 2 else trail[-1]
        aqi_lag_3 = trail[-3] if len(trail) >= 3 else trail[-1]
        aqi_lag_7 = trail[-7] if len(trail) >= 7 else trail[0]

        window = trail[-7:] if len(trail) >= 7 else trail
        rolling_mean = float(np.mean(window))
        rolling_std  = float(np.std(window, ddof=1)) if len(window) > 1 else 0.0

        row = _build_feature_row(
            date=target_date,
            aqi_lag_1=aqi_lag_1, aqi_lag_2=aqi_lag_2,
            aqi_lag_3=aqi_lag_3, aqi_lag_7=aqi_lag_7,
            aqi_rolling_mean_7=rolling_mean, aqi_rolling_std_7=rolling_std,
            pm_ratio=pm_ratio, station_type=station_type,
            temp_c=temp_c, humidity_pct=humidity_pct, wind_speed_kmh=wind_speed_kmh,
            no2=no2, nox=nox, co=co, so2=so2,
            benzene=benzene, toluene=toluene,
        )

        pred_aqi = float(_forecasting_model.predict(row)[0])

        # Quantile predictions for confidence bands
        lower, upper = pred_aqi * 0.85, pred_aqi * 1.15  # fallback
        if 'q10' in _quantile_models and 'q90' in _quantile_models:
            q10 = float(_quantile_models['q10'].predict(row)[0])
            q90 = float(_quantile_models['q90'].predict(row)[0])
            # Enforce ordering
            vals = sorted([q10, pred_aqi, q90])
            lower, pred_aqi, upper = vals[0], vals[1], vals[2]

        # Confidence decreases with horizon
        conf = max(50.0, 95.0 - (step * 8))

        preds.append({
            'date': target_date.strftime('%Y-%m-%d'),
            'horizon': step + 1,
            'predicted_aqi': round(max(0, pred_aqi), 1),
            'lower': round(max(0, lower), 1),
            'upper': round(max(0, upper), 1),
            'confidence_pct': round(conf, 1),
        })

        # Append prediction to trailing history for next step
        trail.append(pred_aqi)

    return preds


# ═════════════════════════════════════════════════════════════════════════════
# 5. Source Attribution (SHAP-based)
# ═════════════════════════════════════════════════════════════════════════════

def get_attribution(
    *,
    current_aqi: float,
    station_type: str = 'residential_background',
    temp_c: float = 28.0,
    humidity_pct: float = 55.0,
    wind_speed_kmh: float = 10.0,
) -> dict:
    """
    Compute SHAP-based source attribution breakdown for a single prediction.
    Returns percentage breakdown by source category.
    """
    if not models_ready():
        raise RuntimeError("ML models not loaded")

    # Build a representative feature row
    row = _build_feature_row(
        date=datetime.now(timezone.utc),
        aqi_lag_1=current_aqi, aqi_lag_2=current_aqi * 0.98,
        aqi_lag_3=current_aqi * 0.96, aqi_lag_7=current_aqi * 0.92,
        aqi_rolling_mean_7=current_aqi * 0.97,
        aqi_rolling_std_7=current_aqi * 0.05,
        station_type=station_type,
        temp_c=temp_c, humidity_pct=humidity_pct, wind_speed_kmh=wind_speed_kmh,
    )

    try:
        import shap
        explainer = shap.TreeExplainer(_forecasting_model)
        sv = explainer.shap_values(row)[0]  # shape (n_features,)

        # Map feature index → name
        fi = {f: i for i, f in enumerate(FEATURE_COLS)}

        # Source bucket definitions (mirrors pipeline.py §10a)
        buckets = {
            'traffic': ['NO2', 'NOx', 'CO', 'Benzene', 'Toluene', 'Xylene', 'traffic_index_synthetic'],
            'industrial': ['SO2', 'industrial_index_synthetic'],
            'combustion_dust': ['pm_ratio', 'dust_construction_index_synthetic'],
            'meteorology': ['temp_c', 'humidity_pct', 'wind_speed_kmh'],
            'carry_over': ['aqi_lag_1', 'aqi_lag_2', 'aqi_lag_3', 'aqi_lag_7',
                           'aqi_rolling_mean_7', 'aqi_rolling_std_7',
                           'month', 'doy_sin', 'doy_cos', 'day_of_week', 'is_weekend'],
        }

        bucket_abs = {}
        for bname, cols in buckets.items():
            idxs = [fi[c] for c in cols if c in fi]
            bucket_abs[bname] = sum(abs(sv[i]) for i in idxs) if idxs else 0.0

        # Normalize emission sources to 100%
        emission_total = bucket_abs['traffic'] + bucket_abs['industrial'] + bucket_abs['combustion_dust'] + 1e-9
        total_all = sum(bucket_abs.values()) + 1e-9

        return {
            'traffic_pct': float(round(bucket_abs['traffic'] / emission_total * 100, 1)),
            'industrial_pct': float(round(bucket_abs['industrial'] / emission_total * 100, 1)),
            'combustion_dust_pct': float(round(bucket_abs['combustion_dust'] / emission_total * 100, 1)),
            'meteorology_pct': float(round(bucket_abs['meteorology'] / total_all * 100, 1)),
            'carry_over_pct': float(round(bucket_abs['carry_over'] / total_all * 100, 1)),
            'station_type': station_type,
            'method': 'SHAP-TreeExplainer',
            'note': 'Tracer-based model attribution, not a physical emissions inventory.',
        }

    except ImportError:
        # SHAP not installed — return station-type-based heuristic attribution
        return _heuristic_attribution(station_type)


def _heuristic_attribution(station_type: str) -> dict:
    """Fallback attribution when SHAP is unavailable."""
    presets = {
        'traffic_corridor':       {'traffic_pct': 55.0, 'industrial_pct': 15.0, 'combustion_dust_pct': 30.0},
        'industrial_belt':        {'traffic_pct': 20.0, 'industrial_pct': 50.0, 'combustion_dust_pct': 30.0},
        'residential_background': {'traffic_pct': 35.0, 'industrial_pct': 20.0, 'combustion_dust_pct': 45.0},
    }
    base = presets.get(station_type, presets['residential_background'])
    return {
        **base,
        'meteorology_pct': 15.0,
        'carry_over_pct': 25.0,
        'station_type': station_type,
        'method': 'heuristic-proxy',
        'note': 'SHAP unavailable — station-type-based heuristic estimate.',
    }


# ═════════════════════════════════════════════════════════════════════════════
# 6. ML-Powered Scenario Simulation
# ═════════════════════════════════════════════════════════════════════════════

def run_ml_scenario(
    *,
    baseline_aqi: float,
    traffic_reduction_pct: float = 0.0,       # 0–50 → percentage reduction
    industrial_curtailment_pct: float = 0.0,   # 0–40
    construction_halt_pct: float = 0.0,        # 0–100
    station_type: str = 'residential_background',
    temp_c: float = 28.0,
    humidity_pct: float = 55.0,
    wind_speed_kmh: float = 10.0,
) -> dict:
    """
    Re-run the forecast model with modified proxy inputs to simulate interventions.
    Returns baseline vs simulated AQI comparison.
    """
    if not models_ready():
        raise RuntimeError("ML models not loaded")

    defaults = PROXY_DEFAULTS.get(station_type, PROXY_DEFAULTS['residential_background'])

    # Baseline prediction (normal proxies)
    trail = [baseline_aqi] * 8
    row_baseline = _build_feature_row(
        date=datetime.now(timezone.utc) + timedelta(days=1),
        aqi_lag_1=baseline_aqi, aqi_lag_2=baseline_aqi * 0.98,
        aqi_lag_3=baseline_aqi * 0.96, aqi_lag_7=baseline_aqi * 0.92,
        aqi_rolling_mean_7=baseline_aqi * 0.97, aqi_rolling_std_7=baseline_aqi * 0.05,
        station_type=station_type,
        traffic_proxy=defaults['traffic'],
        industrial_proxy=defaults['industrial'],
        dust_proxy=defaults['dust'],
        temp_c=temp_c, humidity_pct=humidity_pct, wind_speed_kmh=wind_speed_kmh,
    )
    baseline_pred = float(_forecasting_model.predict(row_baseline)[0])

    # Scenario prediction (reduced proxies)
    traffic_factor    = 1.0 - (traffic_reduction_pct / 100.0)
    industrial_factor = 1.0 - (industrial_curtailment_pct / 100.0)
    dust_factor       = 1.0 - (construction_halt_pct / 100.0)

    row_scenario = _build_feature_row(
        date=datetime.now(timezone.utc) + timedelta(days=1),
        aqi_lag_1=baseline_aqi, aqi_lag_2=baseline_aqi * 0.98,
        aqi_lag_3=baseline_aqi * 0.96, aqi_lag_7=baseline_aqi * 0.92,
        aqi_rolling_mean_7=baseline_aqi * 0.97, aqi_rolling_std_7=baseline_aqi * 0.05,
        station_type=station_type,
        traffic_proxy=defaults['traffic'] * traffic_factor,
        industrial_proxy=defaults['industrial'] * industrial_factor,
        dust_proxy=defaults['dust'] * dust_factor,
        temp_c=temp_c, humidity_pct=humidity_pct, wind_speed_kmh=wind_speed_kmh,
    )
    scenario_pred = float(_forecasting_model.predict(row_scenario)[0])

    aqi_drop = max(0, baseline_pred - scenario_pred)
    reduction_pct = (aqi_drop / baseline_pred * 100) if baseline_pred > 0 else 0

    return {
        'baseline_predicted_aqi': round(baseline_pred, 1),
        'scenario_predicted_aqi': round(max(0, scenario_pred), 1),
        'aqi_reduction': round(aqi_drop, 1),
        'reduction_pct': round(reduction_pct, 1),
        'station_type': station_type,
        'method': 'xgboost-scenario',
    }


# ═════════════════════════════════════════════════════════════════════════════
# 7. Spatial Interpolation (Gaussian Process)
# ═════════════════════════════════════════════════════════════════════════════

def interpolate_city_surface(
    station_data: list[dict],    # [{name, lat, lon, aqi}, ...]
    grid_resolution: int = 50,
) -> list[dict]:
    """
    Run Gaussian Process interpolation across station readings.
    Returns a grid of {lat, lon, predicted_aqi, std_dev, confidence} points.
    """
    try:
        from sklearn.gaussian_process import GaussianProcessRegressor
        from sklearn.gaussian_process.kernels import RBF, WhiteKernel
    except ImportError:
        raise RuntimeError("scikit-learn required for spatial interpolation")

    if len(station_data) < 2:
        # Not enough stations — return raw points
        return [{
            'lat': s['lat'], 'lon': s['lon'],
            'predicted_aqi': s['aqi'], 'std_dev': 0.0, 'confidence': 1.0,
        } for s in station_data]

    coords = np.array([[s['lat'], s['lon']] for s in station_data])
    values = np.array([s['aqi'] for s in station_data])

    # Project to km (equirectangular)
    mean_lat = coords[:, 0].mean()
    mean_lon = coords[:, 1].mean()
    KM_LAT = 111.0
    KM_LON = 111.0 * np.cos(np.radians(mean_lat))

    coords_km = np.column_stack([
        (coords[:, 0] - mean_lat) * KM_LAT,
        (coords[:, 1] - mean_lon) * KM_LON,
    ])

    kernel = RBF(length_scale=5.0) + WhiteKernel(noise_level=1.0)
    gp = GaussianProcessRegressor(kernel=kernel, normalize_y=True, random_state=42)
    gp.fit(coords_km, values)

    # Grid generation
    xr = np.linspace(coords_km[:, 0].min() - 2, coords_km[:, 0].max() + 2, grid_resolution)
    yr = np.linspace(coords_km[:, 1].min() - 2, coords_km[:, 1].max() + 2, grid_resolution)
    gx, gy = np.meshgrid(xr, yr)
    grid_km = np.column_stack([gx.ravel(), gy.ravel()])

    pred, std = gp.predict(grid_km, return_std=True)

    # Convert back to lat/lon
    glat = grid_km[:, 0] / KM_LAT + mean_lat
    glon = grid_km[:, 1] / KM_LON + mean_lon

    # Confidence: 1.0 at std=0, decays towards 0 as std grows
    max_std = std.max() if std.max() > 0 else 1.0
    confidence = 1.0 - (std / (max_std + 1e-9))

    return [
        {
            'lat': float(la), 'lon': float(lo),
            'predicted_aqi': round(float(a), 1),
            'std_dev': round(float(s), 2),
            'confidence': round(float(c), 3),
        }
        for la, lo, a, s, c in zip(glat, glon, pred, std, confidence)
    ]


# ═════════════════════════════════════════════════════════════════════════════
# 8. Model Metrics (from training run)
# ═════════════════════════════════════════════════════════════════════════════

def get_model_metrics() -> dict:
    """Load and return the training metrics from metrics.json."""
    metrics_path = _MODEL_DIR / "metrics.json"
    if not metrics_path.exists():
        return {"error": "metrics.json not found", "path": str(metrics_path)}
    with open(metrics_path) as f:
        return json.load(f)


# ═════════════════════════════════════════════════════════════════════════════
# 9. Sensor Loss Simulation  (Addition 2A — Final Round)
# ═════════════════════════════════════════════════════════════════════════════

def simulate_sensor_loss(
    all_stations: list[dict],    # [{name, lat, lon, aqi}, ...]
    loss_pct: float,             # 10, 30, or 50
    seed: int = 42,
) -> dict:
    """
    Randomly drop loss_pct% of stations, re-run GP interpolation,
    measure prediction error at dropped locations.
    Uses existing interpolate_city_surface() — no model changes.
    """
    import random
    rng = random.Random(seed)

    if len(all_stations) < 3:
        return {"error": "Need at least 3 stations for sensor loss simulation"}

    n_drop = max(1, int(len(all_stations) * loss_pct / 100))
    n_drop = min(n_drop, len(all_stations) - 2)  # keep at least 2 active

    dropped = rng.sample(all_stations, n_drop)
    dropped_names = {s['name'] for s in dropped}
    remaining = [s for s in all_stations if s['name'] not in dropped_names]

    # Baseline: full-sensor GP
    baseline_grid = interpolate_city_surface(remaining + dropped, grid_resolution=30)
    baseline_avg_std = sum(p['std_dev'] for p in baseline_grid) / len(baseline_grid) if baseline_grid else 0

    # Degraded: reduced-sensor GP
    degraded_grid = interpolate_city_surface(remaining, grid_resolution=30)
    degraded_avg_std = sum(p['std_dev'] for p in degraded_grid) / len(degraded_grid) if degraded_grid else 0

    # Measure error at each dropped station location
    station_errors = []
    for station in dropped:
        nearest = min(
            degraded_grid,
            key=lambda p: (p['lat'] - station['lat'])**2 + (p['lon'] - station['lon'])**2
        )
        error = abs(nearest['predicted_aqi'] - station['aqi'])
        station_errors.append({
            "station_name": station['name'],
            "actual_aqi": station['aqi'],
            "predicted_aqi": nearest['predicted_aqi'],
            "std_dev": nearest['std_dev'],
            "confidence": nearest['confidence'],
            "error": round(error, 2),
        })

    # Also compute persistence baseline: predict each dropped station as avg of 3 nearest active
    persistence_errors = []
    for station in dropped:
        nearest_active = sorted(
            remaining,
            key=lambda s: (s['lat'] - station['lat'])**2 + (s['lon'] - station['lon'])**2
        )[:3]
        if nearest_active:
            simple_pred = sum(s['aqi'] for s in nearest_active) / len(nearest_active)
            persistence_errors.append(abs(simple_pred - station['aqi']))

    mae = sum(e['error'] for e in station_errors) / len(station_errors) if station_errors else 0
    persistence_mae = sum(persistence_errors) / len(persistence_errors) if persistence_errors else 0

    return {
        "loss_pct": loss_pct,
        "total_stations": len(all_stations),
        "active_stations": len(remaining),
        "dropped_count": len(dropped),
        "dropped_stations": [{"name": s['name'], "lat": s['lat'], "lon": s['lon'], "aqi": s['aqi']} for s in dropped],
        "active_station_names": [s['name'] for s in remaining],
        "gp_mae_at_dropped": round(mae, 2),
        "persistence_baseline_mae": round(persistence_mae, 2),
        "gp_beats_baseline": mae < persistence_mae,
        "baseline_avg_std": round(baseline_avg_std, 2),
        "degraded_avg_std": round(degraded_avg_std, 2),
        "uncertainty_increase_pct": round((degraded_avg_std - baseline_avg_std) / (baseline_avg_std + 1e-9) * 100, 1),
        "station_errors": station_errors,
        "degraded_grid": degraded_grid,
        "method": "gaussian-process-spatial",
        "note": "[MODELED] Spatial extrapolation under simulated sensor failure — not live sensor readings.",
    }


# ═════════════════════════════════════════════════════════════════════════════
# 10. Held-Out Location Forecasting  (Addition 2B — Final Round)
# ═════════════════════════════════════════════════════════════════════════════

def held_out_location_demo(
    all_stations: list[dict],    # [{name, lat, lon, aqi}, ...]
    held_out_name: str,
) -> dict:
    """
    Withhold one station from GP interpolation, predict its AQI
    from neighboring stations only. Compare GP vs simple baseline.
    """
    # Find the target station
    target = None
    for s in all_stations:
        if held_out_name.lower() in s['name'].lower():
            target = s
            break
    if target is None:
        return {"error": f"Station '{held_out_name}' not found in {[s['name'] for s in all_stations]}"}

    remaining = [s for s in all_stations if s['name'] != target['name']]
    if len(remaining) < 2:
        return {"error": "Need at least 2 remaining stations for interpolation"}

    # GP prediction (our method)
    grid = interpolate_city_surface(remaining, grid_resolution=40)
    gp_point = min(
        grid,
        key=lambda p: (p['lat'] - target['lat'])**2 + (p['lon'] - target['lon'])**2
    )

    # Simple spatial baseline: average of 3 nearest active neighbors
    nearest_3 = sorted(
        remaining,
        key=lambda s: (s['lat'] - target['lat'])**2 + (s['lon'] - target['lon'])**2
    )[:3]
    baseline_pred = sum(s['aqi'] for s in nearest_3) / len(nearest_3)

    # Persistence baseline: use the city-wide average
    city_avg = sum(s['aqi'] for s in remaining) / len(remaining)

    gp_error = abs(gp_point['predicted_aqi'] - target['aqi'])
    baseline_error = abs(baseline_pred - target['aqi'])
    city_avg_error = abs(city_avg - target['aqi'])

    return {
        "held_out_station": target['name'],
        "held_out_lat": target['lat'],
        "held_out_lon": target['lon'],
        "actual_aqi": target['aqi'],
        "gp_predicted_aqi": gp_point['predicted_aqi'],
        "gp_uncertainty_std": gp_point['std_dev'],
        "gp_confidence": gp_point['confidence'],
        "spatial_baseline_aqi": round(baseline_pred, 1),
        "city_avg_baseline_aqi": round(city_avg, 1),
        "gp_error": round(gp_error, 2),
        "spatial_baseline_error": round(baseline_error, 2),
        "city_avg_error": round(city_avg_error, 2),
        "gp_beats_spatial_baseline": gp_error < baseline_error,
        "gp_beats_city_avg": gp_error < city_avg_error,
        "nearest_neighbors": [{"name": s['name'], "aqi": s['aqi']} for s in nearest_3],
        "n_stations_used": len(remaining),
        "method": "gaussian-process-spatial",
        "note": "[MODELED] Spatial extrapolation to unseen location — not a physical sensor reading.",
    }
