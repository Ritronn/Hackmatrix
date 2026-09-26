/**
 * views/accuracy.js
 * Model Accuracy & Self-Honesty Tracker view.
 * Currently renders static SVG chart; hook for future Chart.js integration.
 */
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

  // When view-accuracy becomes the active view, play animations
  function onViewSwitch(viewName) {
    if (viewName !== 'accuracy') return;
    steps.forEach((step) => {
      step.style.opacity   = '1';
      step.style.transform = 'translateY(0)';
    });
    chartPaths.forEach((path) => {
      path.style.strokeDashoffset = '0';
    });
  }

  // Patch window.switchView to notify this module
  const originalSwitch = window.switchView;
  window.switchView = function (viewName) {
    originalSwitch?.(viewName);
    onViewSwitch(viewName);
  };
}
