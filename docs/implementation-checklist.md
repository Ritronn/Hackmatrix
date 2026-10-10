# Implementation Checklist
**Black Pearl Integration - Quick Action Items**

## ⚡ IMPORTANT: Using the New Model

**✅ Backend is already configured to use the New Model directory:**
```python
_MODEL_DIR = _BACKEND_DIR.parent / "ML Model" / "New Model"
```

**🎯 New Model Advantages:**
- 37 stations (vs 2 in old model)
- 21,662 training rows (vs 900)
- 75% quantile coverage (vs 56%)
- 17.6 LOO MAE for interpolation (vs 40.6)
- Validated with 2020 lockdown data

**Before starting integration, verify models load:**
```bash
cd Backend
python verify_model_loading.py
```
Should output: ✅ ALL CHECKS PASSED

---

---

## Phase 1: Critical (Week 1) ⚡ — COMPLETE ✅

### Backend Tasks
- [x] **Add per-station forecast endpoint** (`/forecast/{city}/stations`)
  - Location: `Backend/app/routes/forecast.py`
  - Returns list of forecasts for each monitoring station with station_type classification
- [x] **Add SHAP image serving endpoint** (`/forecast/shap-images/{type}`)
  - Serves PNG files: all, traffic_corridor, industrial_belt, residential_background, pred_vs_actual
- [x] **Add Redis caching to forecast endpoint**
  - Stores forecasts in `forecast:{city}:{station_type}:{days}` and `forecast:{city}:latest` for drift detection
- [x] **Fix scenario lever mismatch**
  - Hybrid implementation: ML model runs alongside linear model, with dedicated ML output card

### Frontend Tasks  
- [x] **Connect forecast card to live API**
  - Dynamic forecast rows generated from `/forecast/{city}` with upper/lower confidence bands
- [x] **Add attribution card to dashboard**
  - Donut chart with traffic/industrial/dust/weather breakdown from `/forecast/{city}/attribution`
- [x] **Switch scenario simulator to ML endpoint**
  - Integrated `runMLScenario` in `Frontend/src/views/scenario.js` calling `/forecast/{city}/ml-scenario`
- [x] **Add station selector & classification**
  - Per-station forecasts and classifications mapped in map inspector & telemetry

---

## Phase 2: Important (Week 2) 🔥 — COMPLETE ✅

### Backend Tasks
- [x] **Implement interpolation caching**
  - Caches GP interpolation in Redis (`interpolation:{city}:{resolution}`, TTL 15m)
- [x] **Add lockdown validation endpoint** (`/forecast/validation/lockdown`)
  - Returns 2020 lockdown actual (-38.1%) vs predicted (-29.4%) comparison
- [ ] **Set up Kafka consumer service**
  - Ingestion pipeline service setup

### Frontend Tasks
- [x] **Integrate interpolation heatmap**
  - Added "GP Continuous Field" toggle layer in Map view rendering continuous spatial plumes
- [x] **Add per-station forecast markers & inspector**
  - Clicking station markers loads localized SHAP attribution, 3-day forecast strip, and station type classification
- [x] **Build empirical validation panel**
  - 2020 COVID-19 lockdown case study panel with empirical fidelity verification

---

## Phase 3: Polish (Week 3) ✨ — COMPLETE ✅

### Backend Tasks
- [x] **Add model metrics endpoint** (`/forecast/model/metrics`)
  - Serves complete metrics from `metrics.json`
- [x] **Feature order & alignment verification**
  - Verified 27 features matching `forecasting_model.json` booster

### Frontend Tasks
- [x] **Model Accuracy & Self-Honesty Tracker view** (`view-accuracy`)
  - Section 1: Live performance metrics (MAE, RMSE, Quantile Coverage 75%, LOO MAE 17.6)
  - Section 2: 2020 Lockdown Natural Experiment case study
  - Section 3: Multi-horizon degradation table & category accuracy breakdown
  - Section 4: Interactive SHAP explainability gallery with tabs for all 5 training visualizations
  - Section 5: End-to-End Digital Twin Architecture pipeline

### Backend Tasks
- [ ] **Add model metrics historical tracking**
  - Store rolling MAE/RMSE calculations
  - Endpoint: `/forecast/metrics/history`
  - Shows accuracy trends over time

- [ ] **Add batch forecast endpoint**
  - `/forecast/{city}/batch` for multiple stations at once
  - More efficient than calling `/stations` and computing individually

- [ ] **Add forecast explanation endpoint**
  - Return top 5 features contributing to a specific forecast
  - Per-prediction SHAP values

### Frontend Tasks
- [ ] **Create analytics/accuracy view** (new page)
  - Section 1: Model Performance Metrics
    - Display metrics.json data
    - Show MAE/RMSE by horizon
    - Baseline comparisons
  
  - Section 2: Historical Validation
    - 2020 lockdown case study
    - Predicted vs actual charts
    - Scenario simulator calibration proof
  
  - Section 3: Attribution Analysis
    - Display SHAP summary images
    - Feature importance rankings
    - Station type comparisons
  
  - Section 4: Drift Monitoring
    - Forecast vs actual residuals
    - Anomaly alert log
    - Divergence trends

- [ ] **Add confidence visualization**
  - Area chart showing q10-q50-q90 bands
  - Confidence percentage decay over horizons
  - Update "Model Confidence Band" card

- [ ] **Add trust overlay to map**
  - Second layer showing GP confidence/variance
  - High opacity = high confidence (near stations)
  - Low opacity = low confidence (far from stations)

---

## Testing Checklist ✅

### API Tests
- [ ] Test forecast endpoint with various cities
- [ ] Test station classification matches training
- [ ] Test quantile ordering (q10 ≤ q50 ≤ q90)
- [ ] Test scenario sim with extreme inputs (0%, 100%)
- [ ] Test interpolation grid has valid coordinates
- [ ] Test attribution percentages sum to reasonable total

### Frontend Tests
- [ ] Test forecast card updates when city changes
- [ ] Test attribution chart renders correctly
- [ ] Test scenario sliders trigger API calls
- [ ] Test map loads stations and forecasts
- [ ] Test interpolation layer renders without errors

### Integration Tests
- [ ] Test full flow: Load page → Fetch AQI → Forecast → Display
- [ ] Test scenario: Adjust sliders → Call ML model → Update results
- [ ] Test drift: Mock forecast + observed → Check anomalies
- [ ] Test caching: Repeat requests → Verify Redis hits

---

## Documentation Checklist 📝

- [ ] **Update README.md**
  - Add ML model section
  - Explain training data (Delhi 2015-2020)
  - Document validation approach
  - Add limitations section

- [ ] **API Documentation**
  - Generate OpenAPI/Swagger spec
  - Add examples for each endpoint
  - Document error codes

- [ ] **Frontend Documentation**
  - Component integration guide
  - API client usage
  - Data flow diagrams

- [ ] **User Guide**
  - How to interpret forecasts
  - How to use scenario simulator
  - Understanding attribution
  - FAQ section

---

## Deployment Checklist 🚀

### Prerequisites
- [ ] Redis running and accessible
- [ ] Kafka broker configured (or mock producer)
- [ ] Environment variables set (`.env` files)
- [ ] ML models in correct directory (`ML Model/New Model/`)

### Backend Deployment
- [ ] Install Python dependencies (`requirements.txt`)
- [ ] Run database migrations (if any)
- [ ] Start FastAPI server (`uvicorn main:app`)
- [ ] Start Kafka consumer (Docker or systemd service)
- [ ] Verify `/forecast/health` returns `ml_models_loaded: true`

### Frontend Deployment
- [ ] Install npm dependencies
- [ ] Update API base URL in `config.js`
- [ ] Build production bundle (`npm run build`)
- [ ] Deploy to hosting (Vercel, Netlify, etc.)
- [ ] Verify all API calls work cross-origin (CORS)

### Monitoring
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Set up performance monitoring (New Relic, etc.)
- [ ] Create dashboard for API latency
- [ ] Set up alerts for high error rates
- [ ] Monitor Redis memory usage
- [ ] Monitor ML model inference time

---

## Known Issues & Workarounds ⚠️

### Issue 1: Scenario Simulator Lever Mismatch
**Problem:** Frontend has 6 levers but ML model only supports 3 (traffic, industrial, construction)

**Workaround Options:**
- **A) Hybrid:** Use ML for 3 levers, linear model for other 3, combine results
- **B) Remove levers:** Only show 3 ML-backed levers
- **C) Expand ML:** Re-train model with all 6 features (future work)

**Recommended:** Option A for demo

### Issue 2: Station-Level Data Incomplete
**Problem:** ML trained on per-station data but live API returns city aggregate

**Workaround:** 
- Fetch all stations from WAQI separately
- Map station names to training classifications
- Generate per-station forecasts
- Cache results to reduce API calls

### Issue 3: Drift Detection Requires Live Data
**Problem:** Kafka consumer needs external stream (not yet configured)

**Workaround:**
- Use mock producer to simulate incoming data
- Run: `python Backend/ingestion/producer.py` in background
- Generates synthetic observed values
- Allows drift detection to work for demo

### Issue 4: SHAP Computation Slow
**Problem:** Computing SHAP values on every request is expensive (~500ms)

**Workaround:**
- Pre-compute SHAP for typical station types
- Cache in memory or Redis
- Return cached values unless explicitly requested fresh

---

## Quick Reference

### Important File Locations
```
Backend/
  app/services/ml_service.py        # Core ML inference logic
  app/routes/forecast.py            # Forecast API endpoints
  app/services/drift_service.py     # Drift detection logic
  app/core/redis_client.py          # Redis connection
  ingestion/consumer.py             # Kafka consumer

Frontend/
  src/api/forecast.js               # Forecast API client
  src/api/scenario.js               # Scenario API client
  public/partials/view-dashboard.html
  public/partials/view-scenario.html
  public/partials/view-map.html

ML Model/
  New Model/                        # Trained model artifacts
    forecasting_model.json
    quantile_model_q10.json
    quantile_model_q50.json
    quantile_model_q90.json
    metrics.json
  Ml model/                         # SHAP images
    shap_summary*.png
  pipeline.py                       # Training script
```

### Key Endpoints
```
GET  /forecast/{city}                    # 3-day forecast
GET  /forecast/{city}/stations           # Per-station forecasts
GET  /forecast/{city}/attribution        # Source breakdown
POST /forecast/{city}/ml-scenario        # ML-powered simulation
GET  /forecast/{city}/interpolate        # GP heatmap
GET  /forecast/model/metrics             # Training metrics
GET  /drift/{city}/status                # Drift alerts
```

### Environment Variables
```bash
# Backend/.env
REDIS_URL=redis://localhost:6379
WAQI_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here

# Frontend/.env
VITE_API_BASE_URL=http://localhost:8000
VITE_MAPTILER_KEY=your_key_here
```

---

## Success Criteria ✨

### Minimum Viable Demo
- ✅ Dashboard shows live AQI from city
- ✅ Forecast card shows 3-day prediction with confidence bands
- ✅ Attribution card shows source breakdown
- ✅ Scenario simulator uses ML model and shows realistic results
- ✅ Map shows station markers with basic info

### Full Feature Complete
- ✅ All of the above, plus:
- ✅ Per-station forecasts on map
- ✅ Interpolation heatmap layer
- ✅ Drift detection working
- ✅ Analytics page with model metrics
- ✅ SHAP images accessible
- ✅ Comprehensive documentation

### Production Ready
- ✅ All of the above, plus:
- ✅ Unit tests passing (>80% coverage)
- ✅ Integration tests passing
- ✅ Performance tests passing (<500ms p95 latency)
- ✅ Error monitoring configured
- ✅ Deployment automation
- ✅ User documentation complete

---

**Last Updated:** October 9, 2026  
**Status:** Ready for implementation
