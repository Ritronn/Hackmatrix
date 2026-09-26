/**
 * views/wards.js
 * Ward analytics — fetches live ward data from backend, renders table.
 * Filter pills operate on the rendered rows in-browser.
 */
import { getWards } from '../api/wards.js';

// AQI → category
function aqiCategory(aqi) {
  if (aqi > 200) return 'severe';
  if (aqi > 100) return 'moderate';
  return 'good';
}

// AQI → badge class
function badgeClass(aqi) {
  if (aqi > 300) return 'badge-status--severe';
  if (aqi > 200) return 'badge-status--poor';
  if (aqi > 100) return 'badge-status--moderate';
  return 'badge-status--good';
}

function renderWardsTable(wards) {
  const tbody = document.querySelector('#wards-table tbody');
  if (!tbody) return;

  tbody.innerHTML = wards.map((w) => {
    const cat = aqiCategory(w.aqi);
    return `
      <tr class="ward-row ward-row--${cat}" data-category="${cat}">
        <td><strong>${w.ward_name}</strong></td>
        <td>${w.zone}</td>
        <td><span class="badge-status ${badgeClass(w.aqi)}">${Math.round(w.aqi)} AQI</span></td>
        <td>${w.pm25} µg/m³</td>
        <td><span class="driver-tag driver-tag--traffic">${w.dominant_driver}</span></td>
        <td>${w.recommended_action}</td>
      </tr>
    `;
  }).join('');

  // Re-attach row selection after re-render
  tbody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => {
      tbody.querySelectorAll('tr').forEach((r) => r.classList.remove('ward-row--selected'));
      row.classList.add('ward-row--selected');
    });
  });
}

function updateWardSummary(data) {
  const highEl  = document.querySelector('.ward-stat-card:nth-child(2) .ward-stat-num');
  const cleanEl = document.querySelector('.ward-stat-card:nth-child(3) .ward-stat-num');

  if (highEl)  highEl.textContent  = data.highest_severity_ward;
  if (cleanEl) cleanEl.textContent = data.cleanest_ward;
}

export function initWardsAnalytics() {
  const filterBtns = document.querySelectorAll('#ward-filter-group .filter-pill');

  // ── Filter pills ──────────────────────────────────────────────────────────
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('filter-pill--active'));
      btn.classList.add('filter-pill--active');
      const filter = btn.getAttribute('data-filter');
      document.querySelectorAll('#wards-table tbody tr').forEach((row) => {
        const cat = row.getAttribute('data-category');
        row.style.display = (filter === 'all' || filter === cat) ? '' : 'none';
      });
    });
  });

  // ── Fetch live ward data when view is first opened ────────────────────────
  async function loadWards() {
    const city = window._currentCity ?? 'Pune';
    try {
      const data = await getWards(city);
      renderWardsTable(data.wards);
      updateWardSummary(data);
    } catch (err) {
      console.warn('[wards] API unreachable, keeping static HTML.', err);
    }
  }

  // Patch switchView to load wards on first navigation
  let wardsLoaded = false;
  const origSwitch = window.switchView;
  window.switchView = function (viewName) {
    origSwitch?.(viewName);
    if (viewName === 'wards' && !wardsLoaded) {
      wardsLoaded = true;
      loadWards();
    }
  };
}
