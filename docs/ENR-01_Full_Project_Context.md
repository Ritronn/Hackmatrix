# Urban Environmental Digital Twin — Full Project Context
### HackMatrix 5.0 | Track: Energy | Problem Statement: ENR-01

---

## 1. Problem Statement (Recap)

City-level air-quality tracking usually shows *where* pollution is high without explaining *which interventions would actually help*. We're building a map-based system that connects air-quality readings with weather and activity data to **predict pollution levels, attribute them to likely sources, and let users compare possible interventions** — going beyond a simple monitoring dashboard into a decision-support tool.

---

## 2. What The Solution Actually Does (Plain English)

It's a smarter version of an air quality app. Instead of just saying *"AQI is 180, unhealthy,"* it:

1. **Predicts pollution levels** for the next 1–3 days across the whole city — not just at sensor locations, but interpolated into a full city-wide map.
2. **Shows confidence, not false certainty** — e.g. "somewhere between 160–200" with a clear confidence band, instead of one fake-precise number.
3. **Explains what's causing it** — breaks down how much is traffic, industrial activity, or weather trapping pollution in place.
4. **Lets you simulate interventions** — "what if traffic was restricted by 30% today?" and re-forecasts the outcome so options can be compared, not just observed.
5. **Answers questions in plain language** — a grounded chat layer (e.g. "should schools close tomorrow?") that responds using the model's actual forecast and confidence numbers, with the source cited.

**One-line pitch:** *Existing tools tell you the air is bad. We tell you why, what would happen if the city acted, and let you ask directly.*

---

## 3. How This Differs From Existing Solutions

| Existing systems (SAFAR / CPCB / commercial AQI apps) | Our system |
|---|---|
| Broadcasts a number + color-coded advisory | Provides a **decision-support tool** — compares intervention outcomes |
| Source attribution runs inside a closed, non-interactive physics model | **Interactive, explainable** attribution layer anyone can query |
| Station-based readings only, sparse coverage | **Interpolated city-wide heatmap** filling gaps between stations |
| No public "what-if" simulation | **Scenario simulator** — the core differentiator; nothing in the public AQI ecosystem offers this |
| No conversational access to the data | **LLM advisor** grounded in real forecast + uncertainty numbers |
| Forecasts shown without accuracy history | **Self-honesty tracker** — shows how accurate past predictions were |
| No visual dispersion modeling | **Wind-driven particle animation** — pollution visibly drifts across the city in real time |
| Static, single-point-in-time view | **Time-scrub slider** — scrub from 7 days ago through 3-day forecast with live-updating heatmap |
| No anomaly detection on forecast vs. actual | **Twin drift alerts** — flags divergence between predicted and actual state (true digital twin behavior) |

We are not trying to out-forecast government-grade physics models (e.g. WRF-Chem based systems) — we don't have that infrastructure. The differentiation is **usability and decision support**, not raw forecasting power.

---

## 4. Full Feature List

### Core features
- Multi-day AQI/pollutant forecasting (per city/station)
- Spatial interpolation → continuous city-wide pollution heatmap (not just sensor dots)
- Uncertainty-aware predictions (confidence bands, not single numbers)
- Source attribution (traffic vs. industrial vs. weather-driven dispersion)
- Interactive scenario simulator (test interventions, compare outcomes)
- Grounded LLM advisor (natural-language Q&A backed by real model outputs)

### Standout / differentiator features
- **Health-cost translation** — converts AQI forecasts into human-relevant impact (e.g. estimated ER visits, asthma flare-ups) and shows how it changes under a simulated intervention
- **Proactive threshold alerts** — predicts and warns before a pollution threshold is breached, rather than waiting for a user to check
- **Personalized risk guidance** — different advice for asthma patients, outdoor workers, schools, elderly residents
- **Self-honesty / accuracy tracker** — public record of past forecast accuracy vs. actuals
- **Explainable attribution** — feature-importance style breakdown showing *why* the model attributes pollution the way it does
- **Ward/neighborhood comparison view** — ranks areas by pollution and shows which intervention helps each most (useful for city administrators)

### Visual "wow" features
- **Wind-driven particle animation over the map** — thousands of tiny dots flow along the wind vector field so pollution visibly "drifts" across the city in real time, showing dispersion instead of describing it
  - Implementation: deck.gl or a canvas particle system on top of Leaflet/Mapbox; wind vectors come from the weather API (u/v components or speed+direction)
- **Time-scrub slider (past → forecast)** — one slider scrubs from 7 days ago through the 1–3 day forecast, with the heatmap and particles updating live; turns a static dashboard into something interactive
  - Implementation: precompute frames (hourly/daily) server-side, cache them, animate client-side with requestAnimationFrame
- **"Twin drift" alert** — when replayed "live" data diverges from the forecast beyond a threshold, flag it as an anomaly (e.g., a firecracker spike, stubble burning event); this is a genuinely on-theme feature for a digital twin PS, not just an AQI app
  - Implementation: simple residual threshold or CUSUM on forecast-vs-actual; surface as a banner/log on the dashboard

### Decision-support features
- **Intervention ROI leaderboard** — rank simulated interventions by "AQI reduction per unit cost/feasibility," not just raw AQI drop; turns the scenario simulator into an actual policy tool instead of a toy slider
  - Implementation: assign rough cost/feasibility weights to each intervention type (even hardcoded estimates, clearly labeled as illustrative), sort scenario outputs by reduction ÷ cost
- **"Mayor mode" — gamified policy sandbox** — give the user a fixed budget to allocate across interventions (traffic restriction, industry curbs, green cover) and show the resulting AQI/health-cost score, with a leaderboard of best allocations; makes the scenario engine interactive rather than a passive dashboard
  - Implementation: thin layer over the existing scenario/optimization engine; a small scoring function combining forecast AQI reduction + health-cost delta
- **Historical event replay / storytelling mode** — "Walk through Diwali 2019 in Delhi" — replay real historical data as a narrated timeline highlighting the spike, attribution, and recovery
  - Implementation: pick 1–2 known events in the Kaggle dataset, pre-script a short narrative overlay keyed to timestamps

### Trust & transparency features
- **Confidence/"trust" overlay on the map** — separate heat layer showing *where the model is confident vs guessing*; dense-station areas glow solid, sparse/interpolated areas look faded or hatched; makes uncertainty estimation visible spatially, not just as a number
  - Implementation: derive from interpolation variance (Gaussian Process gives this for free) or distance-to-nearest-station as a proxy
- **Auto-generated daily briefing** — a button that generates a short, human-readable "air quality report" (like a weather anchor script) citing the actual forecast, attribution, and confidence numbers; strong live-demo moment
  - Implementation: LLM advisor layer with a fixed prompt template instead of free-form Q&A; output as text or a simple PDF

### Reach & scale features
- **Multi-city toggle** — the Kaggle dataset covers 26 Indian cities; let the user switch cities and show the model/pipeline holds up across all of them, not just one hand-tuned city; cheap to add, strong signal of generalizability
- **Multilingual advisor** — the LLM advisor answers in Hindi/Marathi as well as English; genuinely useful for a civic tool in India, and distinctive since almost no hackathon team bothers
  - Implementation: just a language parameter in the LLM prompt; no extra infra needed
- **Public API / open data note** — document a clean REST API (from the existing serving layer) as "open for civic developers" in the README; signals platform ambition beyond a single app

---

## 5. Technical Architecture

**High-level flow:**

```
Historical Data → Simulated Live Feed → Redis Stream (queue)
        → Stream Consumer/Worker → Working Dataset
        → ML Pipeline (forecast + interpolation + attribution + uncertainty)
        → Scenario/Optimization Engine
        → API (FastAPI/Flask)
        → Frontend Dashboard + LLM Advisor Layer
```

**Stage-by-stage:**

1. **Data Ingestion (batch)** — Load and clean historical AQI/pollutant data + matching weather data.
2. **Simulated Live Layer** — A script replays historical/synthetic readings at a controlled pace to mimic a real sensor feed (clearly labeled as replayed data, not live).
3. **Redis Stream (queue)** — Decouples "data arriving" from "data being processed" — the honest architectural shape of a real monitoring system. This is the one piece of "heavier" infra that's actually justified by the problem, not decorative.
4. **Stream Consumer / Worker** — Subscribes to the Redis stream, cleans and joins incoming readings with weather data, writes to the working dataset, and triggers ML processing once enough new data has accumulated.
5. **ML Pipeline** — See Section 6 below.
6. **Scenario/Optimization Engine** — Re-runs the forecast under hypothetical interventions (e.g., reduced traffic/industrial activity) to compare outcomes. Also powers the Intervention ROI leaderboard and Mayor Mode scoring.
7. **Twin Drift Detection** — Compares real-time incoming data against the latest forecast; flags anomalies via residual threshold or CUSUM when divergence exceeds a configurable threshold.
8. **Serving Layer (API)** — Exposes endpoints for current AQI, forecasts, hotspot map data, scenario comparisons, ROI rankings, confidence overlays, daily briefings, and multi-city data. Both the frontend and the LLM advisor consume this — nothing touches the model directly. Documented as a public-facing REST API for civic developers.
9. **Frontend Dashboard** — Map view (hotspots + wind particle animation + confidence overlay), forecast charts with confidence bands, time-scrub slider, scenario comparison UI, Mayor Mode budget allocator, historical event replay, twin drift alert banner, daily briefing generator, multi-city toggle, and the chat interface for the multilingual advisor.

**Infra notes (what's justified vs. what to avoid):**
- ✅ **Docker** — low effort, clean way to containerize ingestion + model + API; signals engineering maturity.
- ✅ **Redis Streams** — justified because air quality is inherently a streaming problem; lighter and easier to get right than Kafka.
- ❌ **Kafka** — skip unless someone already knows it well; adds setup risk for no real gain over Redis at this scale.
- ❌ **Prometheus/Grafana** — skip; monitoring infra is a "production" concern, not relevant at a hackathon checkpoint stage and reads as scope-padding.

---

## 6. ML Implementation

### 6.1 Forecasting Model
- **Goal:** Predict AQI/pollutant levels (PM2.5, PM10, NO2, etc.) for the next 1–3 days, per station/city.
- **Approach:** Start with a strong baseline (XGBoost/LightGBM on engineered time features) or a sequence model (LSTM/Prophet) if time allows.
- **Data:** Historical hourly/daily CPCB data (see Section 7).
- **Evaluation:** Report honest metrics — MAE, RMSE — validated against held-out historical periods, not just a live snapshot.

### 6.2 Spatial Interpolation
- **Goal:** Convert sparse station readings into a continuous city-wide heatmap.
- **Approach:** Gaussian Process regression or kriging across station locations.
- **Why it matters:** No public Indian AQI tool currently exposes a true continuous city-wide surface — this is a genuine technical differentiator.
- **Bonus:** The GP variance output directly feeds the confidence/trust overlay on the map — dense-station areas show high confidence, sparse areas appear faded/hatched.

### 6.3 Uncertainty Estimation
- **Goal:** Attach a confidence band to every prediction instead of a single fake-precise number.
- **Approach:** Quantile regression or conformal prediction on top of the forecasting model.
- **Why it matters:** Directly satisfies the PS requirement to show confidence/uncertainty and validate against historical data.

### 6.4 Source Attribution
- **Goal:** Estimate how much of the pollution is traffic-driven, industrial, or weather-driven (dispersion/trapping effects).
- **Approach:** Feature-importance-based breakdown (e.g. SHAP values) using time-of-day, wind, and activity proxies as inputs — explainable rather than a black-box physics model.
- **Caveat:** Since real traffic/industrial datasets at this granularity aren't publicly available, these inputs are synthesized/proxied — label this clearly.

### 6.5 Scenario Simulation / Optimization
- **Goal:** Let a user test "what if" interventions (e.g. reduce traffic by X%) and see the re-forecasted outcome.
- **Approach:** Perturb input features tied to traffic/industrial activity and re-run the forecasting + attribution models; optionally frame as a small constrained optimization (minimize AQI subject to a feasibility/cost budget) rather than static preset scenarios.
- **Extension — Intervention ROI:** Assign rough cost/feasibility weights to each intervention type, sort scenario outputs by AQI-reduction ÷ cost to produce a ranked ROI leaderboard.
- **Extension — Mayor Mode:** Wrap the scenario engine with a fixed-budget allocator; user distributes budget across interventions, system returns combined AQI/health-cost score and tracks best allocations.

### 6.6 Twin Drift Detection
- **Goal:** Surface divergence between forecasted state and actual incoming data — the defining behavior of a true digital twin.
- **Approach:** Simple residual threshold or CUSUM on forecast-vs-actual values per station/city. When divergence exceeds the threshold, flag it as an anomaly event (e.g., firecracker spike during Diwali, stubble burning plume).
- **Output:** Banner/log on the dashboard with event timestamp, magnitude of divergence, and likely cause tag if attributable.

### 6.7 LLM Advisor Layer
- **Goal:** Let users ask natural-language questions (e.g. "should schools close tomorrow?") and get answers grounded in the model's actual forecast, uncertainty, and attribution outputs — not a generic LLM guess.
- **Approach:** LLM calls the serving API for the relevant numbers, then answers with those numbers cited directly in the response.
- **Extension — Daily Briefing:** A fixed prompt template generates a structured, human-readable "air quality report" (forecast, attribution, confidence, recommended actions) on button press; output as text or simple PDF.
- **Extension — Multilingual:** A language parameter in the LLM prompt enables responses in Hindi/Marathi alongside English; no extra infra needed.

### 6.8 Historical Event Replay
- **Goal:** Narrated replay of known pollution events (e.g. Diwali 2019 in Delhi) as a storytelling/demo device.
- **Approach:** Pick 1–2 known events in the Kaggle dataset, pre-script a short narrative overlay keyed to timestamps. The time-scrub slider drives playback; the heatmap, particle animation, attribution, and twin drift alerts all update live during replay.

---

## 7. Data Sources — Real vs. Simulated

| Data | Source | Real or Simulated |
|---|---|---|
| Historical AQI / pollutant levels | Kaggle: *"Air Quality Data In India (2015–2020)"* by rohanrao (sourced from CPCB), 26 Indian cities, hourly + daily | **Real** |
| Weather data (temp, wind, humidity) | Any open weather API, matched to AQI timestamps/cities | **Real** |
| Wind vectors (u/v components) | Open weather API (for particle animation wind field) | **Real** |
| "Live" sensor feed | Historical data replayed row-by-row through Redis to simulate real-time arrival | **Simulated** (clearly labeled as replayed) |
| Traffic activity data | No sufficiently granular public Indian dataset exists | **Simulated** (time-of-day proxy curves) |
| Industrial activity data | No sufficiently granular public dataset exists | **Simulated** (zone-based proxy) |
| Scenario/intervention inputs | Hypothetical by nature | **Simulated** |
| Intervention cost/feasibility weights | Rough estimates for ROI ranking | **Simulated** (clearly labeled as illustrative) |

**Important:** Be transparent about this split in the README and demo — the PS explicitly rewards clearly labeling "observed" vs. "modeled/simulated" data at every stage, so this isn't a weakness to hide, it's a scored strength when disclosed properly.

---

## 8. Frontend Feature Map

| Dashboard Area | Features |
|---|---|
| **Map View** | City-wide pollution heatmap, wind-driven particle animation overlay, confidence/trust heat layer (faded/hatched for uncertain areas), station markers, multi-city toggle |
| **Time Controls** | Time-scrub slider (7 days past → 3 days forecast), play/pause, speed control; heatmap + particles + all overlays update live |
| **Alert Banner** | Twin drift alerts (forecast vs. actual divergence events), proactive threshold breach warnings |
| **Forecast Panel** | AQI forecast charts with confidence bands, source attribution breakdown, self-honesty accuracy tracker |
| **Scenario Simulator** | Intervention sliders, before/after comparison, ROI leaderboard (AQI reduction per unit cost) |
| **Mayor Mode** | Fixed-budget allocator across interventions, resulting AQI/health-cost score, best-allocation leaderboard |
| **Historical Replay** | Event selector (e.g. Diwali 2019 Delhi), narrated timeline with spike/attribution/recovery highlights |
| **Daily Briefing** | One-click auto-generated air quality report (forecast + attribution + confidence + recommendations) |
| **LLM Advisor Chat** | Natural-language Q&A grounded in model outputs, multilingual (English/Hindi/Marathi), source-cited responses |
| **Comparison View** | Ward/neighborhood ranking by pollution, intervention effectiveness per area |

---

## 9. Submission Strategy

### Sept 29 Checkpoint (40% — repo only, no live demo)

Priority order for the repo-only review:

1. **Strong README + architecture diagram** — clear problem framing, system design, and a "Phase 1 (this submission) vs. Phase 2 (post-shortlist build)" roadmap that name-drops the standout features even if not fully built yet.
2. **One real, working, evaluated forecasting model** — trained on the real Kaggle dataset with honest reported metrics (not a stub).
3. **A thin end-to-end vertical slice** — ingestion → stored data → model → a bare API endpoint returning a forecast. Proves the pipeline's *shape* works.
4. **Redis-based simulated streaming ingestion** — the one "advanced infra" piece worth including, since it's motivated by the problem rather than decorative.
5. **Twin drift alert logic** — on-theme for "digital twin," reads well in the README, low build effort.
6. **Intervention ROI leaderboard** — sharpens the "decision-support, not just monitoring" pitch.
7. **Confidence/trust overlay concept** — even if only partially implemented, documenting the GP-variance-as-confidence approach signals depth.

Save for the full build (highest impact live, but contribute less to repo-only review):
- Wind-driven particle animation
- Mayor Mode gamified sandbox
- Historical event replay / storytelling mode
- Time-scrub slider with full animation
- Daily briefing PDF generation
- Multilingual advisor

### Full Build (post-shortlist, live demo)

All features from the full feature list, with emphasis on the visual "wow" elements that shine in a live demo:
- Wind particle animation over the map
- Time-scrub slider with live-updating heatmap
- Mayor Mode with budget allocation and scoring
- Historical event replay (Diwali 2019 walkthrough)
- Auto-generated daily briefing on button press
- Multilingual LLM advisor demo
