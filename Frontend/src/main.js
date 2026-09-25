/**
 * Atmos Twin — Dashboard Main Script
 * Handles UI interactions, live clock, map visualization,
 * wind particles, and entrance animations.
 */
import './style.css';

// ─── Initialize Lucide Icons ───
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  initClock();
  initAlertBanner();
  initNavigation();
  initChipToggles();
  initTimeSlider();
  initStationMarkers();
  initWindParticles();
  initHeroCountUp();
  initMapHover();
});

// ─── Live Clock ───
function initClock() {
  const clockEl = document.getElementById('live-clock');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-IN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  update();
  setInterval(update, 1000);
}

// ─── Alert Banner Dismiss ───
function initAlertBanner() {
  const closeBtn = document.getElementById('alert-close');
  const banner = document.getElementById('alert-banner');
  if (!closeBtn || !banner) return;

  closeBtn.addEventListener('click', () => {
    banner.style.animation = 'slideDown 0.2s ease reverse forwards';
    setTimeout(() => banner.classList.add('alert-banner--hidden'), 200);
  });
}

// ─── Sidebar Navigation ───
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach((n) => n.classList.remove('nav-item--active'));
      item.classList.add('nav-item--active');
    });
  });
}

// ─── Chip Toggles (Map pollutant selector) ───
function initChipToggles() {
  const chips = document.querySelectorAll('.chip-group .chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
    });
  });
}

// ─── Time Slider ───
function initTimeSlider() {
  const slider = document.getElementById('time-slider');
  const display = document.getElementById('time-display');
  const playBtn = document.getElementById('time-play');
  if (!slider || !display) return;

  let playing = false;
  let playInterval = null;

  slider.addEventListener('input', () => {
    const val = parseInt(slider.value);
    display.textContent = formatTimeLabel(val);
  });

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      playing = !playing;
      const icon = playBtn.querySelector('i');

      if (playing) {
        icon.setAttribute('data-lucide', 'pause');
        if (window.lucide) window.lucide.createIcons();
        
        playInterval = setInterval(() => {
          let val = parseInt(slider.value);
          val += 1;
          if (val > 240) {
            val = 0;
          }
          slider.value = val;
          display.textContent = formatTimeLabel(val);
        }, 100);
      } else {
        icon.setAttribute('data-lucide', 'play');
        if (window.lucide) window.lucide.createIcons();
        clearInterval(playInterval);
      }
    });
  }
}

function formatTimeLabel(hourIndex) {
  // 0–167 = past 7 days, 168 = now, 169–240 = future 3 days
  const diff = hourIndex - 168;
  if (diff === 0) return 'Now';

  const absDiff = Math.abs(diff);
  const days = Math.floor(absDiff / 24);
  const hours = absDiff % 24;

  let label = '';
  if (days > 0) label += `${days}d `;
  if (hours > 0) label += `${hours}h`;

  return diff < 0 ? `-${label.trim()}` : `+${label.trim()}`;
}

// ─── Station Markers on Map ───
function initStationMarkers() {
  const container = document.getElementById('station-markers');
  if (!container) return;

  const stations = [
    { x: '18%', y: '35%', aqi: 142, name: 'Rohini' },
    { x: '35%', y: '42%', aqi: 187, name: 'ITO' },
    { x: '28%', y: '58%', aqi: 165, name: 'Dwarka' },
    { x: '52%', y: '30%', aqi: 210, name: 'Anand Vihar' },
    { x: '65%', y: '48%', aqi: 178, name: 'Noida Sec-62' },
    { x: '45%', y: '65%', aqi: 155, name: 'Faridabad' },
    { x: '72%', y: '25%', aqi: 130, name: 'Ghaziabad' },
    { x: '80%', y: '55%', aqi: 148, name: 'Greater Noida' },
    { x: '40%', y: '20%', aqi: 195, name: 'Bawana' },
    { x: '55%', y: '75%', aqi: 162, name: 'Manesar' },
  ];

  stations.forEach((s) => {
    const marker = document.createElement('div');
    marker.className = 'station-marker';
    marker.style.left = s.x;
    marker.style.top = s.y;
    marker.style.backgroundColor = getAqiColor(s.aqi);
    marker.title = `${s.name}: AQI ${s.aqi}`;
    container.appendChild(marker);
  });
}

function getAqiColor(aqi) {
  if (aqi <= 50) return '#4CAF50';
  if (aqi <= 100) return '#8BC34A';
  if (aqi <= 150) return '#FFC107';
  if (aqi <= 200) return '#FF9800';
  if (aqi <= 300) return '#F44336';
  return '#7B1FA2';
}

// ─── Wind Particle Animation ───
function initWindParticles() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;

  const mapPlaceholder = canvas.querySelector('.map-placeholder');
  if (!mapPlaceholder) return;

  const PARTICLE_COUNT = 60;
  const particles = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = document.createElement('div');
    p.className = 'wind-particle';
    p.style.left = `${Math.random() * 100}%`;
    p.style.top = `${Math.random() * 100}%`;
    p.style.opacity = 0.15 + Math.random() * 0.35;
    p.style.width = `${1.5 + Math.random() * 2}px`;
    p.style.height = p.style.width;
    mapPlaceholder.appendChild(p);

    particles.push({
      el: p,
      x: Math.random() * 100,
      y: Math.random() * 100,
      speed: 0.02 + Math.random() * 0.06,
      drift: -0.01 + Math.random() * 0.02,
    });
  }

  function animate() {
    particles.forEach((p) => {
      p.x += p.speed; // wind goes roughly east (NW → SE)
      p.y += p.drift;

      if (p.x > 102) {
        p.x = -2;
        p.y = Math.random() * 100;
      }
      if (p.y < -2) p.y = 102;
      if (p.y > 102) p.y = -2;

      p.el.style.left = `${p.x}%`;
      p.el.style.top = `${p.y}%`;
    });
    requestAnimationFrame(animate);
  }
  animate();
}

// ─── Hero AQI Count-Up Animation ───
function initHeroCountUp() {
  const aqiEl = document.getElementById('hero-aqi');
  if (!aqiEl) return;

  const target = parseInt(aqiEl.textContent);
  const duration = 1200;
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    aqiEl.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── Map Hover Glow ───
function initMapHover() {
  const mapCanvas = document.getElementById('map-canvas');
  if (!mapCanvas) return;

  const placeholder = mapCanvas.querySelector('.map-placeholder');
  if (!placeholder) return;

  // Add a glow follower
  const glow = document.createElement('div');
  glow.style.cssText = `
    position: absolute;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(61, 214, 245, 0.06) 0%, transparent 70%);
    pointer-events: none;
    transition: left 0.1s ease, top 0.1s ease;
    transform: translate(-50%, -50%);
    z-index: 5;
  `;
  placeholder.appendChild(glow);

  mapCanvas.addEventListener('mousemove', (e) => {
    const rect = mapCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    glow.style.left = `${x}px`;
    glow.style.top = `${y}px`;
    glow.style.opacity = '1';
  });

  mapCanvas.addEventListener('mouseleave', () => {
    glow.style.opacity = '0';
  });
}
