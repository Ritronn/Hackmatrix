/**
 * views/scenario.js
 * Policy Intervention Simulator + Mayor Mode.
 * Lever changes POST to /scenario/simulate — real backend math.
 * ROI leaderboard is fetched from /scenario/roi-leaderboard on load.
 */
import { runSimulation, getRoiLeaderboard } from '../api/scenario.js';

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
  const btnModeSim   = document.getElementById('btn-mode-sim');
  const btnModeMayor = document.getElementById('btn-mode-mayor');
  const mayorDeck    = document.getElementById('mayor-budget-deck');

  btnModeSim?.addEventListener('click', () => {
    btnModeSim.classList.add('mode-btn--active');
    btnModeMayor?.classList.remove('mode-btn--active');
    if (mayorDeck) mayorDeck.style.display = 'none';
  });
  btnModeMayor?.addEventListener('click', () => {
    btnModeMayor.classList.add('mode-btn--active');
    btnModeSim?.classList.remove('mode-btn--active');
    if (mayorDeck) mayorDeck.style.display = 'block';
  });

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

    const payload = {
      city:                       window._currentCity ?? 'Pune',
      baseline_aqi:               window._currentAqi  ?? 142,
      traffic_restriction_pct:    parseFloat(sliderTraffic?.value  ?? 30),
      industrial_curtailment_pct: parseFloat(sliderIndustry?.value ?? 20),
      mist_units:                 parseInt(sliderMist?.value        ?? 45, 10),
      construction_halt_pct:      parseFloat(sliderConst?.value     ?? 50),
      metro_subsidy:              toggleMetro?.checked  ?? true,
      stubble_interception:       toggleStubble?.checked ?? true,
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
    } catch (err) {
      console.warn('[scenario] API error, using local fallback.', err);
    }
  }

  // Bind lever inputs — label updates instantly, API call debounced
  [sliderTraffic, sliderIndustry, sliderMist, sliderConst].forEach((s) => {
    s?.addEventListener('input', () => { updateLabels(); debounce(calculateScenario); });
  });
  toggleMetro?.addEventListener('change', () => debounce(calculateScenario));
  toggleStubble?.addEventListener('change', () => debounce(calculateScenario));

  // Reset
  document.getElementById('btn-reset-scenario')?.addEventListener('click', () => {
    if (sliderTraffic)  sliderTraffic.value   = '30';
    if (sliderIndustry) sliderIndustry.value  = '20';
    if (sliderMist)     sliderMist.value      = '45';
    if (sliderConst)    sliderConst.value     = '50';
    if (toggleMetro)    toggleMetro.checked   = true;
    if (toggleStubble)  toggleStubble.checked = true;
    calculateScenario();
  });

  // ── Load ROI leaderboard from backend ─────────────────────────────────────
  async function loadRoiLeaderboard() {
    try {
      const city     = window._currentCity ?? 'Pune';
      const baseline = window._currentAqi  ?? 142;
      const data = await getRoiLeaderboard(city, baseline);
      renderRoiTable(data.interventions);
    } catch (err) {
      console.warn('[scenario] ROI leaderboard fetch failed.', err);
    }
  }

  // Initial runs
  calculateScenario();
  loadRoiLeaderboard();

  // Refresh leaderboard when view becomes active
  const origSwitch = window.switchView;
  window.switchView = function (viewName) {
    origSwitch?.(viewName);
    if (viewName === 'scenario') loadRoiLeaderboard();
  };
}
