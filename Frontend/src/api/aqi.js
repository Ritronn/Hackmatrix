/**
 * api/aqi.js
 * AQI API calls — current city readings, station data, hotspot map.
 */
import { apiFetch } from './client.js';

/** Fetch all stations + city average for a city. */
export const getCityAQI = (city) => apiFetch(`/twin/${encodeURIComponent(city)}/current`);

/** Fetch hotspot map interpolation points. */
export const getHotspots = (city) => apiFetch(`/twin/${encodeURIComponent(city)}/hotspots`);
