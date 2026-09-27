/**
 * config.js — Application Configuration
 * 
 * Centralized configuration for API keys, endpoints, and environment settings
 */

export const config = {
  // MapTiler API key for map rendering
  mapTilerKey: import.meta.env.VITE_MAPTILER_KEY || 'FYT0aBRGgNexUqT7kZLp',
  
  // Backend API base URL
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  
  // Default city
  defaultCity: 'pune',
  
  // Map settings
  map: {
    defaultZoom: 11,
    maxZoom: 16,
    minZoom: 8,
  }
};