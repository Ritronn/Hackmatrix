/**
 * main.js — Atmos Twin entry point
 *
 * 1. Loads all HTML partials into their slot containers.
 * 2. Initialises Lucide icons on the freshly-injected markup.
 * 3. Boots every feature module in the correct order.
 */

// ── Styles ──────────────────────────────────────────────
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';
import './style.css';

// ── Partial loader ───────────────────────────────────────
import { loadAllPartials } from './loader.js';

// ── Components ──────────────────────────────────────────
import { initStormSequence }  from './components/storm.js';
import { initNavRail }        from './components/nav.js';
import { initGlobalModals }   from './components/modals.js';
import { initAIAdvisor }      from './components/advisor.js';

// ── View Controllers ────────────────────────────────────
import { initMapControls, loadCityData } from './views/dashboard.js';
import { initDigitalTwinMap }            from './views/map.js';
import { initScenarioSimulator }         from './views/scenario.js';
import { initWardsAnalytics }            from './views/wards.js';
import { initAccuracyTracker }           from './views/accuracy.js';
import { initSettingsAndCities }         from './views/settings.js';
import { initRouter }                    from './router.js';

document.addEventListener('DOMContentLoaded', async () => {
  // ── 1. Inject all partials into their slot containers ──
  await loadAllPartials();

  // ── 2. Re-run Lucide on the freshly-injected markup ────
  if (window.lucide) window.lucide.createIcons();

  // ── 3. Intro sequence ───────────────────────────────────
  initStormSequence();

  // ── 4. Navigation & routing ─────────────────────────────
  initNavRail();

  // ── 5. Dashboard — fetch live data ──────────────────────
  initMapControls();
  loadCityData('Pune');

  // ── 6. Digital Twin Map ─────────────────────────────────
  initDigitalTwinMap();

  // ── 7. Scenario Simulator & Mayor Mode ──────────────────
  initScenarioSimulator();

  // ── 8. Ward Analytics ───────────────────────────────────
  initWardsAnalytics();

  // ── 9. Accuracy Tracker ─────────────────────────────────
  initAccuracyTracker();

  // ── 10. Settings & Multi-City ───────────────────────────
  initSettingsAndCities();

  // ── 11. Global modals (Drift, Search, Briefing) ─────────
  initGlobalModals();

  // ── 12. Floating AI Advisor widget ──────────────────────
  initAIAdvisor();

  // ── 13. Page-based URL Router ───────────────────────────
  initRouter();
});
