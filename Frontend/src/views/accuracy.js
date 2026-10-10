/**
 * views/accuracy.js
 * Model Accuracy & Self-Honesty Tracker view.
 * Fetches real ML model metrics, lockdown validation, and SHAP explainability artifacts.
 */
import { getModelMetrics, getLockdownValidation, getShapImageUrl } from '../api/forecast.js';

const SHAP_CAPTIONS = {
  all: 'Global SHAP TreeExplainer Summary: 28 features ranked by impact on AQI predictions across all 37 Delhi stations (2015–2020).',
  traffic_corridor: 'Traffic Corridor Stations (ITO, Punjabi Bagh, RK Puram): NO2, NOx, and synthetic traffic proxies dominate predictions.',
  industrial_belt: 'Industrial Belt Stations (Anand Vihar, Wazirpur, Mundka): SO2, industrial curtailment index, and PM ratios drive peak values.',
  residential_background: 'Residential Background Stations: Ambient weather, 7-day rolling lags, and meteorological ventilation define base conditions.',
  pred_vs_actual: 'Out-of-Time Held-Out Fit (Test Set): High correlation along the 1:1 diagonal line validating model calibration.',
};

export function initAccuracyTracker() {
  // Animate accuracy score numbers on view entry
  const accNums = document.querySelectorAll('.acc-metric-num');
  accNums.forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  });

  // Trigger animation when view becomes active
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        accNums.forEach((el, i) => {
          setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
          }, i * 120);
        });
        observer.disconnect();
      }
    });
  }, { threshold: 0.1 });

  const view = document.getElementById('view-accuracy');
  if (view) observer.observe(view);

  // Animate the SVG validation chart path draw-on effect
  const chartPaths = document.querySelectorAll('#view-accuracy .svg-chart-container path[stroke]');
  chartPaths.forEach((path) => {
    const length = path.getTotalLength?.() ?? 800;
    path.style.strokeDasharray  = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    path.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(0.4, 0, 0.2, 1)';
  });

  // Pipeline steps stagger-in
  const steps = document.querySelectorAll('.pipeline-step');
  steps.forEach((step, i) => {
    step.style.opacity   = '0';
    step.style.transform = 'translateY(12px)';
    step.style.transition = `opacity 0.4s ease ${i * 100}ms, transform 0.4s ease ${i * 100}ms`;
  });

  // ── SHAP Gallery Tabs ───────────────────────────────────────────────────
  function initShapGallery() {
    const tabs = document.querySelectorAll('.shap-tab-btn');
    const imgEl = document.getElementById('shap-preview-img');
    const captionEl = document.getElementById('shap-caption');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('shap-tab-btn--active'));
        tab.classList.add('shap-tab-btn--active');
        const type = tab.getAttribute('data-type') || 'all';
        if (imgEl) {
          imgEl.src = getShapImageUrl(type);
        }
        if (captionEl) {
          captionEl.textContent = SHAP_CAPTIONS[type] || '';
        }
      });
    });
  }

  // ── Fetch and display real ML model metrics ────────────────────────────
  async function loadModelMetrics() {
    try {
      const data = await getModelMetrics();
      if (!data || data.error) return;

      const m = data.metrics || {};

      // Populate metric elements if they exist
      const mapping = {
        'acc-mae-t1':             m.mae_t1  != null ? `${m.mae_t1.toFixed(1)} <small>AQI</small>`  : null,
        'acc-rmse-t1':            m.rmse_t1 != null ? `${m.rmse_t1.toFixed(1)} <small>RMSE</small>` : null,
        'acc-coverage':           m.quantile_coverage != null ? `${m.quantile_coverage.toFixed(1)}%` : null,
        'acc-loo-mae':            m.loo_mae != null ? `${m.loo_mae.toFixed(1)} <small>AQI</small>` : null,
        'acc-n-stations':         data.n_stations ? `${data.n_stations} Monitoring Stations` : null,
        'acc-n-train':            data.n_train_rows ? `${data.n_train_rows.toLocaleString()} rows` : null,
        'acc-n-test':             data.n_test_rows ? `${data.n_test_rows.toLocaleString()} held-out rows` : null,
        'acc-data-range':         data.data_range || null,
        'acc-baseline-seasonal':  m.baseline_seasonal_mae ? `${m.baseline_seasonal_mae.toFixed(1)} AQI` : null,
        // Table items
        'tbl-mae-t1':             m.mae_t1 != null ? `${m.mae_t1.toFixed(1)} AQI` : null,
        'tbl-rmse-t1':            m.rmse_t1 != null ? m.rmse_t1.toFixed(1) : null,
        'tbl-mae-t2':             m.mae_t2 != null ? `${m.mae_t2.toFixed(1)} AQI` : null,
        'tbl-rmse-t2':            m.rmse_t2 != null ? m.rmse_t2.toFixed(1) : null,
        'tbl-mae-t3':             m.mae_t3 != null ? `${m.mae_t3.toFixed(1)} AQI` : null,
        'tbl-rmse-t3':            m.rmse_t3 != null ? m.rmse_t3.toFixed(1) : null,
        'tbl-mae-sat':            m.mae_Satisfactory != null ? `${m.mae_Satisfactory.toFixed(1)} AQI` : null,
        'tbl-mae-mod':            m.mae_Moderate != null ? `${m.mae_Moderate.toFixed(1)} AQI` : null,
        'tbl-mae-poor':           m.mae_Poor != null ? `${m.mae_Poor.toFixed(1)} AQI` : null,
        'tbl-mae-sev':            m.mae_Severe != null ? `${m.mae_Severe.toFixed(1)} AQI` : null,
      };

      for (const [id, value] of Object.entries(mapping)) {
        if (value == null) continue;
        const el = document.getElementById(id);
        if (el) el.innerHTML = value;
      }

      // Store globally for advisor context
      window._modelMetrics = data;
      console.log('[accuracy] ML model metrics loaded:', data.model_type);
    } catch (err) {
      console.warn('[accuracy] Could not fetch ML model metrics:', err.message);
    }

    // ── Fetch Lockdown Validation ───────────────────────────────────────────
    try {
      const ld = await getLockdownValidation();
      if (ld) {
        const actualEl = document.getElementById('lockdown-actual-drop');
        const predEl = document.getElementById('lockdown-pred-drop');
        const ratioEl = document.getElementById('lockdown-ratio');
        const statusEl = document.getElementById('lockdown-status');

        if (actualEl && ld.actual_aqi_drop_pct) {
          actualEl.textContent = `${ld.actual_aqi_drop_pct.toFixed(1)}% AQI`;
        }
        if (predEl && ld.model_predicted_drop_pct) {
          predEl.textContent = `-${Math.abs(ld.model_predicted_drop_pct).toFixed(1)}% AQI`;
        }
        if (ratioEl && ld.agreement_ratio) {
          ratioEl.textContent = `${(ld.agreement_ratio * 100).toFixed(1)}% Agreement`;
        }
        if (statusEl && ld.validation_status) {
          statusEl.textContent = ld.validation_status;
        }
      }
    } catch (ldErr) {
      console.warn('[accuracy] Lockdown validation unavailable:', ldErr.message);
    }
  }

  // When view-accuracy becomes the active view, play animations + load metrics
  function onViewSwitch(viewName) {
    if (viewName !== 'accuracy') return;
    steps.forEach((step) => {
      step.style.opacity   = '1';
      step.style.transform = 'translateY(0)';
    });
    chartPaths.forEach((path) => {
      path.style.strokeDashoffset = '0';
    });
    loadModelMetrics();
  }

  // Patch window.switchView to notify this module
  const originalSwitch = window.switchView;
  window.switchView = function (viewName) {
    originalSwitch?.(viewName);
    onViewSwitch(viewName);
  };

  // Init gallery & load metrics on startup
  initShapGallery();
  loadModelMetrics();
}
