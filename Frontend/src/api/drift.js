/**
 * api/drift.js
 * Twin drift detection status API call.
 */
import { apiFetch } from './client.js';

/**
 * Fetch current twin drift status for a city.
 * @param {string} city
 * @param {number} [thresholdPct=25]
 */
export const getDriftStatus = (city, thresholdPct = 25) =>
  apiFetch(`/drift/status?city=${encodeURIComponent(city)}&threshold_pct=${thresholdPct}`);
