/**
 * api/forecast.js
 * ML-powered forecast, attribution, interpolation, and ML scenario API calls.
 */
import { apiFetch } from './client.js';

/**
 * Get multi-day AQI forecast using the trained XGBoost model.
 * @param {string} city
 * @param {number} [days=3]
 * @param {string} [stationType='residential_background']
 */
export const getForecast = (city, days = 3, stationType = 'residential_background') =>
  apiFetch(`/forecast/${encodeURIComponent(city)}?days=${days}&station_type=${encodeURIComponent(stationType)}`);

/**
 * Get SHAP-based source attribution breakdown.
 * @param {string} city
 * @param {string} [stationType='residential_background']
 */
export const getAttribution = (city, stationType = 'residential_background') =>
  apiFetch(`/forecast/${encodeURIComponent(city)}/attribution?station_type=${encodeURIComponent(stationType)}`);

/**
 * Run ML-backed scenario simulation (uses the XGBoost model, not linear coefficients).
 * @param {string} city
 * @param {{
 *   baseline_aqi: number,
 *   traffic_reduction_pct: number,
 *   industrial_curtailment_pct: number,
 *   construction_halt_pct: number,
 *   station_type: string
 * }} payload
 */
export const runMLScenario = (city, payload) =>
  apiFetch(`/forecast/${encodeURIComponent(city)}/ml-scenario`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

/**
 * Get GP-interpolated city-wide pollution surface.
 * @param {string} city
 * @param {number} [resolution=40]
 */
export const getInterpolation = (city, resolution = 40) =>
  apiFetch(`/forecast/${encodeURIComponent(city)}/interpolate?resolution=${resolution}`);

/**
 * Get ML model training metrics.
 */
export const getModelMetrics = () => apiFetch('/forecast/model/metrics');

/**
 * Check ML model health status.
 */
export const getMLHealth = () => apiFetch('/forecast/health');

/**
 * Get per-station forecasts and classifications for all stations in a city.
 * @param {string} city
 * @param {number} [days=3]
 */
export const getStationForecasts = (city, days = 3) =>
  apiFetch(`/forecast/${encodeURIComponent(city)}/stations?days=${days}`);

/**
 * Get historical lockdown validation results (natural experiment).
 */
export const getLockdownValidation = () => apiFetch('/forecast/validation/lockdown');

/**
 * Get URL for SHAP summary PNG images served from ML model artifacts.
 * @param {'all'|'traffic_corridor'|'industrial_belt'|'residential_background'|'pred_vs_actual'} imageType
 */
export const getShapImageUrl = (imageType = 'all') => {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  return `${base}/forecast/shap-images/${imageType}`;
};

/**
 * Simulate sensor loss at X% of monitoring stations.
 * @param {string} city
 * @param {number} [lossPct=30]
 * @param {number} [seed=42]
 */
export const getSensorLoss = (city, lossPct = 30, seed = 42) =>
  apiFetch(`/forecast/${encodeURIComponent(city)}/sensor-loss?loss_pct=${lossPct}&seed=${seed}`);

/**
 * Withhold one station and predict its AQI from neighbors (held-out validation).
 * @param {string} city
 * @param {string} [station='Anand Vihar']
 */
export const getHeldOut = (city, station = 'Anand Vihar') =>
  apiFetch(`/forecast/${encodeURIComponent(city)}/held-out?station=${encodeURIComponent(station)}`);


