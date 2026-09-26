/**
 * main.js — Atmos Twin entry point
 *
 * Imports split CSS and each feature module.
 * Each module handles its own DOM interactions in isolation.
 */

// ── Styles ──────────────────────────────────────────────
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';
// Full legacy stylesheet (storm intro + all remaining rules) kept as fallback
import './style.css';

// ── Components ──────────────────────────────────────────
import { initStormSequence }    from './components/storm.js';
import { initNavRail }          from './components/nav.js';
import { initGlobalModals }     from './components/modals.js';
import { initAIAdvisor }        from './components/advisor.js';

// ── View Controllers ────────────────────────────────────
import { initHeroCountUp, initMapControls } from './views/dashboard.js';
import { initDigitalTwinMap }               from './views/map.js';
import { initScenarioSimulator }            from './views/scenario.js';
import { initWardsAnalytics }               from './views/wards.js';
import { initAccuracyTracker }              from './views/accuracy.js';
import { initSettingsAndCities }            from './views/settings.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialise Lucide icon set
  if (window.lucide) window.lucide.createIcons();

  // ── Intro sequence ──────────────────────────────────
  initStormSequence();

  // ── Navigation & routing ────────────────────────────
  initNavRail();

  // ── Dashboard ───────────────────────────────────────
  initHeroCountUp(187);
  initMapControls();

  // ── Digital Twin Map ────────────────────────────────
  initDigitalTwinMap();

  // ── Scenario Simulator & Mayor Mode ─────────────────
  initScenarioSimulator();

  // ── Ward Analytics ──────────────────────────────────
  initWardsAnalytics();

  // ── Accuracy Tracker ────────────────────────────────
  initAccuracyTracker();

  // ── Settings & Multi-City ───────────────────────────
  initSettingsAndCities();

  // ── Global modals (Drift, Search, Briefing) ─────────
  initGlobalModals();

  // ── Floating AI Advisor widget ──────────────────────
  initAIAdvisor();
});
