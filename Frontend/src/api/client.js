/**
 * api/client.js
 * Base fetch wrapper for all backend API calls.
 * All requests go to the FastAPI server at VITE_API_BASE_URL (default localhost:8000).
 */

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

/**
 * Generic fetch helper — throws on non-2xx with a clean error message.
 * @param {string} path  — e.g. '/twin/Delhi/current'
 * @param {RequestInit} [options]
 */
export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}
