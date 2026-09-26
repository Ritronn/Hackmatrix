/**
 * views/wards.js
 * Ward-level analytics: filter pills, table row filtering, row selection.
 */
export function initWardsAnalytics() {
  const filterBtns  = document.querySelectorAll('#ward-filter-group .filter-pill');
  const tableRows   = document.querySelectorAll('#wards-table tbody tr');

  // ── Filter pills ──
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('filter-pill--active'));
      btn.classList.add('filter-pill--active');
      const filter = btn.getAttribute('data-filter');
      tableRows.forEach((row) => {
        const cat = row.getAttribute('data-category');
        row.style.display = (filter === 'all' || filter === cat) ? '' : 'none';
      });
    });
  });

  // ── Row selection highlight ──
  tableRows.forEach((row) => {
    row.addEventListener('click', () => {
      tableRows.forEach((r) => r.classList.remove('ward-row--selected'));
      row.classList.add('ward-row--selected');
    });
  });
}
