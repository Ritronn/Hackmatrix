/**
 * views/forecasting.js
 * Controller for Sensor Forecasting & Uncertainty Twin page (/forecasting).
 *
 * Implements PS Requirements:
 * 1. Multi-level sensor loss comparison table (25%, 50%, 75%) — GP vs IDW vs Persistence.
 * 2. Held-out location validation (leave-one-out spatial prediction with neighbors).
 * 3. Intervention package stability propagation under GP uncertainty bounds.
 */
import { getSensorLossComparison, getHeldOut } from '../api/forecast.js';

let _comparisonData = null;

export async function runForecastingAnalysis() {
  const city = window._currentCity ?? 'Delhi';
  const loadingEl = document.getElementById('sensor-comparison-loading');
  const tableWrap = document.getElementById('sensor-comparison-table-wrap');
  const tbody     = document.getElementById('sensor-comparison-tbody');
  const stabilityLoading = document.getElementById('fo-stability-loading');
  const stabilityGrid    = document.getElementById('fo-stability-grid');
  const btns = [
    document.getElementById('btn-run-forecasting'),
    document.getElementById('btn-run-forecasting-top')
  ].filter(Boolean);

  btns.forEach(btn => {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> Computing...';
  });
  if (window.lucide) window.lucide.createIcons();

  if (loadingEl) {
    loadingEl.style.display = 'block';
    loadingEl.textContent = 'Running Gaussian Process, IDW & Persistence models at 25%, 50%, 75% sensor loss...';
  }

  try {
    const result = await getSensorLossComparison(city);
    _comparisonData = result;

    // Render Section A: Multi-level Comparison Table
    if (tbody && result.comparison_table) {
      tbody.innerHTML = result.comparison_table.map(row => {
        const gpWinsIdw  = row.gp_beats_idw;
        const gpWinsPers = row.gp_beats_persistence;
        const winsText = (gpWinsIdw && gpWinsPers)
          ? '<span style="color:#22C55E; font-weight:600;">✅ Beats both</span>'
          : gpWinsIdw
            ? '<span style="color:#22C55E; font-weight:600;">✅ Beats IDW</span>'
            : gpWinsPers
              ? '<span style="color:#22C55E; font-weight:600;">✅ Beats Persistence</span>'
              : '<span style="color:#9CA3AF;">—</span>';

        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05); transition: background 0.2s ease;">
          <td style="padding:12px 14px; font-weight:700; color:#FBBF24;">${row.loss_pct.toFixed(0)}% Loss</td>
          <td style="padding:12px 14px; text-align:center; color:#22C55E; font-weight:600;">${row.active_stations}</td>
          <td style="padding:12px 14px; text-align:center; color:#F87171; font-weight:600;">${row.dropped_count}</td>
          <td style="padding:12px 14px; text-align:center; color:#60A5FA; font-weight:700;">${row.gp_mae} AQI</td>
          <td style="padding:12px 14px; text-align:center; color:#FBBF24;">${row.idw_mae} AQI</td>
          <td style="padding:12px 14px; text-align:center; color:#F87171;">${row.persistence_mae} AQI</td>
          <td style="padding:12px 14px; text-align:center; color:#9CA3AF;">±${row.avg_gp_std} AQI</td>
          <td style="padding:12px 14px; text-align:center; font-size:0.85rem;">${winsText}</td>
        </tr>`;
      }).join('');

      if (loadingEl) loadingEl.style.display = 'none';
      if (tableWrap) tableWrap.style.display = 'block';
    }

    // Render Section C: Intervention Package Stability
    if (stabilityGrid && result.intervention_stability) {
      stabilityGrid.innerHTML = result.intervention_stability.map(item => {
        const std = item.gp_std;
        const lo  = item.reduction_lower_bound;
        const hi  = item.reduction_upper_bound;
        const pct = item.loss_pct;
        const borderColor = pct <= 25 ? '#22C55E' : pct <= 50 ? '#FBBF24' : '#F87171';

        return `<div style="padding:18px; background:rgba(255,255,255,0.03); border:1px solid ${borderColor}33; border-top:3px solid ${borderColor}; border-radius:10px; display:flex; flex-direction:column; gap:8px;">
          <div style="font-size:0.75rem; font-weight:700; color:${borderColor}; letter-spacing:0.05em;">${pct.toFixed(0)}% SENSOR NETWORK LOSS</div>
          <div style="font-size:0.85rem; color:#9CA3AF;">GP Uncertainty: <strong style="color:#fff;">±${std} AQI</strong></div>
          <div style="font-size:0.9rem;">Target package: <strong>−30 AQI</strong></div>
          <div style="font-size:1.1rem; font-weight:700; color:${borderColor};">
            Bounded: −${lo} to −${hi} AQI
          </div>
          <div style="font-size:0.75rem; color:#9CA3AF; margin-top:4px; line-height:1.5;">${item.interpretation}</div>
        </div>`;
      }).join('');

      if (stabilityLoading) stabilityLoading.style.display = 'none';
      stabilityGrid.style.display = 'grid';
    }

  } catch (err) {
    console.error('[forecasting] Error:', err);
    if (loadingEl) {
      loadingEl.style.display = 'block';
      loadingEl.textContent = `⚠ Analysis Failed: ${err.message}. Ensure backend is active on http://localhost:8000.`;
    }
  } finally {
    btns.forEach(btn => {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="play"></i> Run Full Analysis';
    });
    if (window.lucide) window.lucide.createIcons();
  }
}

export async function runHeldOutForecast() {
  const city    = window._currentCity ?? 'Delhi';
  const station = document.getElementById('fo-held-out-select')?.value ?? 'Anand Vihar';
  const resultDiv = document.getElementById('fo-held-out-results');
  const btn = document.getElementById('btn-run-held-out-fo');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> Predicting...';
    if (window.lucide) window.lucide.createIcons();
  }

  try {
    const result = await getHeldOut(city, station);

    if (resultDiv) resultDiv.style.display = 'block';

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('fo-actual-aqi', result.actual_aqi);
    set('fo-gp-aqi', `${result.gp_predicted_aqi} AQI`);
    set('fo-gp-err', `${result.gp_error} AQI`);
    set('fo-gp-std', `${result.gp_uncertainty_std} AQI`);
    set('fo-idw-aqi', `${result.idw_predicted_aqi} AQI`);
    set('fo-idw-err', `${result.idw_error} AQI`);
    set('fo-pers-aqi', `${result.persistence_predicted_aqi} AQI`);
    set('fo-pers-err', `${result.persistence_error} AQI`);

    const verdictEl = document.getElementById('fo-held-out-verdict');
    if (verdictEl) {
      const gpBestMethod = result.gp_beats_idw && result.gp_beats_persistence
        ? 'GP beats both IDW and Persistence baselines'
        : result.gp_beats_idw
          ? 'GP beats IDW baseline'
          : result.gp_beats_persistence
            ? 'GP beats Persistence baseline'
            : 'GP performs comparably to baselines';
      const pkg = result.package_stability;
      verdictEl.innerHTML = `
        <strong style="color:#22C55E;">${result.held_out_station}</strong> withheld as unseen ground truth — 
        ${gpBestMethod}. GP error: <strong>${result.gp_error} AQI</strong> vs IDW: ${result.idw_error} AQI / Persistence: ${result.persistence_error} AQI.<br/>
        <span style="color:#F59E0B; font-size:0.8rem; margin-top:4px; display:inline-block;">
          Package stability at this coordinate: targeting −${pkg.typical_reduction} AQI &rarr; range −${pkg.lower_bound} to −${pkg.upper_bound} AQI [MODELED].
        </span>`;
    }

    const neighborsEl = document.getElementById('fo-neighbors');
    if (neighborsEl && result.nearest_neighbors) {
      neighborsEl.textContent = result.nearest_neighbors.map(n => `${n.name} (${n.aqi} AQI)`).join(', ');
    }

  } catch (err) {
    console.error('[held-out-forecast] Error:', err);
    alert(`Held-out prediction failed: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="target"></i> Predict Held-Out';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

export function initSensorForecasting() {
  const btnRun = document.getElementById('btn-run-forecasting');
  const btnRunTop = document.getElementById('btn-run-forecasting-top');
  const btnHeldOut = document.getElementById('btn-run-held-out-fo');

  btnRun?.addEventListener('click', runForecastingAnalysis);
  btnRunTop?.addEventListener('click', runForecastingAnalysis);
  btnHeldOut?.addEventListener('click', runHeldOutForecast);
}
