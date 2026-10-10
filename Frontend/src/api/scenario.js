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
 * Fetch ROI leaderboard for a city, dynamically reflecting active levers or GRAP-max.
 * @param {string} city
 * @param {number} baselineAqi
 * @param {Record<string, any>} [params]
 */
export const getRoiLeaderboard = (city, baselineAqi, params = {}) => {
  const q = new URLSearchParams({
    city,
    baseline_aqi: baselineAqi,
  });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) q.append(k, v);
  });
  return apiFetch(`/scenario/roi-leaderboard?${q.toString()}`);
};

/**
 * Find best intervention packages under budget constraint.
 * @param {{
 *   budget_crore: number,
 *   baseline_aqi: number,
 *   unavailable_interventions?: string[],
 *   city?: string
 * }} payload
 */
export const getBudgetPlan = (payload) =>
  apiFetch('/scenario/budget-plan', { method: 'POST', body: JSON.stringify(payload) });

