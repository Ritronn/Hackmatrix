# Black Pearl - ML Integration Quick Start
**5-Minute Setup Guide**

## ✅ Current Status

**Backend:** Already uses New Model ✅  
**Models:** All files present ✅  
**Frontend:** Needs connection ⚠️

---

## 🚀 Quick Setup

### 1. Verify Models (2 min)
```bash
cd Backend
python verify_model_loading.py
```
Should show: ✅ ALL CHECKS PASSED

### 2. Start Backend (1 min)
```bash
pip install -r requirements.txt
redis-server &
uvicorn main:app --reload
```
Test: http://localhost:8000/forecast/health

### 3. Start Frontend (1 min)
```bash
cd Frontend
npm install
npm run dev
```
Open: http://localhost:5173

---

## 🔧 What Needs Fixing

### Priority 1: Connect Forecast Card
**File:** `Frontend/public/partials/view-dashboard.html`

**Problem:** Static HTML  
**Fix:** Call `/forecast/{city}` API

```javascript
// Add to main.js
import { getForecast } from './api/forecast.js';

async function updateForecast() {
  const data = await getForecast('Delhi', 3);
  // Update DOM with data.points
}
```

### Priority 2: Add Attribution Chart
**File:** Same HTML, add new card

**Problem:** Not visible  
**Fix:** Call `/forecast/{city}/attribution`

```javascript
import { getAttribution } from './api/forecast.js';

async function showAttribution() {
  const data = await getAttribution('Delhi');
  // Draw donut: traffic_pct, industrial_pct, dust_pct
}
```

### Priority 3: Fix Scenario Simulator
**File:** `Frontend/src/components/scenario.js` (or similar)

**Problem:** Uses `/scenario/simulate` (linear)  
**Fix:** Use `/forecast/{city}/ml-scenario` (ML)

```javascript
import { runMLScenario } from './api/forecast.js';

async function runScenario() {
  const result = await runMLScenario('Delhi', {
    baseline_aqi: 187,
    traffic_reduction_pct: 30,
    industrial_curtailment_pct: 20,
    construction_halt_pct: 50,
    station_type: 'traffic_corridor'
  });
  // Show result.scenario_predicted_aqi
}
```

---

## 📊 New Model Highlights

- **37 stations** (was 2)
- **21,662 training rows** (was 900)
- **75% quantile coverage** (was 56%)
- **Validated with 2020 lockdown**

---

## 🧪 Quick Tests

```bash
# Test forecast
curl "http://localhost:8000/forecast/Delhi?days=3"

# Test attribution
curl "http://localhost:8000/forecast/Delhi/attribution"

# Test scenario
curl -X POST "http://localhost:8000/forecast/Delhi/ml-scenario" \
  -H "Content-Type: application/json" \
  -d '{"baseline_aqi": 187, "traffic_reduction_pct": 30}'

# Test interpolation
curl "http://localhost:8000/forecast/Delhi/interpolate?resolution=40"
```

---

## 📋 3-Week Plan

**Week 1:** Connect 3 priority items above  
**Week 2:** Add map interpolation, drift detection  
**Week 3:** Analytics page, testing, docs

---

## 🆘 Troubleshooting

**Models won't load?**
```bash
# Check path
ls "ML Model/New Model/"
# Should see: forecasting_model.json, quantile_*.json, metrics.json
```

**API not working?**
```bash
# Check backend logs
# Look for: "✓ Loaded forecasting model"
```

**Frontend not updating?**
```bash
# Clear cache
npm run build
# Hard refresh browser (Ctrl+Shift+R)
```

---

## 📖 Full Docs

See detailed docs for complete info:
- `integration-analysis-and-plan.md` - Full analysis
- `implementation-checklist.md` - Detailed tasks
- `NEW-MODEL-INTEGRATION-STATUS.md` - Model details

---

**Ready to code? Start with Priority 1!** 🎯
