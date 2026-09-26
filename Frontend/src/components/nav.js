/**
 * components/nav.js
 * Left navigation rail: view switching, active indicator.
 */
export function initNavRail() {
  const buttons = document.querySelectorAll('.rail-btn[data-view]');
  const views   = document.querySelectorAll('.app-view');

  /**
   * Switch to a named view and update nav active state.
   * Exposed globally so other modules can call window.switchView().
   * @param {string} viewName
   */
  window.switchView = function (viewName) {
    buttons.forEach((b) => {
      b.classList.toggle('rail-btn--active', b.getAttribute('data-view') === viewName);
    });
    views.forEach((v) => {
      v.classList.toggle('app-view--active', v.id === `view-${viewName}`);
    });

    if (window.lucide) window.lucide.createIcons();

    // Trigger canvas resize if switching to map view
    if (viewName === 'map' && window.resizeWindCanvas) {
      setTimeout(() => window.resizeWindCanvas(), 50);
    }
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      if (view) window.switchView(view);
    });
  });
}
