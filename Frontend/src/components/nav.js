/**
 * components/nav.js
 * Left navigation rail: view switching, active indicator.
 */

/** Duration must match the CSS animation timings in base.css */
const LEAVE_MS  = 220;
const ENTER_MS  = 280;

let _transitioning = false;

export function initNavRail() {
  const buttons = document.querySelectorAll('.rail-btn[data-view]');

  /**
   * Switch to a named view with a buttery-smooth fade + slide transition.
   * Exposed globally so other modules can call window.switchView().
   * @param {string} viewName
   */
  window.switchView = function (viewName) {
    // ── 1. Update nav-rail active indicator immediately ──────────────────
    document.querySelectorAll('.rail-btn[data-view]').forEach((b) => {
      b.classList.toggle('rail-btn--active', b.getAttribute('data-view') === viewName);
    });

    const allViews   = document.querySelectorAll('.app-view');
    const targetView = document.getElementById(`view-${viewName}`);

    // ── 2. Find the currently visible view ───────────────────────────────
    const currentView = [...allViews].find(
      (v) => v.classList.contains('app-view--active') && v !== targetView
    );

    // If already on this view or nothing to animate, do a plain swap
    if (!currentView || _transitioning) {
      allViews.forEach((v) => {
        v.classList.remove('app-view--active', 'app-view--entering', 'app-view--leaving');
      });
      if (targetView) {
        targetView.classList.add('app-view--active');
      }
      _postSwitch(viewName);
      return;
    }

    _transitioning = true;

    // ── 3. LEAVE — animate old view out ──────────────────────────────────
    currentView.classList.add('app-view--leaving');

    setTimeout(() => {
      // Hide the old view
      currentView.classList.remove('app-view--active', 'app-view--leaving');

      // ── 4. ENTER — show & animate new view in ────────────────────────
      if (targetView) {
        targetView.classList.add('app-view--active', 'app-view--entering');

        setTimeout(() => {
          targetView.classList.remove('app-view--entering');
          _transitioning = false;
        }, ENTER_MS);
      } else {
        _transitioning = false;
      }

      _postSwitch(viewName);
    }, LEAVE_MS);
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      if (view) window.switchView(view);
    });
  });
}

/** Side-effects that happen after every view swap */
function _postSwitch(viewName) {
  if (window.lucide) window.lucide.createIcons();

  // Trigger canvas resize if switching to map view
  if (viewName === 'map' && window.resizeWindCanvas) {
    setTimeout(() => window.resizeWindCanvas(), 50);
  }
}

