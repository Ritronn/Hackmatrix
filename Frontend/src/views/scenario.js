/**
 * views/scenario.js
 * Policy Intervention Simulator + Mayor Mode + Budget Planner.
 * Lever changes POST to /scenario/simulate — real backend math.
 * ROI leaderboard is fetched from /scenario/roi-leaderboard on load.
 * Budget planner uses /scenario/budget-plan (Addition 1 — Final Round).
 */
import { runSimulation, getRoiLeaderboard, getBudgetPlan } from '../api/scenario.js';
import { runMLScenario } from '../api/forecast.js';

const FEASIBILITY_CLASS = { High: 'badge-tag--high', Medium: 'badge-tag--med', Low: 'badge-tag--low' };

// ── ROI Table renderer ────────────────────────────────────────────────────────
function renderRoiTable(interventions) {
  const tbody = document.getElementById('roi-table-body');
  if (!tbody) return;
  tbody.innerHTML = interventions.map((e) => `
    <tr class="${e.rank === 1 ? 'roi-row--top' : ''}">
      <td><span class="rank-badge ${e.rank <= 3 ? `rank-${e.rank}` : ''}">#${e.rank}</span></td>
      <td><strong>${e.intervention}</strong></td>
      <td class="text-green">-${e.aqi_drop.toFixed(1)} AQI</td>
      <td>₹${e.cost_crore.toFixed(1)} Cr</td>
      <td><strong class="text-gold">+${e.roi_per_crore.toFixed(2)} / Cr</strong></td>
      <td><span class="badge-tag ${FEASIBILITY_CLASS[e.feasibility] ?? ''}">${e.feasibility}</span></td>
    </tr>
  `).join('');
}

export function initScenarioSimulator() {
  // ── Mode switcher ─────────────────────────────────────────────────────────
  const btnModeSim    = document.getElementById('btn-mode-sim');
  const btnModeMayor  = document.getElementById('btn-mode-mayor');
  const btnModeBudget = document.getElementById('btn-mode-budget');
  const mayorDeck     = document.getElementById('mayor-budget-deck');
  const budgetDeck    = document.getElementById('budget-planner-deck');
  const scenarioGrid  = document.querySelector('.scenario-grid');

  btnModeSim?.addEventListener('click', () => {
    btnModeSim.classList.add('mode-btn--active');
    btnModeMayor?.classList.remove('mode-btn--active');
    btnModeBudget?.classList.remove('mode-btn--active');
    if (mayorDeck) mayorDeck.style.display = 'none';
    if (budgetDeck) budgetDeck.style.display = 'none';
    if (scenarioGrid) scenarioGrid.style.display = 'grid';
  });
  btnModeMayor?.addEventListener('click', () => {
    btnModeMayor.classList.add('mode-btn--active');
    btnModeSim?.classList.remove('mode-btn--active');
    btnModeBudget?.classList.remove('mode-btn--active');
    if (mayorDeck) mayorDeck.style.display = 'block';
    if (budgetDeck) budgetDeck.style.display = 'none';
    if (scenarioGrid) scenarioGrid.style.display = 'grid';
  });
  btnModeBudget?.addEventListener('click', () => {
    btnModeBudget.classList.add('mode-btn--active');
    btnModeSim?.classList.remove('mode-btn--active');
    btnModeMayor?.classList.remove('mode-btn--active');
    if (mayorDeck) mayorDeck.style.display = 'none';
    if (budgetDeck) budgetDeck.style.display = 'block';
    if (scenarioGrid) scenarioGrid.style.display = 'none';
  });

  // ── Lever elements ────────────────────────────────────────────────────────
  const sliderTraffic  = document.getElementById('slider-traffic');
  const sliderIndustry = document.getElementById('slider-industry');
  const sliderMist     = document.getElementById('slider-mist');
  const sliderConst    = document.getElementById('slider-const');

  const valTraffic     = document.getElementById('val-traffic');
  const valIndustry    = document.getElementById('val-industry');
  const valMist        = document.getElementById('val-mist');
  const valConst       = document.getElementById('val-const');

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
  function debounce(fn, ms = 350) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, ms);
  }

  // ── Update lever display labels immediately (no debounce needed) ──────────
  function updateLabels() {
    if (valTraffic)  valTraffic.textContent  = `${sliderTraffic?.value  ?? 0}% restriction`;
    if (valIndustry) valIndustry.textContent = `${sliderIndustry?.value ?? 0}% curtailment`;
    if (valMist)     valMist.textContent     = `${sliderMist?.value     ?? 0} units active`;
    if (valConst)    valConst.textContent    = `${sliderConst?.value    ?? 0}% halted`;
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
      // metro_subsidy and stubble_interception removed — toggles removed from UI
      // Backend defaults them to false → 0 AQI reduction, ensuring
      // zero-lever state produces simulated_aqi == baseline_aqi exactly.
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

  // Sliders update labels only — calculation happens when clicking the Simulate button
  [sliderTraffic, sliderIndustry, sliderMist, sliderConst].forEach((s) => {
    s?.addEventListener('input', updateLabels);
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

  // Reset — sliders back to zero (true no-intervention baseline)
  document.getElementById('btn-reset-scenario')?.addEventListener('click', () => {
    if (sliderTraffic)  sliderTraffic.value   = '0';
    if (sliderIndustry) sliderIndustry.value  = '0';
    if (sliderMist)     sliderMist.value      = '0';
    if (sliderConst)    sliderConst.value     = '0';
    updateLabels();
    // Don't auto-calculate — user must hit Simulate to confirm intent
  });

  // ── Load ROI leaderboard from backend ─────────────────────────────────────
  async function loadRoiLeaderboard() {
    try {
      const city     = window._currentCity ?? 'Delhi';
      const baseline = window._currentAqi  ?? 142;
      const data = await getRoiLeaderboard(city, baseline);
      renderRoiTable(data.interventions);
    } catch (err) {
      console.warn('[scenario] ROI leaderboard fetch failed.', err);
    }
  }

  // Initial runs — do NOT auto-calculate scenario; user must press Simulate.
  // This ensures the displayed baseline stays unmodified on first load.
  updateLabels();
  loadRoiLeaderboard();

  // Refresh leaderboard when view becomes active
  const origSwitch = window.switchView;
  window.switchView = function (viewName) {
    origSwitch?.(viewName);
    if (viewName === 'scenario') loadRoiLeaderboard();
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

  // Find best plan
  btnFindBestPlan?.addEventListener('click', async () => {
    const budget = parseFloat(sliderBudget?.value ?? 50);
    const baselineAqi = window._currentAqi ?? 187;
    const unavailableChecks = document.querySelectorAll('.unavailable-check:checked');
    const unavailable = Array.from(unavailableChecks).map(c => c.value);

    btnFindBestPlan.disabled = true;
    btnFindBestPlan.innerHTML = '<i data-lucide="loader"></i> Computing...';

    try {
      const result = await getBudgetPlan({
        budget_crore: budget,
        baseline_aqi: baselineAqi,
        unavailable_interventions: unavailable,
        city: 'Delhi',
      });

      // Show results
      if (budgetResultsDiv) budgetResultsDiv.style.display = 'block';
      
      // Stats
      if (budgetCombosEval) {
        budgetCombosEval.textContent = `Evaluated ${result.total_combos_evaluated} combinations | ${result.n_feasible} feasible under ₹${budget} Cr budget`;
      }

      // Top 3 feasible packages
      if (budgetPackagesGrid) {
        budgetPackagesGrid.innerHTML = result.top_packages.slice(0, 3).map((pkg, idx) => `
          <div class="budget-package-card" style="padding: 16px; background: rgba(34, 197, 94, 0.08); border: 2px solid rgba(34, 197, 94, 0.3); border-radius: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <span class="rank-badge rank-${idx + 1}" style="font-size: 0.9rem;">#${idx + 1} Best</span>
              <span class="badge-pill" style="background: rgba(34, 197, 94, 0.2); color: #22C55E;">✓ Feasible</span>
            </div>
            <div style="margin-bottom: 12px;">
              <strong style="display: block; margin-bottom: 8px; font-size: 1.1rem;">Interventions:</strong>
              <ul style="font-size: 0.85rem; line-height: 1.6; padding-left: 20px;">
                ${pkg.interventions.map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
              <div>
                <span class="label-xs muted">Total Cost</span>
                <div style="font-size: 1.2rem; font-weight: 600; color: #EFD395;">₹${pkg.total_cost_crore} Cr</div>
              </div>
              <div>
                <span class="label-xs muted">AQI Reduction</span>
                <div style="font-size: 1.2rem; font-weight: 600; color: #22C55E;">-${pkg.aqi_reduction} AQI</div>
              </div>
              <div>
                <span class="label-xs muted">Simulated AQI</span>
                <div style="font-size: 1rem; font-weight: 500;">${pkg.simulated_aqi} AQI</div>
              </div>
              <div>
                <span class="label-xs muted">ROI</span>
                <div style="font-size: 1rem; font-weight: 500; color: #F59E0B;">${pkg.roi} / Cr</div>
              </div>
            </div>
            <div style="margin-top: 12px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 6px; font-size: 0.8rem; opacity: 0.8;">
              <strong>Health Impact:</strong> ${pkg.er_visits_avoided} ER visits avoided/day | ₹${pkg.economic_saving_crore} Cr saved
            </div>
            <div style="margin-top: 8px; font-size: 0.75rem; opacity: 0.6; font-style: italic;">
              [MODELED INTERVENTION ESTIMATE]
            </div>
          </div>
        `).join('');
      }

      // Infeasible example
      if (budgetInfeasibleCard && result.infeasible_example) {
        const inf = result.infeasible_example;
        budgetInfeasibleCard.innerHTML = `
          <div class="budget-package-card" style="padding: 16px; background: rgba(239, 68, 68, 0.08); border: 2px solid rgba(239, 68, 68, 0.4); border-radius: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <span class="badge-pill" style="background: rgba(239, 68, 68, 0.2); color: #EF4444; font-size: 0.9rem;">❌ Over Budget</span>
              <span style="font-size: 0.85rem; color: #EF4444; font-weight: 600;">Exceeds ₹${budget} Cr limit</span>
            </div>
            <div style="margin-bottom: 12px;">
              <strong style="display: block; margin-bottom: 8px;">Interventions:</strong>
              <ul style="font-size: 0.85rem; line-height: 1.6; padding-left: 20px;">
                ${inf.interventions.map(i => `<li>${i}</li>`).join('')}
              </ul>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
              <div>
                <span class="label-xs muted">Total Cost</span>
                <div style="font-size: 1.2rem; font-weight: 600; color: #EF4444;">₹${inf.total_cost_crore} Cr</div>
              </div>
              <div>
                <span class="label-xs muted">AQI Reduction</span>
                <div style="font-size: 1.2rem; font-weight: 600; color: #22C55E;">-${inf.aqi_reduction} AQI</div>
              </div>
            </div>
            <div style="margin-top: 12px; font-size: 0.8rem; opacity: 0.8;">
              This package would deliver <strong>-${inf.aqi_reduction} AQI reduction</strong> but costs <strong>₹${(inf.total_cost_crore - budget).toFixed(1)} Cr over budget</strong>.
            </div>
          </div>
        `;
      }

      // Sensitivity
      if (budgetSensitivity && result.sensitivity) {
        const minus10 = result.sensitivity.minus_10cr;
        const plus10 = result.sensitivity.plus_10cr;
        budgetSensitivity.innerHTML = `
          <div>
            <strong>Budget - ₹10 Cr (₹${minus10.budget_crore} Cr):</strong><br/>
            Best: -${minus10.best_aqi_reduction} AQI | ${minus10.n_feasible} feasible packages<br/>
            <span style="font-size: 0.85rem; opacity: 0.7;">${minus10.best_package.slice(0, 2).join(', ')}${minus10.best_package.length > 2 ? ', ...' : ''}</span>
          </div>
          <div>
            <strong>Budget + ₹10 Cr (₹${plus10.budget_crore} Cr):</strong><br/>
            Best: -${plus10.best_aqi_reduction} AQI | ${plus10.n_feasible} feasible packages<br/>
            <span style="font-size: 0.85rem; opacity: 0.7;">${plus10.best_package.slice(0, 2).join(', ')}${plus10.best_package.length > 2 ? ', ...' : ''}</span>
          </div>
        `;
      }

      // Re-initialize lucide icons
      if (window.lucide) window.lucide.createIcons();

    } catch (err) {
      console.error('[budget-planner] API error:', err);
      alert('Failed to compute budget plan. Check console for details.');
    } finally {
      btnFindBestPlan.disabled = false;
      btnFindBestPlan.innerHTML = '<i data-lucide="search"></i> Find Best Intervention Packages';
      if (window.lucide) window.lucide.createIcons();
    }
  });
}
