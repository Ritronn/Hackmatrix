/**
 * api/scenario.js
 * Scenario simulation + ROI leaderboard API calls.
 */
import { apiFetch } from './client.js';

/**
 * Run a what-if simulation with current lever values.
 * @param {{
 *   city: string,
 *   baseline_aqi: number,
 *   traffic_restriction_pct: number,
 *   industrial_curtailment_pct: number,
 *   mist_units: number,
 *   construction_halt_pct: number,
 *   metro_subsidy: boolean,
 *   stubble_interception: boolean
 * }} payload
 */
export const runSimulation = (payload) =>
  apiFetch('/scenario/simulate', { method: 'POST', body: JSON.stringify(payload) });

/**
 * Fetch pre-ranked ROI leaderboard for a city.
 * @param {string} city
 * @param {number} baselineAqi
 */
export const getRoiLeaderboard = (city, baselineAqi) =>
  apiFetch(`/scenario/roi-leaderboard?city=${encodeURIComponent(city)}&baseline_aqi=${baselineAqi}`);
