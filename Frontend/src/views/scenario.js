/**
 * views/scenario.js
 * Policy Intervention Simulator + Mayor Mode.
 * Sliders drive a simple linear model to re-forecast AQI and compute costs.
 */
export function initScenarioSimulator() {
  // ── Mode switcher (What-If vs Mayor Mode) ──
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

  // ── Lever elements ──
  const sliderTraffic   = document.getElementById('slider-traffic');
  const sliderIndustry  = document.getElementById('slider-industry');
  const sliderMist      = document.getElementById('slider-mist');
  const sliderConst     = document.getElementById('slider-const');
  const toggleMetro     = document.getElementById('toggle-metro');
  const toggleStubble   = document.getElementById('toggle-stubble');

  const valTraffic      = document.getElementById('val-traffic');
  const valIndustry     = document.getElementById('val-industry');
  const valMist         = document.getElementById('val-mist');
  const valConst        = document.getElementById('val-const');

  // ── Output elements ──
  const simAqiResult    = document.getElementById('sim-aqi-result');
  const simBadgeResult  = document.getElementById('sim-badge-result');
  const simDiffVal      = document.getElementById('sim-diff-val');
  const simDiffPct      = document.getElementById('sim-diff-pct');
  const simErAvoided    = document.getElementById('sim-er-avoided');
  const simEconSaved    = document.getElementById('sim-econ-saved');

  // ── Mayor Mode elements ──
  const budgetAllocated = document.getElementById('budget-allocated');
  const budgetRemaining = document.getElementById('budget-remaining');
  const mayorFill       = document.getElementById('mayor-budget-fill');
  const mayorScore      = document.getElementById('mayor-score-val');

  const BASELINE = 187;
  const MAX_BUDGET = 50.0;

  function calculateScenario() {
    const trafficVal  = parseInt(sliderTraffic?.value  ?? 30, 10);
    const industryVal = parseInt(sliderIndustry?.value ?? 20, 10);
    const mistVal     = parseInt(sliderMist?.value     ?? 45, 10);
    const constVal    = parseInt(sliderConst?.value    ?? 50, 10);
    const metroOn     = toggleMetro?.checked  ?? true;
    const stubbleOn   = toggleStubble?.checked ?? true;

    // Update label displays
    if (valTraffic)  valTraffic.textContent  = `${trafficVal}% restriction`;
    if (valIndustry) valIndustry.textContent = `${industryVal}% curtailment`;
    if (valMist)     valMist.textContent     = `${mistVal} units active`;
    if (valConst)    valConst.textContent    = `${constVal}% halted`;

    // AQI reductions
    const drops = {
      traffic:  (trafficVal  / 50)  * 22,
      industry: (industryVal / 40)  * 16,
      mist:     (mistVal     / 100) * 12,
      const:    (constVal    / 100) * 8,
      metro:    metroOn   ? 4.5 : 0,
      stubble:  stubbleOn ? 9.5 : 0,
    };
    const totalDrop = Object.values(drops).reduce((a, b) => a + b, 0);
    const simAqi    = Math.max(48, Math.round(BASELINE - totalDrop));
    const dropPct   = ((totalDrop / BASELINE) * 100).toFixed(1);

    // Costs (₹ Crore) — illustrative, clearly labeled in UI
    const costs = {
      traffic:  (trafficVal  / 50)  * 15.0,
      industry: (industryVal / 40)  * 18.0,
      mist:     (mistVal     / 100) * 10.0,
      const:    (constVal    / 100) * 7.0,
      metro:    metroOn   ? 6.0 : 0,
      stubble:  stubbleOn ? 4.0 : 0,
    };
    const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);

    // ── Update outputs ──
    if (simAqiResult) simAqiResult.innerHTML = `${simAqi} <small>AQI</small>`;
    if (simDiffVal)   simDiffVal.textContent  = `▼ -${Math.round(totalDrop)} AQI`;
    if (simDiffPct)   simDiffPct.textContent  = `-${dropPct}% Overall`;

    if (simBadgeResult) {
      if (simAqi < 100) {
        simBadgeResult.textContent = 'Good Air Quality';
        simBadgeResult.className   = 'badge-status badge-status--good';
      } else if (simAqi <= 160) {
        simBadgeResult.textContent = 'Moderate Air Quality';
        simBadgeResult.className   = 'badge-status badge-status--moderate';
      } else {
        simBadgeResult.textContent = 'Poor Air Quality';
        simBadgeResult.className   = 'badge-status badge-status--poor';
      }
    }

    if (simErAvoided) simErAvoided.textContent = `${Math.round(totalDrop * 2.8)} Avoided / Day`;
    if (simEconSaved) simEconSaved.textContent  = `₹${(totalDrop * 0.32).toFixed(1)} Crore Saved`;

    // ── Mayor budget tracker ──
    const remaining = Math.max(0, MAX_BUDGET - totalCost);
    if (budgetAllocated) budgetAllocated.textContent = `₹${totalCost.toFixed(1)} Cr`;
    if (budgetRemaining) budgetRemaining.textContent = `₹${remaining.toFixed(1)} Cr of ₹${MAX_BUDGET} Cr Total`;

    if (mayorFill) {
      const pct = Math.min(100, (totalCost / MAX_BUDGET) * 100);
      mayorFill.style.width      = `${pct}%`;
      mayorFill.style.background = totalCost > MAX_BUDGET
        ? 'linear-gradient(90deg, #F87171, #EF4444)'
        : 'linear-gradient(90deg, #34D399, #F59E0B)';
    }

    if (mayorScore) {
      if (totalCost > MAX_BUDGET) {
        mayorScore.textContent = 'Budget Exceeded (Grade F)';
        mayorScore.style.color = '#F87171';
      } else {
        const score = Math.min(98, Math.round(65 + (totalDrop / 55) * 30));
        mayorScore.textContent = `${score}/100 (Grade A Optimal)`;
        mayorScore.style.color = '#efd395';
      }
    }
  }

  // Bind all lever inputs
  [sliderTraffic, sliderIndustry, sliderMist, sliderConst].forEach((s) =>
    s?.addEventListener('input', calculateScenario)
  );
  toggleMetro?.addEventListener('change', calculateScenario);
  toggleStubble?.addEventListener('change', calculateScenario);

  // Reset to baseline
  document.getElementById('btn-reset-scenario')?.addEventListener('click', () => {
    if (sliderTraffic)  sliderTraffic.value  = '30';
    if (sliderIndustry) sliderIndustry.value = '20';
    if (sliderMist)     sliderMist.value     = '45';
    if (sliderConst)    sliderConst.value    = '50';
    if (toggleMetro)    toggleMetro.checked  = true;
    if (toggleStubble)  toggleStubble.checked = true;
    calculateScenario();
  });

  // Initial run
  calculateScenario();
}
