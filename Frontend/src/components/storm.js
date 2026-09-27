/**
 * components/storm.js
 * Storm intro sequence: clouds → lightning → title reveal → cloud parting → reveal dashboard.
 * Imports WebGL lightning, canvas cloud renderer, and audio thunder synthesizer.
 */
import { LightningRenderer } from '../lib/lightning.js';
import { CloudRenderer } from '../lib/clouds.js';
import { ThunderSoundSynthesizer } from '../lib/thunder.js';

export function initStormSequence() {
  const introEl    = document.getElementById('storm-intro');
  const canvasEl   = document.getElementById('lightning-canvas');
  const cloudsEl   = document.getElementById('clouds-canvas');
  const flashEl    = document.getElementById('storm-flash');
  const titleEl    = document.getElementById('storm-title');
  const fillEl     = document.getElementById('storm-loading-fill');
  const skipBtn    = document.getElementById('storm-skip');
  const replayBtn  = document.getElementById('btn-replay-storm');

  if (!introEl || !canvasEl) return;

  const lightning = new LightningRenderer(canvasEl);
  const clouds    = new CloudRenderer(cloudsEl);
  const sound     = new ThunderSoundSynthesizer();

  // Try auto-play; fall back to first user gesture
  const tryAudio = () => sound.playThunder(0.85);
  tryAudio();
  window.addEventListener('click', tryAudio, { once: true });
  window.addEventListener('keydown', tryAudio, { once: true });

  let timers = [];
  const after = (ms, fn) => { timers.push(setTimeout(fn, ms)); };
  const clear = () => { timers.forEach(clearTimeout); timers = []; };

  function runSequence() {
    clear();
    clouds.reset();
    introEl.classList.remove('storm-intro--hidden', 'clouds-parting');
    introEl.style.opacity = '1';
    introEl.style.pointerEvents = 'auto';
    titleEl?.classList.remove('storm-title-group--visible', 'storm-title-group--fadeout');
    if (fillEl) fillEl.style.width = '0%';
    flashEl?.classList.remove('storm-flash--active');
    lightning.setBurst(0.0, 0.0);

    // Lightning strike at 30% (1560ms)
    after(1560, () => {
      sound.playThunder(1.0);
      lightning.strike(4.5, 1040, (i) => clouds.flash(i * 0.7));
      clouds.flash(3.0);
      if (flashEl) {
        const flashes = [0, 250, 520];
        const clears  = [90, 380, 620];
        flashes.forEach((t) => after(t, () => flashEl.classList.add('storm-flash--active')));
        clears.forEach((t)  => after(t, () => flashEl.classList.remove('storm-flash--active')));
      }
    });

    // Title reveal at 75% (3900ms)
    after(3900, () => {
      titleEl?.classList.add('storm-title-group--visible');
      if (fillEl) fillEl.style.width = '100%';
    });

    // Clouds start parting at 80% (4160ms)
    after(4160, () => {
      introEl.classList.add('clouds-parting');
      clouds.part();
    });

    // Title dissolve at (4850ms)
    after(4850, () => titleEl?.classList.add('storm-title-group--fadeout'));

    // Dashboard reveal at 100% (5200ms)
    after(5200, () => {
      introEl.classList.add('storm-intro--hidden');
      window._dashboardMiniMap?.resize();
      window.resizeWindCanvas?.();
      window._maptilerMap?.resize();
    });
  }

  // If opening a direct subpage like /map, /scenario, /analytics, /accuracy, /settings,
  // hide intro immediately so the user doesn't wait 5s for the subpage.
  const currentPath = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  const isDirectSubpage = currentPath && currentPath !== '' && currentPath !== '/' && currentPath !== '/home' && currentPath !== '/dashboard';

  if (isDirectSubpage) {
    introEl.classList.add('storm-intro--hidden');
    introEl.style.opacity = '0';
    introEl.style.pointerEvents = 'none';
  } else {
    runSequence();
  }

  // Skip button
  skipBtn?.addEventListener('click', () => {
    clear();
    titleEl?.classList.add('storm-title-group--fadeout');
    introEl.classList.add('clouds-parting');
    clouds.part();
    setTimeout(() => {
      introEl.classList.add('storm-intro--hidden');
      window._dashboardMiniMap?.resize();
      window.resizeWindCanvas?.();
      window._maptilerMap?.resize();
    }, 600);
  });

  // Replay button in nav rail
  replayBtn?.addEventListener('click', runSequence);
}
