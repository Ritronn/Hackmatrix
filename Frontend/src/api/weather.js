/**
 * api/weather.js
 * Weather API call — current conditions + wind vectors.
 */
import { apiFetch } from './client.js';

/** Fetch current weather (temp, humidity, wind speed/dir, u/v components). */
export const getWeather = (city) => apiFetch(`/weather/${encodeURIComponent(city)}`);
