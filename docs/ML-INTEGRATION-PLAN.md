# ML Model Integration Plan
**Black Pearl - Frontend ↔ Backend ↔ ML Model Integration**

---

## 🎯 Goal

Connect the trained ML models with the backend API and frontend UI so users can see:
- Real-time AQI forecasts (3-day predictions)
- Source attribution (traffic vs industrial vs weather)
- Scenario simulation (what-if interventions)
- City-wide pollution heatmap

---

## 📋 Current State

| Component | Status | Issue |
|-----------|--------|-------|
| **ML Models** | ✅ Ready | New Model trained on 37 stations, all files present |
| **Backend API** | ✅ 80% Done | Endpoints exist, correctly load models |
| **Frontend UI** | ❌ Not Connected | Shows static data, doesn't call ML endpoints |

**Main Problem:** Frontend and backend aren't talking to each other for ML features.

---

## 🗺️ Integration Architecture

```
┌─────────────────┐
│  ML Models      │
│  (New Model/)   │
│  - forecast.json│
│  - quantile*.json│
│  - metrics.json │
└────────┬────────┘
         │ loads at startup
         ↓
┌─────────────────┐
│  Backend API    │
│  (FastAPI)      │
│  Port: 8000     │
└────────┬────────┘
         │ HTTP/JSON
         ↓
┌─────────────────┐
│  Frontend UI    │
│  (Vite/Vanilla) │
│  Port: 5173     │
└─────────────────┘
```

---

## 📅 Implementation Plan (3 Weeks)

### Week 1: Core Features (Critical)
**Goal:** Get ML predictions showing in the UI

#### Day 1-2: Forecast Card
**Backend:** ✅ Already done (`/forecast/{city}`)
**Frontend:** ❌ Needs work

**Tasks:**
1. Open `Frontend/src/main.js`
2. Import forecast API: `import { getForecast } from './api/forecast.js'`
3. Add function to fetch and display:
```javascript
async function loadForecastCard(city = 'Delhi') {
  const data = await getForecast(city, 3);
  const listEl = document.querySelector('.forecast-list');
  listEl.innerHTML = data.points.map(point => `
    <div class="forecast-row">
      <div class="forecast-row__aqi">
        <span class="forecast-aqi-high">${Math.round(point.upper)}</span>
        <span class="forecast-aqi-low">/${Math.round(point.lower)}</span>
      </div>
      <div class="forecast-row__date">${point.date}</div>
    </div>
  `).join('');
}
```
4. Call `loadForecastCard()` on page load
5. Test in browser

**Time:** 4 hours

#### Day 3: Attribution Visualization
**Backend:** ✅ Already done (`/forecast/{city}/attribution`)
**Frontend:** ❌ Need to add new card

**Tasks:**
1. Add attribution card HTML to `public/partials/view-dashboard.html`:
```html
<div class="bento-card highlight-card">
  <span class="highlight-card__title">Pollution Sources</span>
  <canvas id="attribution-chart" width="150" height="150"></canvas>
  <div class="attribution-legend">
    <div><span class="dot red"></span> Traffic: <b id="traffic-pct">--</b></div>
    <div><span class="dot orange"></span> Industrial: <b id="industrial-pct">--</b></div>
    <div><span class="dot purple"></span> Dust: <b id="dust-pct">--</b></div>
  </div>
</div>
```
2. Create `src/components/attribution.js`:
```javascript
import { getAttribution } from '../api/forecast.js';

export async function loadAttribution(city, stationType) {
  const data = await getAttribution(city, stationType);
  
  document.getElementById('traffic-pct').textContent = data.traffic_pct + '%';
  document.getElementById('industrial-pct').textContent = data.industrial_pct + '%';
  document.getElementById('dust-pct').textContent = data.combustion_dust_pct + '%';
  
  // Draw donut chart
  drawDonutChart('attribution-chart', [
    { value: data.traffic_pct, color: '#EF4444' },
    { value: data.industrial_pct, color: '#F59E0B' },
    { value: data.combustion_dust_pct, color: '#8B5CF6' }
  ]);
}
```
3. Call on page load

**Time:** 6 hours

#### Day 4-5: Scenario Simulator
**Backend:** ✅ Already done (`/forecast/{city}/ml-scenario`)
**Frontend:** ❌ Using wrong endpoint

**Tasks:**
1. Find scenario page code (likely in `src/views/` or inline in HTML)
2. Change API call from:
```javascript
// OLD - linear model
const result = await fetch('/scenario/simulate', {...});
```
To:
```javascript
// NEW - ML model
import { runMLScenario } from './api/forecast.js';
const result = await runMLScenario('Delhi', {
  baseline_aqi: 187,
  traffic_reduction_pct: sliderValues.traffic,
  industrial_curtailment_pct: sliderValues.industrial,
  construction_halt_pct: sliderValues.construction,
  station_type: 'traffic_corridor'
});
```
3. Update result display
4. Test slider interactions

**Time:** 6 hours

**Week 1 Total:** 16 hours

---

### Week 2: Advanced Features

#### Day 6-7: Per-Station Forecasts
**Backend:** ❌ Need to add endpoint

**Tasks (Backend):**
1. Create `/forecast/{city}/stations` endpoint in `Backend/app/routes/forecast.py`:
```python
@router.get("/{city}/stations")
async def get_station_forecasts(city: str):
    city_data = await fetch_city_aqi(city)
    forecasts = []
    for station in city_data.stations:
        station_type = classify_station(station.station_name)
        pred = forecast_n_days(
            current_aqi=station.aqi,
            trailing_aqi=[station.aqi] * 8,
            station_type=station_type,
            n=3
        )
        forecasts.append({
            'station_name': station.station_name,
            'station_type': station_type,
            'forecast': pred
        })
    return forecasts
```
2. Test endpoint

**Tasks (Frontend):**
3. Add station selector dropdown to dashboard
4. Fetch per-station data
5. Update forecast card based on selection

**Time:** 8 hours

#### Day 8-9: Map Interpolation Heatmap
**Backend:** ✅ Already done (`/forecast/{city}/interpolate`)
**Frontend:** ❌ Not rendered

**Tasks:**
1. Open map component code
2. Add interpolation layer:
```javascript
import { getInterpolation } from '../api/forecast.js';

async function addHeatmapLayer(map, city) {
  const data = await getInterpolation(city, 40);
  
  // Convert to heatmap format
  const heatmapData = data.grid_points.map(p => ({
    lat: p.lat,
    lon: p.lon,
    value: p.predicted_aqi
  }));
  
  // Add to MapTiler (or your map library)
  map.addLayer({
    id: 'aqi-heatmap',
    type: 'heatmap',
    data: heatmapData
  });
}
```
3. Add toggle button: "Show Heatmap"
4. Test on map view

**Time:** 10 hours

#### Day 10: Drift Detection UI
**Backend:** ✅ Already done (`/drift/{city}/status`)
**Frontend:** ❌ Not displayed

**Tasks:**
1. Create new section in analytics view
2. Call `/drift/{city}/status`
3. Show list of anomalies:
```javascript
async function showDriftAlerts(city) {
  const data = await fetch(`/drift/${city}/status`).then(r => r.json());
  
  const alertsList = document.getElementById('drift-alerts');
  alertsList.innerHTML = data.events
    .filter(e => e.is_anomaly)
    .map(e => `
      <div class="alert-card">
        <h4>${e.station_name}</h4>
        <p>Forecast: ${e.forecast_value} | Actual: ${e.observed_value}</p>
        <p>Divergence: ${e.divergence_pct}%</p>
        <p>${e.likely_cause}</p>
      </div>
    `).join('');
}
```

**Time:** 6 hours

**Week 2 Total:** 24 hours

---

### Week 3: Polish & Testing

#### Day 11-12: Analytics Dashboard
**Tasks:**
1. Create new view: `public/partials/view-analytics.html`
2. Add 4 sections:
   - Model Performance (from `/forecast/model/metrics`)
   - Historical Validation (2020 lockdown chart)
   - Attribution Analysis (SHAP images - need backend endpoint)
   - Drift Monitoring (from drift service)
3. Style with existing CSS classes
4. Add to router

**Time:** 12 hours

#### Day 13: Backend Image Serving
**Tasks:**
1. Add endpoint to serve SHAP images:
```python
from fastapi.responses import FileResponse

@router.get("/shap-images/{image_type}")
async def get_shap_image(image_type: str):
    valid_types = ['all', 'traffic_corridor', 'industrial_belt', 'residential_background', 'pred_vs_actual']
    if image_type not in valid_types:
        raise HTTPException(400, "Invalid image type")
    
    filename = f"shap_summary_{image_type}.png" if image_type != 'all' else "shap_summary.png"
    if image_type == 'pred_vs_actual':
        filename = "pred_vs_actual.png"
    
    filepath = _MODEL_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, "Image not found")
    
    return FileResponse(filepath, media_type="image/png")
```
2. Test with: `http://localhost:8000/forecast/shap-images/all`

**Time:** 2 hours

#### Day 14-15: Testing & Bug Fixes
**Tasks:**
1. Test all forecast endpoints
2. Test all frontend interactions
3. Fix any bugs found
4. Cross-browser testing
5. Mobile responsive check

**Time:** 12 hours

**Week 3 Total:** 26 hours

---

## 🧪 Testing Checklist

### Backend Tests
```bash
# Test model loading
python Backend/verify_model_loading.py

# Test forecast endpoint
curl "http://localhost:8000/forecast/Delhi?days=3"

# Test attribution
curl "http://localhost:8000/forecast/Delhi/attribution"

# Test scenario
curl -X POST "http://localhost:8000/forecast/Delhi/ml-scenario" \
  -H "Content-Type: application/json" \
  -d '{"baseline_aqi": 187, "traffic_reduction_pct": 30, "industrial_curtailment_pct": 20, "construction_halt_pct": 50, "station_type": "traffic_corridor"}'

# Test interpolation
curl "http://localhost:8000/forecast/Delhi/interpolate?resolution=40"

# Test metrics
curl "http://localhost:8000/forecast/model/metrics"
```

### Frontend Tests
1. Load dashboard → Forecast card shows real data ✅
2. Attribution chart appears with percentages ✅
3. Change city → All data updates ✅
4. Open scenario page → Sliders work, results update ✅
5. View map → Heatmap renders ✅
6. Open analytics → Charts and metrics display ✅

### Integration Tests
1. Change slider → Call API → Result updates in <1 second ✅
2. Select station → Forecast updates ✅
3. Toggle heatmap → Layer appears/disappears ✅

---

## 📁 Files to Edit

### Backend (Minimal changes needed)
- `Backend/app/routes/forecast.py` - Add `/stations` endpoint
- `Backend/app/routes/forecast.py` - Add `/shap-images` endpoint

### Frontend (Most work here)
- `Frontend/src/main.js` - Add forecast loading
- `Frontend/src/components/attribution.js` - NEW FILE
- `Frontend/src/views/scenario.js` - Change API call
- `Frontend/src/views/map.js` - Add interpolation
- `Frontend/public/partials/view-dashboard.html` - Add attribution card
- `Frontend/public/partials/view-analytics.html` - NEW FILE

---

## 🚀 Quick Start (Day 1)

### Step 1: Verify Everything Works
```bash
# Backend
cd Backend
python verify_model_loading.py
# Should show: ✅ ALL CHECKS PASSED

uvicorn main:app --reload
# Should show: ✓ Loaded forecasting model

# Frontend (new terminal)
cd Frontend
npm install
npm run dev
# Should open: http://localhost:5173
```

### Step 2: Make First Connection (Forecast Card)
```bash
# Edit Frontend/src/main.js
# Add at the top:
import { getForecast } from './api/forecast.js';

# Add function:
async function updateForecastCard() {
  const data = await getForecast('Delhi', 3);
  console.log('Forecast data:', data);  // Check in browser console
  
  // Update DOM (find the .forecast-list element)
  const listEl = document.querySelector('.forecast-list');
  if (listEl) {
    listEl.innerHTML = data.points.map(point => `
      <div class="forecast-row">
        <div class="forecast-row__aqi">
          <span class="forecast-aqi-high">${Math.round(point.upper)}</span>
          <span class="forecast-aqi-low">/${Math.round(point.lower)}</span>
        </div>
        <div class="forecast-row__date">${point.date}</div>
        <div class="forecast-row__day">${new Date(point.date).toLocaleDateString('en-US', {weekday: 'long'})}</div>
      </div>
    `).join('');
  }
}

# Call on page load:
document.addEventListener('DOMContentLoaded', () => {
  updateForecastCard();
});
```

### Step 3: Test
1. Save file
2. Refresh browser (Ctrl+Shift+R)
3. Check browser console for "Forecast data:"
4. Forecast card should show real numbers

**If it works → You're on track! Continue with Day 2.**

---

## 💡 Tips

### Debugging
- Open browser DevTools (F12)
- Check Console tab for errors
- Check Network tab to see API calls
- Look for red errors in backend terminal

### Common Issues
**CORS errors?** Backend needs CORS middleware:
```python
# In Backend/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Models not loading?** Check path:
```bash
ls "ML Model/New Model/"
# Should see .json files
```

**API returning 500?** Check backend logs for Python errors

---

## 📊 Progress Tracker

### Week 1
- [ ] Day 1-2: Forecast Card Connected
- [ ] Day 3: Attribution Chart Added
- [ ] Day 4-5: Scenario Using ML Model

### Week 2
- [ ] Day 6-7: Per-Station Forecasts
- [ ] Day 8-9: Heatmap Rendering
- [ ] Day 10: Drift Detection UI

### Week 3
- [ ] Day 11-12: Analytics Dashboard
- [ ] Day 13: SHAP Image Serving
- [ ] Day 14-15: Testing & Fixes

---

## ✅ Success Criteria

**Minimum Viable:**
- Forecast card shows real ML predictions ✅
- Attribution chart visible with correct percentages ✅
- Scenario simulator uses ML model ✅

**Full Integration:**
- All above + map heatmap + station selection ✅

**Production Ready:**
- All above + analytics + testing + documentation ✅

---

## 📞 Next Steps

1. **Today:** Run verification script, start backend, test endpoints
2. **Tomorrow:** Connect forecast card (4 hours)
3. **This Week:** Complete Week 1 tasks (16 hours)
4. **Follow-up:** Weekly review, adjust plan as needed

---

**Total Time:** ~66 hours (3 weeks @ 22 hours/week)  
**Team:** 1 Full-stack developer OR 1 Backend + 1 Frontend

**Questions?** Check `docs/QUICK-START.md` or detailed docs.

**Ready to start?** → Run `python Backend/verify_model_loading.py` now! 🚀
