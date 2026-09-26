/**
 * loader.js
 * Fetches all HTML partials from /public/partials/ and injects them into
 * their placeholder slot containers before the app boots.
 *
 * Partials live in public/partials/ so they are served as static assets
 * in both Vite dev server and production builds.
 */

const PARTIALS = [
  { url: '/partials/storm.html',          target: '#slot-storm'      },
  { url: '/partials/view-dashboard.html', target: '#slot-dashboard'  },
  { url: '/partials/view-map.html',       target: '#slot-map'        },
  { url: '/partials/view-scenario.html',  target: '#slot-scenario'   },
  { url: '/partials/view-wards.html',     target: '#slot-wards'      },
  { url: '/partials/view-accuracy.html',  target: '#slot-accuracy'   },
  { url: '/partials/view-settings.html',  target: '#slot-settings'   },
  { url: '/partials/modals.html',         target: '#slot-modals'     },
  { url: '/partials/ai-advisor.html',     target: '#slot-ai-advisor' },
];

async function loadPartial({ url, target }) {
  const el = document.querySelector(target);
  if (!el) {
    console.warn(`[loader] Target not found: ${target}`);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[loader] Failed to fetch ${url}: ${res.status}`);
  el.innerHTML = await res.text();
}

export async function loadAllPartials() {
  await Promise.all(PARTIALS.map(loadPartial));
}
