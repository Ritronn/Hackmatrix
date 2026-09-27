/**
 * theme-toggle.js — Dark/Light Mode Toggle Component
 * 
 * Provides theme switching functionality with localStorage persistence
 */

export function initThemeToggle() {
  // Apply saved theme or default to dark mode
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Get theme toggle button
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;

  // Update button icon based on current theme
  function updateThemeIcon() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const icon = themeToggle.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', currentTheme === 'dark' ? 'moon' : 'sun');
      // Refresh Lucide icons
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // Initial icon setup
  updateThemeIcon();

  // Toggle theme on button click
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    updateThemeIcon();
  });
}