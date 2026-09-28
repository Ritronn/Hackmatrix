# ML Model Context & Training Specification
### Urban Environmental Digital Twin — ENR-01 | HackMatrix 5.0
### Revision 2 — fixes for proxy realism, scenario extrapolation, and Component 4 data gap

This document is a complete specification for the machine learning component of the project. It is written to be handed directly to a coding agent to generate a runnable Google Colab notebook. Where earlier revisions of this spec pinned every numeric/implementation detail as "final, no alternatives," this revision keeps that discipline for genuinely settled choices (algorithm family, target variable, evaluation cadence) but explicitly flags a handful of places where the literal instructions would silently produce a broken or misleading result — those are called out as **[FIX]** blocks so the coding agent doesn't skip them.

---

## 1. Why We Are Training This

The problem statement requires a system that does more than display current pollution levels — it must **forecast future pollution**, **explain what is likely causing it**, and **let a user simulate interventions** and see a predicted outcome. None of that is possible without a trained model. A dashboard that only shows historical numbers is not a digital twin; a digital twin must be able to predict forward and respond to hypothetical changes in its inputs. This training pipeline exists to produce that predictive core.

The model we train becomes the load-bearing component behind three downstream features:
1. The **forecast panel** (predicted AQI/pollutant levels for the next 1–3 days)
2. The **source attribution breakdown** (derived from the same trained model, not a separate model)
3. The **scenario simulator** (re-running the same trained model with modified inputs)

Because all three downstream features rely on a single well-trained forecasting model, the quality of that one model is the single most important technical deliverable of the entire project.

**[FIX — carried through the whole doc]** The scenario simulator is explicitly called out elsewhere as the project's *core differentiator*. That means its correctness is not optional polish — if the sliders don't produce believable, smoothly-varying output, the single most important demo feature fails live. Several fixes below (Section 4, Step 6; Section 7) exist specifically to protect this feature, not just to make attribution numbers prettier.

---

## 2. What We Are Training — Overview

Four distinct components are built in this pipeline. They are not four independent models trained from scratch — three of them are derived from or wrapped around the first:

| # | Component | What it produces | Built from |
|---|---|---|---|
| 1 | **Forecasting model** | Predicted AQI/pollutant concentration for a station, N days ahead | Trained from scratch on real historical data |
| 2 | **Uncertainty estimation** | A confidence band (low/median/high) around each forecast | Same features, trained as three quantile variants of the forecasting model |
| 3 | **Source attribution** | A percentage breakdown of traffic-like vs. industrial-like vs. weather-driven contribution to a given prediction, per station | Derived from Component 1 using SHAP — no separate model is trained |
| 4 | **Spatial interpolation** | A continuous city-wide pollution surface from sparse station points | A separate, smaller model trained per timestamp on station coordinates |

Each is specified in full detail in Sections 5–8.

**[FIX]** Component 1 is now trained on **per-station** data, not one city-wide average (see Section 3 and 4). This is a single change that fixes two separate problems at once: it makes the source-attribution breakdown in Component 3 actually meaningful (different stations get different attributions, instead of one city-wide number), and it supplies the real per-station AQI values that Component 4 needs but that the original file list didn't actually provide.

---

## 3. Dataset

**Primary dataset: "Air Quality Data In India (2015–2020)" by rohanrao, hosted on Kaggle.**
Source: Central Pollution Control Board (CPCB), Government of India — the same official body that runs India's real-time air monitoring infrastructure. This is real, government-sourced data, not synthetic.

**Files to use from this dataset:**
- `station_day.csv` — daily-aggregated pollutant and AQI values **per individual monitoring station**. **This is now the primary training file** (replacing `city_day.csv`). **[FIX]** The original spec listed only `city_day.csv` (city-level average) and `stations.csv` (station names/coordinates, no readings) — neither of those actually contains per-station AQI values, which Component 4 (spatial interpolation) requires and which Component 3 (attribution) needs to be station-specific rather than one flat city-wide number. `station_day.csv` is the file in the same Kaggle dataset that has both `StationId` and `AQI` per day, and is what actually closes this gap.
- `stations.csv` — station metadata: `StationId`, `StationName`, `City`, latitude/longitude. Joined against `station_day.csv` on `StationId` to attach coordinates and to assign each station a `station_type` category (Section 4, Step 6).
- `city_day.csv` — kept only as an optional fallback/cross-check (e.g. to sanity-check that station-level aggregates roughly track the published city-level number). Not the primary training file anymore.

**Cities covered:** Ahmedabad, Aizawl, Amaravati, Amritsar, Bengaluru, Bhopal, Brajrajnagar, Chandigarh, Chennai, Coimbatore, Delhi, Ernakulam, Gurugram, Guwahati, Hyderabad, Jaipur, Jorapokhar, Kochi, Kolkata, Lucknow, Mumbai, Patna, Shillong, Talcher, Thiruvananthapuram, Visakhapatnam.

**For the initial notebook, train and validate on Delhi only** (all of Delhi's CPCB stations, trained together with station identity as a feature — not one Delhi-wide average). Delhi has the longest, most complete data history in this dataset, the widest pollution range (from clean to severe), and enough distinct stations (~35+) to make per-station modeling and leave-one-station-out validation (Section 8) meaningful. Multi-city generalization is a documented extension (see Section 9), not part of this first notebook.

**Columns in `station_day.csv` relevant to this pipeline:**
`StationId`, `Date`, `PM2.5`, `PM10`, `NO`, `NO2`, `NOx`, `NH3`, `CO`, `SO2`, `O3`, `Benzene`, `Toluene`, `Xylene`, `AQI`, `AQI_Bucket`.

**Target variable: `AQI`.** Train the model to predict the composite AQI value, not an individual pollutant. AQI is the number every downstream feature (forecast panel, threshold alerts, health-cost translation) is built around, so it must be the primary prediction target.

**How to load it in the notebook:** download via the Kaggle API (`kaggle datasets download -d rohanrao/air-quality-data-in-india`), unzip, and load `station_day.csv` and `stations.csv` with pandas. Do not hardcode a local file path assumption — the notebook must include the Kaggle API download step so it runs standalone on Colab.

**[FIX — verify schema before relying on it.]** Column names in Kaggle dataset files can drift slightly between versions (e.g., some variants use `StationId` while others use `Station`, or capitalize columns differently). Immediately after loading each file, run `print(station_day_df.columns.tolist())` and `print(stations_df.columns.tolist())` before writing any join or filter logic. If the join key or any column referenced in this spec (`StationId`, `Date`, `AQI`, `AQI_Bucket`, `City`, etc.) doesn't match exactly, adjust the column name in the code to the actual name found — do not proceed with the join on an assumed name, since a silent key mismatch will produce an empty or malformed joined dataframe on the very first cell rather than a clear error.

**Use the 2020 lockdown window as a calibration check.** The dataset's 2015–2020 range includes Delhi's actual COVID-19 lockdown period (roughly March–June 2020), during which real traffic and industrial activity collapsed dramatically with a measured AQI response. Pull this window out separately (Section 5, evaluation) and compare it against what the scenario simulator predicts for an equivalent "large traffic/industrial reduction" input. This is the calibration check for the scenario simulator, not a nice-to-have — it's the only real-world evidence available that a large proxy change produces a believable AQI change, and it becomes README evidence that the simulator was validated against a real historical intervention rather than synthetic sliders alone.

---

## 4. Preprocessing & Feature Engineering

**Step 1 — Filter, join, and sort.** Filter `station_day.csv` to stations located in Delhi (join `stations.csv` on `StationId`, filter `City == 'Delhi'`), parse `Date` to datetime, sort ascending by `(StationId, Date)`.

**Step 2 — Handle missing values.** AQI monitoring data has real gaps (sensor downtime, holidays). Use forward-fill followed by backward-fill on pollutant columns, applied **per station** (never fill across a station boundary), capped at a maximum gap of 3 days — do not forward-fill across gaps longer than that, since a stale 3-day-old reading is not a reasonable stand-in for a real value. Drop any remaining rows where `AQI` itself is still missing after this step, since AQI is the training target and cannot be imputed.

**Step 3 — Time-based features (real, derived from the `Date` column, not synthetic):**
- `day_of_week` (0–6)
- `is_weekend` (binary)
- `month` (1–12, to capture seasonal effects like winter stubble-burning spikes and monsoon washout)
- `day_of_year` (for cyclical encoding)
- Cyclical encoding of `day_of_year` as `doy_sin` and `doy_cos` using `sin(2π·day_of_year/365)` and `cos(2π·day_of_year/365)`, so the model understands that day 365 and day 1 are adjacent, not far apart.

**Step 4 — Lag features (real, derived from historical AQI values, computed per station).**
- `aqi_lag_1`, `aqi_lag_2`, `aqi_lag_3` (AQI value 1, 2, and 3 days prior, within the same station's time series)
- `aqi_lag_7` (AQI value 7 days prior, to capture weekly patterns)
- `aqi_rolling_mean_7` (7-day rolling average AQI, per station)
- `aqi_rolling_std_7` (7-day rolling standard deviation, per station, as a volatility signal)

All lag/rolling operations must be grouped by `StationId` (`df.groupby('StationId')...`) so one station's history never leaks into another's lag features.

**Step 5 — Pollutant ratio features (real, derived from existing columns):**
- `pm_ratio` = `PM2.5 / PM10` — a higher ratio is associated with combustion sources (traffic, biomass burning) rather than dust, and this ratio is what later powers the attribution breakdown in Section 7.

**Step 6 — Station identity and activity proxy features [FIX — this step replaces the original city-wide proxy design].**

*6a. Station type.* Tag each Delhi station as one of three categories, based on its known real-world location (a one-time judgment call, not learned):
- `traffic_corridor` — e.g. stations near ITO, RK Puram, major arterial roads.
- `industrial_belt` — e.g. stations near Wazirpur, Mundka, Anand Vihar.
- `residential_background` — relatively cleaner residential/institutional areas.

Encode as one-hot columns: `is_traffic_corridor`, `is_industrial_belt`, `is_residential`.

*6b. Proxies, conditioned on station type — with enough spread to support the scenario simulator.* The original design made `traffic_proxy` a flat weekday/weekend constant and `industrial_proxy` a near-constant with tiny noise, identical across the whole city. That has two separate consequences, both fixed here:
1. With almost no variation, SHAP has nothing station-specific to attribute (the original attribution flaw).
2. With only 2–3 distinct values ever seen in training, a tree model cannot learn a smooth response to intermediate values — so when the scenario simulator later sets `traffic_proxy = 0.7` to simulate "30% reduction," the model has never seen anything like that value and will not respond in a believable, gradual way. This directly undermines the scenario simulator, the project's stated core differentiator.

Fix both by making the proxies (a) vary by station type, and (b) span a wide enough synthetic range during training that the model actually has something to interpolate through:

- **Traffic-corridor stations:** `traffic_proxy` sampled with strong weekday/weekend swing and added day-to-day noise (e.g. weekday mean ~1.0, weekend mean ~0.6, ± random noise wide enough that observed values cover roughly the 0.4–1.1 range across the training set, not just two fixed points). Low, low-variance `industrial_proxy`.
- **Industrial-belt stations:** high, relatively flat `industrial_proxy` (mean ~1.0) but with day-to-day noise wide enough to cover roughly a 0.6–1.1 range (not ±0.05) — still "relatively flat" in *shape* (no strong weekly cycle) but with enough spread that the model has training examples resembling a partial reduction. Weaker traffic swing.
- **Residential/background stations:** both proxies lower and lower-variance; weather/dispersion features dominate here.

Document explicitly in the notebook, next to this code, that the *wider* synthetic range (vs. the original tight-noise version) is deliberately injected so that the trained model has support for interpolating scenario-slider values later — this is a modeling necessity, not an attempt to fabricate a more dramatic effect, and should be stated as such in the README.

*6c. Practical implementation.* Group by `StationId`, attach `station_type` from the 6a tagging, then generate the two proxy columns as station-type-conditional random draws as described in 6b (fixed random seed for reproducibility). The rest of the pipeline (XGBoost, SHAP, quantiles) stays the same — this only changes how Step 6's two columns and the three new one-hot columns are produced, and requires the station-level data from Section 3 rather than city-level data.

**Step 7 — Weather features. [FIX — avoid a placeholder that silently duplicates `month`].** Use a real weather API: fetch historical daily temperature, humidity, and wind speed for Delhi over the same date range (Open-Meteo's free historical API requires no key and covers this range — use it) and merge on `Date`. Do not fall back to a `month`-derived placeholder — a pure function of `month` is redundant with the `month`/`doy_sin`/`doy_cos` features already in the model, and since Component 3 buckets these columns into a "weather/dispersion" SHAP bucket, a redundant placeholder would make that bucket's percentage decorative rather than real. Real API data is what makes the weather bucket in Section 7 mean anything.

**Final feature set fed to the model:**
`day_of_week`, `is_weekend`, `month`, `doy_sin`, `doy_cos`, `aqi_lag_1`, `aqi_lag_2`, `aqi_lag_3`, `aqi_lag_7`, `aqi_rolling_mean_7`, `aqi_rolling_std_7`, `pm_ratio`, `traffic_proxy`, `industrial_proxy`, `is_traffic_corridor`, `is_industrial_belt`, `is_residential`, `temp_c`, `humidity_pct`, `wind_speed_kmh`.

**Train/test split:** this is time-series data, so the split must be chronological, never random, and must not mix stations across the split boundary in a way that leaks time. Use the first 80% of the date range (by time, not by row shuffling) as the training set and the final 20% as the test set, applied consistently across all stations. Do not use `train_test_split` with shuffling — this would leak future information into training and produce falsely optimistic accuracy.

---

## 5. Component 1 — Forecasting Model

**Algorithm: XGBoost Regressor, using `xgboost.XGBRegressor` with `objective='reg:squarederror'`.**

This is a well-justified choice for this specific problem: the feature set above is entirely tabular (lag values, calendar features, ratios, proxies, station identity) with no sequential/image structure that would justify a neural architecture, the dataset size (a few thousand rows per station, now multiplied across ~35 Delhi stations) is small-to-moderate — ideal for gradient-boosted trees — and XGBoost additionally gives native quantile-objective support (Component 2) and full compatibility with SHAP (Component 3), meaning one trained model family serves three downstream features instead of needing separate tooling for each. Include `StationId` (as a categorical/one-hot, or via the `station_type` encoding from Section 4) so the model can learn station-specific baselines even with a single shared model.

**Hyperparameters to use directly (no tuning search needed for this notebook):**
- `n_estimators=300`
- `max_depth=5`
- `learning_rate=0.05`
- `subsample=0.8`
- `colsample_bytree=0.8`
- `random_state=42`

**Forecast horizon:** train the model to predict AQI 1 day ahead (`AQI` at `t+1` given features at `t`, per station). To extend this to a 3-day forecast, apply the model recursively.

**[FIX — the recursive multi-day function needs to be fully specified, not just "feed the prediction back in."]** Implement `forecast_n_days(model, station_history, n=3)` so that at each recursive step it:
1. Predicts `t+1`.
2. Shifts the **entire lag vector**, not just `aqi_lag_1`: the new `aqi_lag_1` is the just-made prediction, the new `aqi_lag_2` is the old `aqi_lag_1`, the new `aqi_lag_3` is the old `aqi_lag_2`, and `aqi_lag_7` is looked up from the real trailing history 7 days back (falling back to the closest available value once fewer than 7 real+predicted days exist).
3. **Recomputes `aqi_rolling_mean_7` and `aqi_rolling_std_7` from the actual trailing 7-day window** (a mix of real historical values and predictions made so far in this recursive call) — not carried forward unchanged from step 1. This is the step most likely to be silently skipped by a naive implementation, and skipping it will produce quietly wrong 2- and 3-day forecasts that still run without erroring.
4. Advances calendar features (`day_of_week`, `is_weekend`, `month`, `doy_sin`, `doy_cos`) to the new date.
5. Repeats for `n` steps.

**Evaluation metrics to compute and print, on the chronological test set:**
- MAE (Mean Absolute Error)
- RMSE (Root Mean Squared Error)
- A plot of predicted vs. actual AQI over the test period
- A plot of residuals (predicted − actual) over time, to visually confirm no systematic bias

**[FIX — evaluate the actual multi-day forecast, and evaluate the days that matter most.]**
- Backtest the recursive `forecast_n_days` function itself and report MAE/RMSE **separately for t+1, t+2, and t+3** — the original spec only ever validated the 1-day-ahead model, while the product promises a 1–3 day forecast panel. Without this, there is no evidence the 3-day number shown in the demo is trustworthy.
- Additionally report MAE/RMSE **stratified by `AQI_Bucket`** (already present in the raw data) or by a simple severity tier. Aggregate error can look fine while the model is systematically worse on the hazardous-AQI days that the threshold-alert and health-cost features specifically depend on — this is a cheap groupby that surfaces that risk instead of hiding it.

**Output artifact:** save the trained model as `forecasting_model.pkl` using `joblib.dump`, so it can be loaded directly by the backend API layer without retraining.

---

## 6. Component 2 — Uncertainty Estimation

**Algorithm: XGBoost Regressor with quantile objective, using `objective='reg:quantileerror'` and `quantile_alpha` set separately for three quantiles: 0.1, 0.5, and 0.9.**

Train three separate `XGBRegressor` models on the exact same feature set and train/test split as Component 1 — one with `quantile_alpha=0.1` (lower bound), one with `quantile_alpha=0.5` (median, functionally equivalent to Component 1's point forecast), and one with `quantile_alpha=0.9` (upper bound). Use the same hyperparameters as Section 5 for all three, changing only the objective and quantile_alpha. Do not use a bootstrapped ensemble or Monte Carlo dropout approach; the quantile-objective approach is more direct, requires no architecture change, and reuses the exact same feature pipeline already built for Component 1.

**[FIX — enforce quantile ordering.]** Because the three models are trained independently, nothing guarantees `q10 ≤ q50 ≤ q90` for every row — with only 300 trees, occasional crossing is a known failure mode of independently-trained quantile regressors. After generating predictions, add an explicit post-processing step: for each row, sort the three predicted values (or clip `q10 = min(q10, q50)`, `q90 = max(q90, q50)`) before serving them. This is one line of code and prevents the confidence band from visually inverting on the frontend.

**Evaluation:** on the test set, compute the **coverage rate** — the percentage of actual AQI values that fall between the (post-correction) `q10` and `q90` predictions. A well-calibrated model should have a coverage rate close to 80%. Print this number explicitly; it is the single most important sanity check for this component.

**Output artifact:** save all three models as `quantile_model_q10.pkl`, `quantile_model_q50.pkl`, `quantile_model_q90.pkl`.

---

## 7. Component 3 — Source Attribution

**Method: SHAP (`shap.TreeExplainer`) applied directly to the Component 1 forecasting model. No separate model is trained for attribution.**

TreeExplainer is the correct choice here because it is built specifically for tree-based models like XGBoost, computes exact (not approximate) Shapley values efficiently, and requires no additional training — it explains the model that already exists.

**Implementation steps for the notebook:**
1. Instantiate `explainer = shap.TreeExplainer(forecasting_model)`.
2. Compute `shap_values = explainer.shap_values(X_test)` on the test feature set.
3. Group the resulting per-feature SHAP contributions into three buckets for the attribution breakdown:
   - **Traffic-like bucket:** SHAP contributions from `traffic_proxy` only. **[FIX]** `day_of_week`/`is_weekend` are dropped from this bucket — they're highly collinear with `traffic_proxy` (which is itself partly derived from them), and SHAP is known to split attribution somewhat arbitrarily among correlated features. Including all three inflates or deflates the bucket unpredictably depending on tree structure rather than giving a stable number.
   - **Industrial-like bucket:** SHAP contributions from `industrial_proxy`, `pm_ratio`, `is_industrial_belt`.
   - **Weather/dispersion bucket:** SHAP contributions from `temp_c`, `humidity_pct`, `wind_speed_kmh`, `month`.
4. **[FIX — attribution is now per station, not one flat city number.]** Because `traffic_proxy` and `industrial_proxy` now genuinely vary by `station_type` (Section 4, Step 6), compute and report this breakdown **grouped by station** (or at minimum by `station_type`), not as one aggregate figure across all of Delhi. This is what turns the attribution feature from "one city-wide guess" into "the map can show different dominant sources in different parts of the city" — a materially better and more honest product feature.
5. For a given prediction, sum the absolute SHAP values within each bucket, then normalize the three bucket sums to sum to 100%. This normalized split is what gets displayed to the user as "62% traffic-like, 23% industrial-like, 15% weather-driven" for that specific station's forecast on that day.
6. Generate a `shap.summary_plot` across the full test set and save it as `shap_summary.png`. Also generate one `shap.summary_plot` per `station_type` (three plots: `shap_summary_traffic_corridor.png`, `shap_summary_industrial_belt.png`, `shap_summary_residential.png`) — these are what actually prove the attribution differs by location, and are the strongest artifact to put in the README as evidence the attribution logic is grounded in the model's real learned behavior, not hardcoded percentages.

**Important framing to carry into the README:** this attribution is a proxy-based, explainability-driven estimate — it tells you which *input signals* the model leaned on for a given prediction, not a physically measured emissions inventory. State this explicitly wherever attribution numbers are shown in the product, and note that the weather bucket depends on real weather data being connected (Section 4, Step 7) to be meaningful rather than redundant with `month`.

---

## 8. Component 4 — Spatial Interpolation

**Algorithm: Gaussian Process Regression, using `sklearn.gaussian_process.GaussianProcessRegressor` with an RBF kernel plus a WhiteKernel noise term.**

This is the correct choice because a Gaussian Process is the standard method for spatial interpolation with a small number of known points, and — critically — it returns a **variance** alongside every predicted value at no extra cost. That variance is exactly what powers the confidence/trust map overlay described in the project's feature list: high variance in areas far from any monitoring station, low variance near stations.

**[FIX — data source.]** Station-level AQI values for a given timestamp now come directly from `station_day.csv` (Section 3), which was missing from the original file list. This is the same data-loading change made in Section 3/4 for Component 1 — no separate download is needed.

**[FIX — coordinate scale and kernel fitting.]** Fitting `RBF(length_scale=1.0)` directly on raw latitude/longitude in degrees is a scale mismatch: Delhi's entire extent is roughly 0.3–0.4 degrees across, so a length scale of 1.0 degree is several times larger than the whole city and would over-smooth the surface into a near-flat, uninformative heatmap — which would also flatten the variance output that the "trust overlay" depends on, defeating the point of this component while still running without an error. Fix:
1. Project station lat/lon to a local flat approximation in kilometers (a simple equirectangular projection centered on Delhi's mean lat/lon is sufficient at this scale) before fitting the GP, so `length_scale` has physical meaning in km.
2. Use `RBF(length_scale=5.0)` (a few km, a reasonable starting guess for a city-scale pollution correlation length) `+ WhiteKernel(noise_level=1.0)` as the **initial** kernel, and let `GaussianProcessRegressor`'s default optimizer (`optimizer='fmin_l_bfgs_b'`, the sklearn default — do not pass `optimizer=None`) refine it against the actual data rather than treating the initial value as fixed and final.

**Implementation steps for the notebook:**
1. For a single timestamp (e.g., the most recent day in the dataset), take each Delhi station's projected (km-scale) coordinates and its corresponding AQI value from `station_day.csv` as training points: `X = [[x_km, y_km], ...]`, `y = [aqi_value, ...]`.
2. Fit `GaussianProcessRegressor(kernel=kernel, normalize_y=True, random_state=42)` on these points (optimizer left enabled, per the fix above).
3. Generate a grid of points covering the city's bounding box in the same projected coordinate system (e.g., a 50x50 grid), then convert grid points back to lat/lon for export.
4. Call `gp.predict(grid_points, return_std=True)` to get both the interpolated AQI value and the standard deviation at every grid point.
5. Export this as a JSON structure of `{lat, lon, predicted_aqi, std_dev}` objects — this is what the frontend map layer consumes to render both the heatmap and the confidence overlay.

**[FIX — validate the interpolation itself.]** The original spec only demonstrated that this component runs, with no check on whether its output is any good — which matters here specifically because the output is marketed as a "trust" overlay. Add a simple **leave-one-station-out validation**: for each Delhi station, refit the GP on all *other* stations and predict at the held-out station's location, then compare against its real AQI value. Report MAE across all held-out stations. This is cheap (Delhi has ~35+ stations, so ~35 refits on a handful of points each) and gives an honest answer to "is the interpolated surface actually trustworthy," which is exactly what this component claims to show.

**Note on scope:** this component is trained per-timestamp (it interpolates a spatial snapshot), unlike Components 1–3 which are trained once and reused across time. The notebook should wrap this in a function `interpolate_city(station_coords, station_values, grid_resolution=50)` that can be called for any timestamp, since the backend will call this repeatedly as new "live" data arrives.

---

## 9. What This Notebook Should NOT Include (explicitly out of scope for this first version)

- Multi-city training or generalization testing — single city (Delhi) only, for now.
- Hyperparameter tuning/grid search — fixed hyperparameters as specified above.
- The Redis streaming layer, the scenario simulator's "what-if" UI logic, and the LLM advisor — these are downstream application-layer components that consume this notebook's saved model artifacts; they are not part of the model training notebook itself.
- Real traffic/industrial datasets — none exist publicly at the needed granularity; the synthetic proxies specified in Section 4 (now station-conditional and wider-ranged) are final, not a placeholder pending a "better" dataset.
- A full academic-style causal study of the 2020 lockdown — the lockdown check in Section 3/5 is a single before/after comparison used for calibration, not a rigorous causal analysis.

---

## 10. Deliverables Expected From This Notebook

By the end of the notebook, the following files must exist and be downloadable from Colab:
1. `forecasting_model.pkl` — Component 1 (trained on per-station data, with station identity as a feature)
2. `quantile_model_q10.pkl`, `quantile_model_q50.pkl`, `quantile_model_q90.pkl` — Component 2 (quantile-crossing corrected)
3. `shap_summary.png` plus `shap_summary_traffic_corridor.png`, `shap_summary_industrial_belt.png`, `shap_summary_residential.png` — Component 3 visual artifacts
4. A printed metrics report in the notebook output, screenshot-able for the README, including:
   - MAE/RMSE for t+1, t+2, and t+3 forecasts separately
   - MAE/RMSE stratified by `AQI_Bucket` or severity tier
   - Quantile coverage rate
   - Leave-one-station-out MAE for the spatial interpolation
5. A sample `interpolate_city(...)` function output (JSON) for one timestamp, demonstrating Component 4 works end-to-end
6. A sample per-station attribution breakdown (at least two stations of different `station_type`, shown side by side) demonstrating that attribution actually differs by location, not just by day-of-week

These deliverables are what get referenced in the GitHub README as evidence of "one real, working, evaluated model" for the Sept 29 checkpoint — and, unlike the original deliverable list, they now include the evidence that the model's two most-hyped downstream features (station-specific attribution, and a scenario simulator whose inputs it can actually interpolate through) are real rather than cosmetic.

---

## 11. How This Connects to the Web Application (context for the notebook author)

This notebook is not the final product — it is the offline training step that produces model artifacts. In the actual application, a FastAPI backend loads `forecasting_model.pkl` and the three quantile models at startup, exposes a `/forecast` endpoint that runs the same feature-engineering steps from Section 4 on incoming per-station data and returns a prediction plus confidence band, exposes an `/attribution` endpoint that runs the SHAP logic from Section 7 on that same prediction (returning a station-specific breakdown), exposes an `/interpolate` endpoint that calls the Section 8 function for the map layer, and exposes a `/scenario` endpoint that lets the frontend modify `traffic_proxy`/`industrial_proxy` values and re-runs the forecast through the same loaded model.

**[FIX]** Because Section 4's proxy ranges were deliberately widened to give the model interpolation support, the `/scenario` endpoint should clamp incoming slider values to roughly the range actually seen in training (e.g. `traffic_proxy` to ~0.4–1.1) rather than allowing arbitrary values like 0.0 — the model has no learned behavior outside that range and would extrapolate unpredictably rather than degrade gracefully. Document this clamped range in the API layer, not just the notebook.

Building the feature pipeline as a single, reusable function (not notebook-only inline code) still matters: that same function needs to be imported directly into the backend later, and must now accept `StationId`/`station_type` as part of its input rather than assuming one city-wide row.
