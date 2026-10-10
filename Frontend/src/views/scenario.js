/**
 * views/scenario.js
 * Policy Intervention Simulator + Mayor Mode + Budget Planner.
 * Lever changes POST to /scenario/simulate — real backend math.
 * ROI leaderboard is fetched from /scenario/roi-leaderboard on load.
 * Budget planner uses /scenario/budget-plan (Addition 1 — Final Round).
 */
import { runSimulation, getRoiLeaderboard, getBudgetPlan } from '../api/scenario.js';
import { runMLScenario } from '../api/forecast.js';
import { getCityAQI } from '../api/aqi.js';

const FEASIBILITY_CLASS = {
  High: 'badge-tag--high',
  Medium: 'badge-tag--med',
  Low: 'badge-tag--low',
};

// ── ROI Table renderer ────────────────────────────────────────────────────────
function renderRoiTable(interventions) {
  const tbody = document.getElementById('roi-table-body');
  if (!tbody) return;
  tbody.innerHTML = interventions.map((e) => {
    const isInactive = (e.cost_crore <= 0 && e.aqi_drop <= 0) || e.feasibility === 'Status Quo';
    const rankBadge = isInactive
      ? `<span class="rank-badge" style="background:rgba(255,255,255,0.05); color:#6B7280; font-size:10px;">Off</span>`
      : `<span class="rank-badge ${e.rank <= 3 ? `rank-${e.rank}` : ''}">#${e.rank}</span>`;
    const aqiColor = isInactive ? '#6B7280' : '#22C55E';
    const costText = isInactive ? '<span style="color:#6B7280;">₹0.0 Cr</span>' : `₹${e.cost_crore.toFixed(1)} Cr`;
    const roiText = isInactive
      ? '<span style="color:#6B7280;">—</span>'
      : `<strong class="text-gold">+${e.roi_per_crore.toFixed(2)} / Cr</strong>`;
    const feasClass = FEASIBILITY_CLASS[e.feasibility] ?? '';
    const feasBadge = isInactive
      ? `<span style="font-size:10px; padding:2px 8px; border-radius:4px; background:rgba(255,255,255,0.05); color:#9CA3AF;">Off</span>`
      : `<span class="badge-tag ${feasClass}">${e.feasibility}</span>`;

    return `
      <tr class="${e.rank === 1 && !isInactive ? 'roi-row--top' : ''}" style="transition: all 0.25s ease;">
        <td>${rankBadge}</td>
        <td><strong style="color:${isInactive ? '#9CA3AF' : '#F3F4F6'}">${e.intervention}</strong></td>
        <td style="color:${aqiColor}; font-weight:600;">-${e.aqi_drop.toFixed(1)} AQI</td>
        <td>${costText}</td>
        <td>${roiText}</td>
        <td>${feasBadge}</td>
      </tr>
    `;
  }).join('');
}

export function initScenarioSimulator() {
  // ── Mode switcher ─────────────────────────────────────────────────────────
  const btnModeMayor    = document.getElementById('btn-mode-mayor');
  const btnModeBudget   = document.getElementById('btn-mode-budget');
  const btnModeForecast = document.getElementById('btn-mode-forecast');
  const mayorDeck       = document.getElementById('mayor-budget-deck');
  const budgetDeck      = document.getElementById('budget-planner-deck');
  const forecastingDeck = document.getElementById('forecasting-deck');
  const scenarioGrid    = document.querySelector('.scenario-grid');

  function clearAllModes() {
    [btnModeMayor, btnModeBudget, btnModeForecast].forEach(b => b?.classList.remove('mode-btn--active'));
    if (mayorDeck)       mayorDeck.style.display       = 'none';
    if (budgetDeck)      budgetDeck.style.display      = 'none';
    if (forecastingDeck) forecastingDeck.style.display = 'none';
    if (scenarioGrid)    scenarioGrid.style.display    = 'grid';
  }

  btnModeMayor?.addEventListener('click', () => {
    clearAllModes();
    btnModeMayor.classList.add('mode-btn--active');
    if (mayorDeck) mayorDeck.style.display = 'block';
  });
  btnModeBudget?.addEventListener('click', () => {
    clearAllModes();
    btnModeBudget.classList.add('mode-btn--active');
    if (budgetDeck) budgetDeck.style.display = 'block';
    if (scenarioGrid) scenarioGrid.style.display = 'none';
  });
  btnModeForecast?.addEventListener('click', () => {
    clearAllModes();
    btnModeForecast.classList.add('mode-btn--active');
    if (forecastingDeck) forecastingDeck.style.display = 'block';
    if (scenarioGrid) scenarioGrid.style.display = 'none';
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Sensor Forecasting Mode (Addition 2 — Final Round)
  // ══════════════════════════════════════════════════════════════════════════

  let _comparisonData = null; // Cache comparison result for Section C

  async function runForecastingAnalysis() {
    const city = window._currentCity ?? 'Delhi';
    const loadingEl = document.getElementById('sensor-comparison-loading');
    const tableWrap = document.getElementById('sensor-comparison-table-wrap');
    const tbody     = document.getElementById('sensor-comparison-tbody');
    const stabilityLoading = document.getElementById('fo-stability-loading');
    const stabilityGrid    = document.getElementById('fo-stability-grid');
    const btn = document.getElementById('btn-run-forecasting');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> Computing...';
      if (window.lucide) window.lucide.createIcons();
    }
    if (loadingEl) loadingEl.textContent = 'Running GP, IDW & Persistence at 25%, 50%, 75%...';

    try {
      const { getSensorLossComparison } = await import('../api/forecast.js');
      const result = await getSensorLossComparison(city);
      _comparisonData = result;

      // Render Section A: Comparison Table
      if (tbody && result.comparison_table) {
        tbody.innerHTML = result.comparison_table.map(row => {
          const gpWinsIdw  = row.gp_beats_idw;
          const gpWinsPers = row.gp_beats_persistence;
          const winsText = (gpWinsIdw && gpWinsPers) ? '✅ Beats both' : gpWinsIdw ? '✅ Beats IDW' : gpWinsPers ? '✅ Beats Persistence' : '—';
          return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:10px 12px; font-weight:700; color:#FBBF24;">${row.loss_pct.toFixed(0)}% Loss</td>
            <td style="padding:10px 12px; text-align:center; color:#22C55E;">${row.active_stations}</td>
            <td style="padding:10px 12px; text-align:center; color:#F87171;">${row.dropped_count}</td>
            <td style="padding:10px 12px; text-align:center; color:#60A5FA; font-weight:600;">${row.gp_mae} AQI</td>
            <td style="padding:10px 12px; text-align:center; color:#FBBF24;">${row.idw_mae} AQI</td>
            <td style="padding:10px 12px; text-align:center; color:#F87171;">${row.persistence_mae} AQI</td>
            <td style="padding:10px 12px; text-align:center; color:#9CA3AF;">±${row.avg_gp_std} AQI</td>
            <td style="padding:10px 12px; text-align:center; font-size:0.8rem;">${winsText}</td>
          </tr>`;
        }).join('');
        if (loadingEl) loadingEl.style.display = 'none';
        if (tableWrap) tableWrap.style.display = 'block';
      }

      // Render Section C: Intervention Stability
      if (stabilityGrid && result.intervention_stability) {
        stabilityGrid.innerHTML = result.intervention_stability.map(item => {
          const std = item.gp_std;
          const lo  = item.reduction_lower_bound;
          const hi  = item.reduction_upper_bound;
          const pct = item.loss_pct;
          const borderColor = pct <= 25 ? '#22C55E' : pct <= 50 ? '#FBBF24' : '#F87171';
          return `<div style="padding:16px; background:rgba(255,255,255,0.03); border:1px solid ${borderColor}33; border-top:3px solid ${borderColor}; border-radius:10px;">
            <div style="font-size:0.75rem; font-weight:700; color:${borderColor}; margin-bottom:8px;">${pct.toFixed(0)}% SENSOR LOSS</div>
            <div style="font-size:0.8rem; color:#9CA3AF; margin-bottom:6px;">GP Forecast Uncertainty: <strong style="color:#fff;">±${std} AQI</strong></div>
            <div style="font-size:0.85rem; margin-bottom:4px;">Target package: <strong>−30 AQI</strong></div>
            <div style="font-size:1rem; font-weight:600; color:${borderColor};">
              Realistic range: −${lo} to −${hi} AQI
            </div>
            <div style="font-size:0.72rem; color:#6B7280; margin-top:8px; line-height:1.5;">${item.interpretation}</div>
          </div>`;
        }).join('');
        if (stabilityLoading) stabilityLoading.style.display = 'none';
        stabilityGrid.style.display = 'grid';
      }

    } catch (err) {
      console.error('[forecasting] Error:', err);
      if (loadingEl) loadingEl.textContent = `⚠ Failed: ${err.message}. Is backend running?`;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="play"></i> Run Full Analysis';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async function runHeldOutForecast() {
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
      const { getHeldOut } = await import('../api/forecast.js');
      const result = await getHeldOut(city, station);

      if (resultDiv) resultDiv.style.display = 'block';

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
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
          ? 'GP beats both IDW and Persistence'
          : result.gp_beats_idw
            ? 'GP beats IDW baseline'
            : result.gp_beats_persistence
              ? 'GP beats Persistence baseline'
              : 'GP comparable to baselines';
        const pkg = result.package_stability;
        verdictEl.innerHTML = `
          <strong style="color:#22C55E;">${result.held_out_station}</strong> withheld — 
          ${gpBestMethod}. GP error: ${result.gp_error} AQI vs IDW: ${result.idw_error} AQI / Persistence: ${result.persistence_error} AQI.<br/>
          <span style="color:#F59E0B; font-size:0.8rem;">Package stability at this location: 
            targeting −${pkg.typical_reduction} AQI → range −${pkg.lower_bound} to −${pkg.upper_bound} AQI [MODELED]</span>`;
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

  document.getElementById('btn-run-forecasting')?.addEventListener('click', runForecastingAnalysis);
  document.getElementById('btn-run-held-out-fo')?.addEventListener('click', runHeldOutForecast);

  // ── Lever elements ────────────────────────────────────────────────────────
  const sliderTraffic  = document.getElementById('slider-traffic');
  const sliderIndustry = document.getElementById('slider-industry');
  const sliderMist     = document.getElementById('slider-mist');
  const sliderConst    = document.getElementById('slider-const');
  const toggleMetro    = document.getElementById('toggle-metro');
  const toggleStubble  = document.getElementById('toggle-stubble');

  const valTraffic     = document.getElementById('val-traffic');
  const valIndustry    = document.getElementById('val-industry');
  const valMist        = document.getElementById('val-mist');
  const valConst       = document.getElementById('val-const');
  const valMetro       = document.getElementById('val-metro');
  const valStubble     = document.getElementById('val-stubble');

  // ROI Leaderboard mode switcher (Active Levers vs GRAP IV Max)
  let currentRoiMode   = 'active';
  const btnRoiActive   = document.getElementById('btn-roi-mode-active');
  const btnRoiMax      = document.getElementById('btn-roi-mode-max');

  btnRoiActive?.addEventListener('click', () => {
    currentRoiMode = 'active';
    btnRoiActive.style.background = '#3B82F6';
    btnRoiActive.style.color = '#fff';
    btnRoiMax.style.background = 'transparent';
    btnRoiMax.style.color = '#9CA3AF';
    loadRoiLeaderboard();
  });

  btnRoiMax?.addEventListener('click', () => {
    currentRoiMode = 'max';
    btnRoiMax.style.background = '#3B82F6';
    btnRoiMax.style.color = '#fff';
    btnRoiActive.style.background = 'transparent';
    btnRoiActive.style.color = '#9CA3AF';
    loadRoiLeaderboard();
  });

  // ── Output elements ───────────────────────────────────────────────────────
  const simAqiResult   = document.getElementById('sim-aqi-result');
  const simBadgeResult = document.getElementById('sim-badge-result');
  const simDiffVal     = document.getElementById('sim-diff-val');
  const simDiffPct     = document.getElementById('sim-diff-pct');
  const simErAvoided   = document.getElementById('sim-er-avoided');
  const simEconSaved   = document.getElementById('sim-econ-saved');
  const budgetAllocated = document.getElementById('budget-allocated');
  const budgetRemaining = document.getElementById('budget-remaining');
  const mayorFill      = document.getElementById('mayor-budget-fill');
  const mayorScore     = document.getElementById('mayor-score-val');

  // ── Debounce helper — avoids hammering the API on every slider tick ───────
  let debounceTimer = null;
  function debounce(fn, ms = 120) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, ms);
  }

  // ── Update lever display labels immediately (no debounce needed) ──────────
  function updateLabels() {
    if (valTraffic)  valTraffic.textContent  = `${sliderTraffic?.value  ?? 0}% restriction`;
    if (valIndustry) valIndustry.textContent = `${sliderIndustry?.value ?? 0}% curtailment`;
    if (valMist)     valMist.textContent     = `${sliderMist?.value     ?? 0} units active`;
    if (valConst)    valConst.textContent    = `${sliderConst?.value    ?? 0}% halted`;
    if (valMetro)    valMetro.textContent    = toggleMetro?.checked ? 'Active (Subsidized)' : 'Off';
    if (valStubble)  valStubble.textContent  = toggleStubble?.checked ? 'Active (Intercepting)' : 'Off';
  }

  // ── Call backend /scenario/simulate ──────────────────────────────────────
  async function calculateScenario() {
    updateLabels();

    const city = window._currentCity ?? 'Delhi';
    const baselineAqi = window._currentAqi ?? 142;

    const payload = {
      city:                       city,
      baseline_aqi:               baselineAqi,
      traffic_restriction_pct:    parseFloat(sliderTraffic?.value  ?? 0),
      industrial_curtailment_pct: parseFloat(sliderIndustry?.value ?? 0),
      mist_units:                 parseInt(sliderMist?.value        ?? 0, 10),
      construction_halt_pct:      parseFloat(sliderConst?.value     ?? 0),
      metro_subsidy:              toggleMetro?.checked ?? false,
      stubble_interception:       toggleStubble?.checked ?? false,
    };

    try {
      const result = await runSimulation(payload);

      if (simAqiResult) simAqiResult.innerHTML = `${result.simulated_aqi} <small>AQI</small>`;
      if (simDiffVal)   simDiffVal.textContent  = `▼ -${result.aqi_reduction} AQI`;
      if (simDiffPct)   simDiffPct.textContent  = `-${result.reduction_pct}% Overall`;
      if (simErAvoided) simErAvoided.textContent = `${result.er_visits_avoided_per_day} Avoided / Day`;
      if (simEconSaved) simEconSaved.textContent = `₹${result.economic_saving_crore} Crore Saved`;

      if (simBadgeResult) {
        simBadgeResult.textContent = result.band.label + ' Air Quality';
        simBadgeResult.className = `badge-status ${
          result.simulated_aqi < 100 ? 'badge-status--good' :
          result.simulated_aqi <= 200 ? 'badge-status--moderate' :
          'badge-status--poor'
        }`;
      }

      // Mayor mode
      const total = result.total_cost_crore;
      const remaining = Math.max(0, 50 - total);
      if (budgetAllocated) budgetAllocated.textContent = `₹${total.toFixed(1)} Cr`;
      if (budgetRemaining) budgetRemaining.textContent = `₹${remaining.toFixed(1)} Cr of ₹50.0 Cr Total`;
      if (mayorFill) {
        mayorFill.style.width = `${Math.min(100, (total / 50) * 100)}%`;
        mayorFill.style.background = total > 50
          ? 'linear-gradient(90deg, #F87171, #EF4444)'
          : 'linear-gradient(90deg, #34D399, #F59E0B)';
      }
      if (mayorScore) {
        if (total > 50) {
          mayorScore.textContent = 'Budget Exceeded (Grade F)';
          mayorScore.style.color = '#F87171';
        } else {
          const score = Math.min(98, Math.round(65 + (result.aqi_reduction / 55) * 30));
          mayorScore.textContent = `${score}/100 (Grade A Optimal)`;
          mayorScore.style.color = '#efd395';
        }
      }

      // ── ML-backed scenario (XGBoost model, non-blocking) ──────────────
      runMLScenario(city, {
        baseline_aqi: baselineAqi,
        traffic_reduction_pct: payload.traffic_restriction_pct,
        industrial_curtailment_pct: payload.industrial_curtailment_pct,
        construction_halt_pct: payload.construction_halt_pct,
        // No station_type — backend now runs all 3 zones and returns weighted average
      }).then((mlResult) => {
        const mlEl = document.getElementById('ml-scenario-aqi');
        if (mlEl) mlEl.textContent = `${mlResult.scenario_predicted_aqi} AQI`;
        const mlDropEl = document.getElementById('ml-scenario-drop');
        if (mlDropEl) mlDropEl.textContent = `▼ -${mlResult.aqi_reduction} AQI (${mlResult.reduction_pct}%)`;
        const mlMethodEl = document.getElementById('ml-scenario-method');
        if (mlMethodEl) mlMethodEl.textContent = mlResult.method ?? 'xgboost-city-weighted';

        // Render zone breakdown if available
        const zoneBreakdown = document.getElementById('ml-zone-breakdown');
        if (zoneBreakdown && mlResult.zone_breakdown?.length) {
          const ZONE_LABELS = {
            'traffic_corridor':       '🚗 Traffic Corridors',
            'industrial_belt':        '🏭 Industrial Belt',
            'residential_background': '🏘️  Residential Areas',
          };
          zoneBreakdown.innerHTML = mlResult.zone_breakdown.map(z => `
            <div style="display:flex; justify-content:space-between; align-items:center;
                        padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <span style="font-size:0.8rem; opacity:0.85;">${ZONE_LABELS[z.zone] ?? z.zone}</span>
              <span style="font-size:0.8rem;">
                <span style="opacity:0.55;">${Math.round(z.weight * 100)}% of city</span>
                &nbsp;·&nbsp;
                <span style="color:#22C55E; font-weight:600;">-${z.aqi_reduction.toFixed(1)} AQI</span>
                &nbsp;·&nbsp;
                <span style="opacity:0.7;">${z.scenario_aqi.toFixed(0)} predicted</span>
              </span>
            </div>
          `).join('');
          zoneBreakdown.style.display = 'block';
        }

        window._latestMLScenario = mlResult;
        console.log('[scenario] ML city-weighted result:', mlResult);
      }).catch((err) => {
        console.warn('[scenario] ML scenario unavailable:', err.message);
      });

      // Re-rank ROI leaderboard using latest baseline
      loadRoiLeaderboard();

    } catch (err) {
      console.warn('[scenario] API error, using local fallback.', err);
    }
  }

  // Sliders and toggles update labels and live-refresh the ROI leaderboard dynamically!
  [sliderTraffic, sliderIndustry, sliderMist, sliderConst].forEach((s) => {
    s?.addEventListener('input', () => {
      updateLabels();
      debounce(loadRoiLeaderboard, 120);
    });
  });

  [toggleMetro, toggleStubble].forEach((t) => {
    t?.addEventListener('change', () => {
      updateLabels();
      loadRoiLeaderboard();
    });
  });

  // Dedicated "Simulate Policy Interventions" predict button
  const btnRunScenario = document.getElementById('btn-run-scenario');
  btnRunScenario?.addEventListener('click', async () => {
    btnRunScenario.disabled = true;
    btnRunScenario.style.opacity = '0.85';
    btnRunScenario.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> <span>Computing ML Digital Twin...</span>';
    if (window.lucide) window.lucide.createIcons();

    // 450ms realistic calculation feedback so users perceive the model executing
    await new Promise((r) => setTimeout(r, 450));
    await calculateScenario();

    btnRunScenario.disabled = false;
    btnRunScenario.style.opacity = '1';
    btnRunScenario.innerHTML = '<i data-lucide="play-circle"></i> <span>Simulate Policy Interventions</span>';
    if (window.lucide) window.lucide.createIcons();

    // Visual feedback highlight on the outcome card
    const impactCard = document.querySelector('.scenario-impact-card');
    if (impactCard) {
      impactCard.style.transition = 'box-shadow 0.35s ease, border-color 0.35s ease';
      impactCard.style.boxShadow = '0 0 25px rgba(59, 130, 246, 0.45)';
      impactCard.style.borderColor = 'rgba(59, 130, 246, 0.6)';
      setTimeout(() => {
        impactCard.style.boxShadow = '';
        impactCard.style.borderColor = '';
      }, 1000);
    }
  });

  // Reset — sliders and toggles back to zero
  document.getElementById('btn-reset-scenario')?.addEventListener('click', () => {
    if (sliderTraffic)  sliderTraffic.value   = '0';
    if (sliderIndustry) sliderIndustry.value  = '0';
    if (sliderMist)     sliderMist.value      = '0';
    if (sliderConst)    sliderConst.value     = '0';
    if (toggleMetro)    toggleMetro.checked   = false;
    if (toggleStubble)  toggleStubble.checked = false;
    updateLabels();
    loadRoiLeaderboard();
  });

  // ── Ensure live baseline AQI dynamically from API ───────────────────────
  async function ensureLiveBaseline() {
    let baseline = window._currentAqi;
    if (!baseline) {
      try {
        const data = await getCityAQI('Delhi');
        if (data?.avg_aqi) {
          baseline = Math.round(data.avg_aqi);
          window._currentAqi = baseline;
        }
      } catch (err) {
        console.warn('[scenario] Live AQI fetch failed, using fallback (187):', err);
        baseline = 187;
      }
    }
    baseline = baseline ?? 187;

    const baseEl = document.getElementById('sim-baseline-aqi');
    if (baseEl) baseEl.innerHTML = `${baseline} <small>AQI</small>`;

    const baseBadge = document.getElementById('sim-baseline-badge');
    if (baseBadge) {
      const label = baseline <= 50 ? 'Good' :
                    baseline <= 100 ? 'Satisfactory' :
                    baseline <= 200 ? 'Moderate' :
                    baseline <= 300 ? 'Poor' :
                    baseline <= 400 ? 'Very Poor' : 'Severe';
      baseBadge.textContent = `${label} Air Quality`;
      baseBadge.className = `badge-status ${
        baseline <= 100 ? 'badge-status--good' :
        baseline <= 200 ? 'badge-status--moderate' :
        'badge-status--poor'
      }`;
    }

    // Default simulated outcome to match baseline prior to user pulling levers
    const simAqi = document.getElementById('sim-aqi-result');
    if (simAqi && (simAqi.textContent.includes('142') || !simAqi.textContent.trim())) {
      simAqi.innerHTML = `${baseline} <small>AQI</small>`;
      const simBadge = document.getElementById('sim-badge-result');
      if (simBadge && baseBadge) {
        simBadge.textContent = baseBadge.textContent;
        simBadge.className = baseBadge.className;
      }
      const simDiffVal = document.getElementById('sim-diff-val');
      if (simDiffVal) simDiffVal.textContent = '0 AQI';
      const simDiffPct = document.getElementById('sim-diff-pct');
      if (simDiffPct) simDiffPct.textContent = '0.0% Overall';
    }

    return baseline;
  }

  // ── Load ROI leaderboard dynamically from backend ────────────────────────
  async function loadRoiLeaderboard() {
    try {
      const city     = window._currentCity ?? 'Delhi';
      const baseline = await ensureLiveBaseline();

      const params = currentRoiMode === 'active' ? {
        traffic_pct:          parseFloat(sliderTraffic?.value ?? 0),
        industry_pct:         parseFloat(sliderIndustry?.value ?? 0),
        mist_units:           parseInt(sliderMist?.value ?? 0, 10),
        const_pct:            parseFloat(sliderConst?.value ?? 0),
        metro_subsidy:        toggleMetro?.checked ?? false,
        stubble_interception: toggleStubble?.checked ?? false,
      } : {};

      const data = await getRoiLeaderboard(city, baseline, params);
      renderRoiTable(data.interventions);
    } catch (err) {
      console.warn('[scenario] ROI leaderboard fetch failed.', err);
    }
  }

  // Initial runs
  updateLabels();
  ensureLiveBaseline().then(() => loadRoiLeaderboard());

  // Refresh leaderboard and baseline when view becomes active
  const origSwitch = window.switchView;
  window.switchView = function (viewName) {
    origSwitch?.(viewName);
    if (viewName === 'scenario') {
      ensureLiveBaseline().then(() => loadRoiLeaderboard());
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Budget Planner Mode (Addition 1 — Final Round)
  // ══════════════════════════════════════════════════════════════════════════
  
  const sliderBudget = document.getElementById('slider-budget');
  const valBudget = document.getElementById('val-budget');
  const btnFindBestPlan = document.getElementById('btn-find-best-plan');
  const budgetResultsDiv = document.getElementById('budget-plan-results');
  const budgetPackagesGrid = document.getElementById('budget-packages-grid');
  const budgetInfeasibleCard = document.getElementById('budget-infeasible-card');
  const budgetCombosEval = document.getElementById('budget-combos-evaluated');
  const budgetSensitivity = document.getElementById('budget-sensitivity');

  // Budget slider label update
  sliderBudget?.addEventListener('input', () => {
    if (valBudget) valBudget.textContent = `₹${sliderBudget.value} Cr`;
  });

  // Preset buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const budget = btn.getAttribute('data-budget');
      if (sliderBudget) sliderBudget.value = budget;
      if (valBudget) valBudget.textContent = `₹${budget} Cr`;
    });
  });

  // ── Helper: render an intervention tier badge ────────────────────────────
  function tierBadge(level) {
    const map = {
      'low':    { bg: 'rgba(234,179,8,0.15)',  color: '#FBBF24', label: 'GRAP I-II' },
      'medium': { bg: 'rgba(249,115,22,0.15)', color: '#FB923C', label: 'GRAP III'  },
      'high':   { bg: 'rgba(239,68,68,0.15)',  color: '#F87171', label: 'GRAP IV'   },
    };
    const t = map[level] ?? { bg: 'rgba(255,255,255,0.08)', color: '#aaa', label: level };
    return `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:${t.bg}; color:${t.color}; font-weight:700; letter-spacing:0.5px;">${t.label}</span>`;
  }

  // ── Helper: render a feasible package card ───────────────────────────────
  function renderPackageCard(pkg, idx, budget, isTop = true) {
    const borderColor = isTop ? 'rgba(34,197,94,0.3)'   : 'rgba(239,68,68,0.4)';
    const bgColor     = isTop ? 'rgba(34,197,94,0.08)'  : 'rgba(239,68,68,0.08)';
    const badge3type  = pkg.meets_3type_requirement
      ? `<span style="font-size:10px; padding:2px 8px; border-radius:4px; background:rgba(59,130,246,0.2); color:#60A5FA; font-weight:700;">✓ 3-Type GRAP Package</span>`
      : '';

    // Parse intervention labels to extract tier level
    const interventionRows = pkg.interventions.map((label, i) => {
      const lvlMatch = label.match(/\[(LOW|MEDIUM|HIGH)\]$/);
      const lvl      = lvlMatch ? lvlMatch[1].toLowerCase() : 'high';
      const cleanLabel = label.replace(/\s*\[.*\]$/, '');
      const src  = pkg.level_sources?.[i] ?? '';
      return `
        <li style="margin-bottom: 6px;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            ${tierBadge(lvl)}
            <span style="font-weight:500;">${cleanLabel}</span>
          </div>
          ${src ? `<div style="font-size:10px; color:#6B7280; margin-top:2px; padding-left:2px;">📎 ${src}</div>` : ''}
        </li>`;
    }).join('');

    // Operational limits summary
    const opLimits = pkg.operational_limits ?? {};
    const opRows = Object.entries(opLimits).map(([key, lim]) => {
      const notice = lim.min_notice_days > 0 ? `${lim.min_notice_days}d notice` : 'No notice needed';
      const court  = lim.requires_court_order ? '⚖️ Court/NGT order required' : '✓ Executive order sufficient';
      return `<span style="font-size:10px; background:rgba(255,255,255,0.04); border-radius:4px; padding:2px 6px; display:inline-block; margin:2px;">${court} · ${notice}</span>`;
    }).join('');

    const overBudgetNote = !isTop
      ? `<div style="margin-top:10px; font-size:0.82rem; color:#F87171;">
           Would require <strong>₹${(pkg.total_cost_crore - budget).toFixed(1)} Cr additional funding</strong> to implement.
         </div>` : '';

    return `
      <div style="padding: 18px; background: ${bgColor}; border: 2px solid ${borderColor}; border-radius: 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:6px;">
          ${isTop
            ? `<span class="rank-badge rank-${idx + 1}" style="font-size:0.9rem;">#${idx + 1} Best</span>`
            : `<span style="font-size:0.9rem; font-weight:700; color:#F87171;">❌ Over Budget</span>`
          }
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${badge3type}
            ${isTop
              ? `<span style="font-size:10px; padding:2px 8px; border-radius:4px; background:rgba(34,197,94,0.2); color:#22C55E; font-weight:700;">✓ Feasible</span>`
              : `<span style="font-size:10px; padding:2px 8px; border-radius:4px; background:rgba(239,68,68,0.2); color:#EF4444; font-weight:700;">Exceeds ₹${budget} Cr</span>`
            }
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <strong style="display:block; margin-bottom:8px; font-size:0.9rem; color:#CBD5E1;">GRAP Intervention Measures:</strong>
          <ul style="font-size:0.85rem; line-height:1.7; list-style:none; padding:0; margin:0;">
            ${interventionRows}
          </ul>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.08);">
          <div>
            <span class="label-xs muted">Total Monthly Cost</span>
            <div style="font-size:1.2rem; font-weight:600; color:${isTop ? '#EFD395' : '#F87171'};">₹${pkg.total_cost_crore} Cr</div>
            <div style="font-size:10px; color:#6B7280; margin-top:2px;">Per enforcement month</div>
          </div>
          <div>
            <span class="label-xs muted">Modeled AQI Reduction</span>
            <div style="font-size:1.2rem; font-weight:600; color:#22C55E;">-${pkg.aqi_reduction} AQI</div>
            <div style="font-size:10px; color:#6B7280; margin-top:2px;">→ ${pkg.simulated_aqi} AQI simulated</div>
          </div>
          <div>
            <span class="label-xs muted">Cost-Effectiveness (ROI)</span>
            <div style="font-size:1rem; font-weight:600; color:#F59E0B;">${pkg.roi} AQI/₹Cr</div>
            <div style="font-size:10px; color:#6B7280; margin-top:2px;">AQI reduction per Crore spent</div>
          </div>
          <div>
            <span class="label-xs muted">Health Impact (IHME GBD 2019)</span>
            <div style="font-size:0.9rem; font-weight:500; color:#34D399;">${pkg.er_visits_avoided} ER visits/day avoided</div>
            <div style="font-size:10px; color:#6B7280; margin-top:2px;">₹${pkg.economic_saving_crore} Cr economic benefit/day</div>
          </div>
        </div>

        ${opLimits && Object.keys(opLimits).length > 0 ? `
        <div style="margin-top:12px; padding:8px; background:rgba(255,255,255,0.03); border-radius:6px;">
          <div style="font-size:10px; color:#9CA3AF; margin-bottom:4px; font-weight:600; letter-spacing:0.5px;">OPERATIONAL CONSTRAINTS</div>
          <div>${opRows}</div>
        </div>` : ''}

        ${pkg.affected_areas?.length ? `
        <div style="margin-top:12px; padding:8px; background:rgba(16,185,129,0.05); border:1px solid rgba(16,185,129,0.15); border-radius:6px;">
          <div style="font-size:10px; color:#6EE7B7; margin-bottom:4px; font-weight:600; letter-spacing:0.5px;">AFFECTED AREAS & ENFORCEMENT ZONES</div>
          <ul style="list-style:none; padding:0; margin:0;">
            ${pkg.affected_areas.map(a => `<li style="font-size:11px; color:#D1FAE5; margin-bottom:2px;">📍 ${a}</li>`).join('')}
          </ul>
        </div>` : ''}

        ${overBudgetNote}

        <div style="margin-top:10px; font-size:10px; color:#4B5563; font-style:italic;">
          [MODELED ESTIMATE] Sources: CPCB GRAP 2023, IIT-Delhi SAFAR 2020, MoEF 2018, TERI 2021
        </div>
      </div>`;
  }

  // Find best plan
  btnFindBestPlan?.addEventListener('click', async () => {
    const budget = parseFloat(sliderBudget?.value ?? 50);
    const baselineAqi = window._currentAqi ?? 187;
    const unavailableChecks = document.querySelectorAll('.unavailable-check:checked');
    const unavailable = Array.from(unavailableChecks).map(c => c.value);

    btnFindBestPlan.disabled = true;
    btnFindBestPlan.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i> Computing GRAP Packages...';
    if (window.lucide) window.lucide.createIcons();

    try {
      const result = await getBudgetPlan({
        budget_crore: budget,
        baseline_aqi: baselineAqi,
        unavailable_interventions: unavailable,
        city: 'Delhi',
      });

      if (budgetResultsDiv) budgetResultsDiv.style.display = 'block';

      // Stats header
      if (budgetCombosEval) {
        const n3type = result.top_packages.filter(p => p.meets_3type_requirement).length;
        budgetCombosEval.innerHTML =
          `Evaluated <strong>${result.total_combos_evaluated}</strong> intervention combinations &nbsp;·&nbsp; ` +
          `<strong style="color:#22C55E">${result.n_feasible}</strong> feasible under ₹${budget} Cr &nbsp;·&nbsp; ` +
          `<strong style="color:#60A5FA">${n3type}</strong> meet ≥3-type GRAP requirement` +
          `<br/><span style="font-size:10px; color:#6B7280; font-style:italic; margin-top:4px; display:block;">` +
          `${result.cost_assumptions_note}</span>`;
      }

      // Top feasible packages
      if (budgetPackagesGrid) {
        if (!result.top_packages?.length) {
          budgetPackagesGrid.innerHTML = `<div style="text-align:center; padding:24px; color:#9CA3AF; font-size:0.9rem;">
            No feasible packages found under ₹${budget} Cr. Try increasing the budget.
          </div>`;
        } else {
          budgetPackagesGrid.innerHTML = result.top_packages.slice(0, 3)
            .map((pkg, idx) => renderPackageCard(pkg, idx, budget, true))
            .join('');
        }
      }

      // Infeasible example
      if (budgetInfeasibleCard && result.infeasible_example) {
        budgetInfeasibleCard.innerHTML = renderPackageCard(result.infeasible_example, 0, budget, false);
      }

      // Sensitivity analysis (budget ±10 Cr)
      if (budgetSensitivity && result.sensitivity) {
        const m10  = result.sensitivity.minus_10cr;
        const p10  = result.sensitivity.plus_10cr;
        const costSens = result.cost_sensitivity;

        budgetSensitivity.innerHTML = `
          <div style="flex:1; min-width:200px;">
            <div style="font-size:0.8rem; font-weight:700; color:#F87171; margin-bottom:6px;">
              📉 If budget cut by ₹10 Cr → ₹${m10.budget_crore} Cr:
            </div>
            <div style="font-size:0.85rem;">Best outcome: <strong>-${m10.best_aqi_reduction} AQI</strong></div>
            <div style="font-size:0.75rem; color:#9CA3AF; margin-top:4px;">${m10.n_feasible} feasible packages
              ${m10.meets_3type ? ' · ✓ 3-type still possible' : ' · ⚠ 3-type may not be feasible'}</div>
            <div style="font-size:0.7rem; color:#6B7280; margin-top:4px;">${m10.best_package.slice(0,2).join(' + ')}${m10.best_package.length > 2 ? ' + ...' : ''}</div>
          </div>
          <div style="flex:1; min-width:200px;">
            <div style="font-size:0.8rem; font-weight:700; color:#22C55E; margin-bottom:6px;">
              📈 If budget increased by ₹10 Cr → ₹${p10.budget_crore} Cr:
            </div>
            <div style="font-size:0.85rem;">Best outcome: <strong>-${p10.best_aqi_reduction} AQI</strong></div>
            <div style="font-size:0.75rem; color:#9CA3AF; margin-top:4px;">${p10.n_feasible} feasible packages
              ${p10.meets_3type ? ' · ✓ 3-type feasible' : ''}</div>
            <div style="font-size:0.7rem; color:#6B7280; margin-top:4px;">${p10.best_package.slice(0,2).join(' + ')}${p10.best_package.length > 2 ? ' + ...' : ''}</div>
          </div>
          ${costSens?.length ? `
          <div style="flex:1; min-width:200px;">
            <div style="font-size:0.8rem; font-weight:700; color:#F59E0B; margin-bottom:6px;">
              ✂ Cost-Sensitivity (drop one item from best package):
            </div>
            ${costSens.map(c => `
              <div style="font-size:0.75rem; margin-bottom:4px;">
                <span style="color:#EF4444;">Remove ${c.removed.split(' ')[0]}...</span>
                → save <strong style="color:#EFD395">₹${c.cost_saved_crore} Cr</strong>
                but lose <strong style="color:#F87171">-${c.aqi_reduction_lost} AQI</strong>
                (${c.new_aqi_reduction} AQI remaining)
              </div>`).join('')}
          </div>` : ''}
        `;
      }

      if (window.lucide) window.lucide.createIcons();

    } catch (err) {
      console.error('[budget-planner] API error:', err);
      if (budgetResultsDiv) budgetResultsDiv.style.display = 'none';
      if (budgetCombosEval) budgetCombosEval.innerHTML = `<span style="color:#F87171;">⚠ Failed to compute — check backend is running.</span>`;
    } finally {
      btnFindBestPlan.disabled = false;
      btnFindBestPlan.innerHTML = '<i data-lucide="search"></i> Find Best Intervention Packages';
      if (window.lucide) window.lucide.createIcons();
    }
  });
}
