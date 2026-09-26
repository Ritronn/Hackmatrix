/**
 * api/advisor.js
 * Gemini AI Advisor + daily briefing API calls.
 */
import { apiFetch } from './client.js';

/**
 * Ask the AI advisor a grounded question.
 * @param {{
 *   question: string,
 *   city: string,
 *   language: 'en'|'hi'|'mr',
 *   context_aqi?: number,
 *   context_forecast_peak?: number,
 *   context_dominant_source?: string
 * }} payload
 */
export const askAdvisor = (payload) =>
  apiFetch('/advisor/ask', { method: 'POST', body: JSON.stringify(payload) });

/**
 * Generate a daily briefing for a city.
 * @param {string} city
 * @param {string} [language='en']
 */
export const getDailyBriefing = (city, language = 'en') =>
  apiFetch(`/advisor/briefing/${encodeURIComponent(city)}?language=${language}`);
