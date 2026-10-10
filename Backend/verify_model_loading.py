#!/usr/bin/env python3
"""
verify_model_loading.py
Quick script to verify ML models load correctly from New Model directory.
Run this before starting the backend server.

Usage:
    python verify_model_loading.py
"""
import sys
from pathlib import Path

# Fix Windows console encoding for Unicode/emojis
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

def verify_models():
    """Verify all ML model artifacts can be loaded."""
    print("=" * 70)
    print("BLACK PEARL - ML Model Loading Verification")
    print("=" * 70)
    print()
    
    # Check directory structure
    backend_dir = Path(__file__).parent
    model_dir = backend_dir.parent / "ML Model" / "New Model"
    
    print(f"📁 Backend Directory: {backend_dir}")
    print(f"📁 Model Directory: {model_dir}")
    print()
    
    if not model_dir.exists():
        print("❌ ERROR: New Model directory not found!")
        print(f"   Expected path: {model_dir}")
        return False
    
    print("✅ New Model directory found")
    print()
    
    # Check required files
    required_files = [
        "forecasting_model.json",
        "quantile_model_q10.json",
        "quantile_model_q50.json",
        "quantile_model_q90.json",
        "metrics.json",
    ]
    
    optional_files = [
        "shap_summary.png",
        "shap_summary_traffic_corridor.png",
        "shap_summary_industrial_belt.png",
        "shap_summary_residential_background.png",
        "pred_vs_actual.png",
        "interpolation_sample.json",
    ]
    
    print("Checking required model files:")
    print("-" * 70)
    all_found = True
    for filename in required_files:
        filepath = model_dir / filename
        if filepath.exists():
            size_kb = filepath.stat().st_size / 1024
            print(f"  ✅ {filename:<35} ({size_kb:>8.1f} KB)")
        else:
            print(f"  ❌ {filename:<35} MISSING")
            all_found = False
    
    print()
    print("Checking optional visualization files:")
    print("-" * 70)
    for filename in optional_files:
        filepath = model_dir / filename
        if filepath.exists():
            size_kb = filepath.stat().st_size / 1024
            print(f"  ✅ {filename:<35} ({size_kb:>8.1f} KB)")
        else:
            print(f"  ⚠️  {filename:<35} Not found (optional)")
    
    if not all_found:
        print()
        print("❌ Some required files are missing!")
        return False
    
    print()
    print("=" * 70)
    print("Attempting to load models...")
    print("=" * 70)
    print()
    
    # Try to load models
    try:
        from xgboost import XGBRegressor
        print("✅ XGBoost imported successfully")
        
        # Load forecasting model
        print()
        print("Loading forecasting model...")
        forecasting_path = model_dir / "forecasting_model.json"
        forecasting_model = XGBRegressor()
        forecasting_model.load_model(str(forecasting_path))
        
        # Get model info
        n_features = len(forecasting_model.get_booster().feature_names)
        n_trees = forecasting_model.n_estimators
        print(f"  ✅ Forecasting model loaded")
        print(f"     - Features: {n_features}")
        print(f"     - Trees: {n_trees}")
        print(f"     - Feature names: {forecasting_model.get_booster().feature_names[:5]}...")
        
        # Load quantile models
        print()
        print("Loading quantile models...")
        quantile_models = {}
        for tag in ['q10', 'q50', 'q90']:
            qpath = model_dir / f"quantile_model_{tag}.json"
            qm = XGBRegressor()
            qm.load_model(str(qpath))
            quantile_models[tag] = qm
            print(f"  ✅ Quantile model {tag} loaded")
        
        # Load metrics
        print()
        print("Loading metrics...")
        import json
        metrics_path = model_dir / "metrics.json"
        with open(metrics_path) as f:
            metrics = json.load(f)
        
        print(f"  ✅ Metrics loaded")
        print(f"     - Model type: {metrics['model_type']}")
        print(f"     - Training stations: {metrics['n_stations']}")
        print(f"     - Training rows: {metrics['n_train_rows']}")
        print(f"     - Date range: {metrics['data_range']}")
        print(f"     - MAE (t+1): {metrics['metrics']['mae_t1']:.2f} AQI")
        print(f"     - RMSE (t+1): {metrics['metrics']['rmse_t1']:.2f} AQI")
        print(f"     - Quantile coverage: {metrics['metrics']['quantile_coverage']:.1f}%")
        
        # Test a prediction
        print()
        print("Testing prediction...")
        import numpy as np
        
        # Create dummy feature row (28 features as per training)
        test_row = np.array([
            3,      # day_of_week
            0,      # is_weekend
            10,     # month
            -0.5,   # doy_sin
            0.8,    # doy_cos
            150.0,  # aqi_lag_1
            148.0,  # aqi_lag_2
            152.0,  # aqi_lag_3
            145.0,  # aqi_lag_7
            149.0,  # aqi_rolling_mean_7
            3.2,    # aqi_rolling_std_7
            0.55,   # pm_ratio
            45.0,   # NO2
            55.0,   # NOx
            1.5,    # CO
            12.0,   # SO2
            3.0,    # Benzene
            8.0,    # Toluene
            0.85,   # traffic_index_synthetic
            0.30,   # industrial_index_synthetic
            0.65,   # dust_construction_index_synthetic
            1,      # is_traffic_corridor
            0,      # is_industrial_belt
            0,      # is_residential
            28.0,   # temp_c
            55,     # humidity_pct
            10.0,   # wind_speed_kmh
        ]).reshape(1, -1)
        
        pred = forecasting_model.predict(test_row)[0]
        q10_pred = quantile_models['q10'].predict(test_row)[0]
        q90_pred = quantile_models['q90'].predict(test_row)[0]
        
        print(f"  ✅ Prediction successful!")
        print(f"     - Input AQI: 150.0")
        print(f"     - Predicted AQI: {pred:.1f}")
        print(f"     - Confidence band: [{q10_pred:.1f}, {q90_pred:.1f}]")
        
        # Verify feature count matches
        expected_features = 27
        if n_features != expected_features:
            print()
            print(f"  ⚠️  WARNING: Expected {expected_features} features, got {n_features}")
            print(f"     This may cause issues in production!")
        
        print()
        print("=" * 70)
        print("✅ ALL CHECKS PASSED - Models are ready for production!")
        print("=" * 70)
        print()
        print("Next steps:")
        print("  1. Start Redis: redis-server")
        print("  2. Start backend: uvicorn main:app --reload")
        print("  3. Test endpoint: curl http://localhost:8000/forecast/health")
        print()
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print()
        print("Missing dependencies. Install with:")
        print("  pip install xgboost scikit-learn numpy")
        return False
        
    except Exception as e:
        print(f"❌ Error loading models: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = verify_models()
    sys.exit(0 if success else 1)
