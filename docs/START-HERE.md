# Black Pearl - Integration Guide
**Everything you need in one page**

---

## ✅ Current Status
- **ML Models:** Ready (New Model dir, 37 stations, validated)
- **Backend:** 80% done (loads models, endpoints work)
- **Frontend:** Not connected (shows static data)

---

## 🚀 3 Steps to Get Started

### 1. Verify (1 min)
```bash
cd Backend
python verify_model_loading.py
```
Should say: ✅ ALL CHECKS PASSED

### 2. Start Servers (2 min)
```bash
# Terminal 1 - Backend
cd Backend
pip install -r requirements.txt
uvicorn main:app --reload

# Terminal 2 - Frontend  
cd Frontend
npm install && npm run dev
```

### 3. Test (1 min)
Open: http://localhost:8000/forecast/Delhi?days=3  
Should return JSON with predictions

---

## 🔧 What to Fix (Priority Order)

### Fix #1: Forecast Card (4 hours)
**File:** `Frontend/src/main.js`
```javascript
import { getForecast } from './api/forecast.js';

async function updateForecast() {
  const data = await getForecast('Delhi', 3);
  document.querySelector('.forecast-list').innerHTML = 
    data.points.map(p => `
      <div class="forecast-row">
        <span>${Math.round(p.upper)}/${Math.round(p.lower)}</span>
        <span>${p.date}</span>
      </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', updateForecast);
```

### Fix #2: Attribution Chart (6 hours)
**Add to:** `public/partials/view-dashboard.html`
```html
<div class="bento-card">
  <canvas id="attr-chart"></canvas>
  <div>Traffic: <b id="traffic-pct">--</b></div>
  <div>Industrial: <b id="industrial-pct">--</b></div>
</div>
```
**Add to:** `src/main.js`
```javascript
import { getAttribution } from './api/forecast.js';

async function showAttribution() {
  const data = await getAttribution('Delhi');
  document.getElementById('traffic-pct').textContent = data.traffic_pct + '%';
  document.getElementById('industrial-pct').textContent = data.industrial_pct + '%';
}
```

### Fix #3: Scenario Simulator (6 hours)
**Change in scenario code:**
```javascript
// OLD
fetch('/scenario/simulate', ...)

// NEW
import { runMLScenario } from './api/forecast.js';
const result = await runMLScenario('Delhi', {
  baseline_aqi: 187,
  traffic_reduction_pct: 30,
  industrial_curtailment_pct: 20,
  construction_halt_pct: 50
});
```

---

## 📅 Timeline

**Week 1:** Fix #1, #2, #3 (16 hours)  
**Week 2:** Map heatmap, stations (24 hours)  
**Week 3:** Analytics, testing (26 hours)

**Total: 66 hours (3 weeks)**

---

## 🧪 Quick Tests

```bash
# Backend tests
curl http://localhost:8000/forecast/Delhi?days=3
curl http://localhost:8000/forecast/Delhi/attribution
curl http://localhost:8000/forecast/model/metrics

# Frontend test
Open browser → Check console → Should see API calls
```

---

## 🆘 Troubleshooting

**Models not loading?**
```bash
ls "ML Model/New Model/"
# Should see: forecasting_model.json, quantile_*.json
```

**CORS error?**
Add to `Backend/main.py`:
```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"])
```

**API 500 error?**
Check backend terminal for Python traceback

---

## 📁 Key Files

```
Backend/
  app/services/ml_service.py     # ML logic (✅ ready)
  app/routes/forecast.py         # API endpoints (✅ ready)
  verify_model_loading.py        # Test script (run this first)

Frontend/
  src/api/forecast.js            # API client (✅ ready)
  src/main.js                    # ADD CONNECTIONS HERE
  public/partials/view-dashboard.html  # ADD CARDS HERE

ML Model/
  New Model/                     # Models (✅ all present)
```

---

## ✨ That's It!

Start with Fix #1 today. Takes 4 hours. You'll see real forecasts on screen.

**Need more details?** Other docs have full analysis but start here first.
