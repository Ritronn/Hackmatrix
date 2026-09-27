/**
 * router.js — Client-side SPA Router for Atmos Twin
 *
 * Provides page-based URL routing:
 *   http://localhost:5173/ or /home     -> Dashboard (Home)
 *   http://localhost:5173/map           -> Spatial Digital Twin Map
 *   http://localhost:5173/scenario      -> Scenario Simulator & Policy ROI
 *   http://localhost:5173/analytics     -> Ward Analytics & Hotspots
 *   http://localhost:5173/accuracy      -> AI Forecast Accuracy Tracker
 *   http://localhost:5173/settings      -> System Settings & Multi-City Switcher
 */

export const ROUTES = {
  '/': 'dashboard',
  '/home': 'dashboard',
  '/dashboard': 'dashboard',
  '/map': 'map',
  '/scenario': 'scenario',
  '/analytics': 'wards',
  '/wards': 'wards',
  '/accuracy': 'accuracy',
  '/settings': 'settings',
};

export const VIEW_TO_PATH = {
  dashboard: '/home',
  map: '/map',
  scenario: '/scenario',
  wards: '/analytics',
  accuracy: '/accuracy',
  settings: '/settings',
};

export const VIEW_TITLES = {
  dashboard: 'Atmos Twin — Environmental Dashboard',
  map: 'Atmos Twin — Spatial Map & Dispersion Twin',
  scenario: 'Atmos Twin — Scenario Simulator & Policy ROI',
  wards: 'Atmos Twin — Ward Analytics & Hotspots',
  accuracy: 'Atmos Twin — AI Forecast Accuracy Tracker',
  settings: 'Atmos Twin — Settings & Multi-City Switcher',
};

let isPopStateNavigation = false;

/**
 * Normalizes a pathname string (removes query/hash, trailing slashes, lowers case).
 */
export function normalizePath(path = '') {
  const clean = path.split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase();
  return clean === '' ? '/' : clean;
}

/**
 * Maps a URL pathname to the internal view identifier.
 */
export function getViewFromPath(pathname = window.location.pathname) {
  const norm = normalizePath(pathname);
  return ROUTES[norm] || 'dashboard';
}

/**
 * Returns canonical URL path for a view name.
 */
export function getPathForView(viewName) {
  return VIEW_TO_PATH[viewName] || '/home';
}

/**
 * Programmatically navigate to a URL path.
 */
export function navigateTo(path, pushHistory = true) {
  const viewName = getViewFromPath(path);
  const targetPath = getPathForView(viewName);

  if (pushHistory && normalizePath(window.location.pathname) !== normalizePath(targetPath)) {
    window.history.pushState({ view: viewName }, '', targetPath);
  }

  if (VIEW_TITLES[viewName]) {
    document.title = VIEW_TITLES[viewName];
  }

  if (window.switchView) {
    window.switchView(viewName);
  }
}

/**
 * Initializes routing and synchronizes browser history and window.switchView.
 */
export function initRouter() {
  const originalSwitch = window.switchView;

  // Intercept window.switchView to keep the URL in sync automatically
  window.switchView = function (viewName) {
    // 1. Run the entire view switch chain (active classes, maps, data loaders)
    originalSwitch?.(viewName);

    // 2. Sync URL and Title if not caused by back/forward navigation
    const targetPath = getPathForView(viewName);
    const currentNorm = normalizePath(window.location.pathname);
    const targetNorm = normalizePath(targetPath);

    if (!isPopStateNavigation) {
      if (currentNorm !== targetNorm && !(currentNorm === '/' && targetNorm === '/home')) {
        window.history.pushState({ view: viewName }, '', targetPath);
      }
    }

    if (VIEW_TITLES[viewName]) {
      document.title = VIEW_TITLES[viewName];
    }
  };

  // Expose navigateTo globally
  window.navigateTo = navigateTo;

  // Listen to browser Back / Forward buttons
  window.addEventListener('popstate', () => {
    isPopStateNavigation = true;
    try {
      const targetView = getViewFromPath(window.location.pathname);
      if (window.switchView) {
        window.switchView(targetView);
      }
    } finally {
      isPopStateNavigation = false;
    }
  });

  // Intercept standard relative links with href starting with /
  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href^="/"]');
    if (!anchor) return;
    if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

    const href = anchor.getAttribute('href');
    if (href && href.startsWith('/')) {
      e.preventDefault();
      navigateTo(href);
    }
  });

  // Clicking Atmos brand logo in nav rail goes to /home
  const brandLogo = document.querySelector('.nav-rail__brand');
  if (brandLogo) {
    brandLogo.style.cursor = 'pointer';
    brandLogo.addEventListener('click', () => {
      navigateTo('/home');
    });
  }

  // 3. Resolve initial route on first page boot
  const initialNorm = normalizePath(window.location.pathname);
  const initialView = getViewFromPath(initialNorm);

  if (initialView !== 'dashboard') {
    // Switch to target view (e.g. /map, /scenario, /analytics, /accuracy, /settings)
    window.switchView(initialView);
  } else {
    // Already on dashboard — ensure title is set
    document.title = VIEW_TITLES.dashboard;
  }
}
