/**
 * api/wards.js
 * Ward analytics API call.
 */
import { apiFetch } from './client.js';

/**
 * Fetch ward rankings for a city.
 * @param {string} city
 * @param {'all'|'severe'|'moderate'|'good'} [category='all']
 */
export const getWards = (city, category = 'all') =>
  apiFetch(`/wards/${encodeURIComponent(city)}?category=${category}`);
