(function () {
  'use strict';
  // Theme toggle — self-contained, no dependencies on QAProof namespace
  var app = document.getElementById('qaproof-app');
  var toggleBtn = document.getElementById('qaproof-theme-toggle');
  if (!app || !toggleBtn) return;

  // Restore saved theme
  var savedTheme = localStorage.getItem('qaproof_theme');
  if (savedTheme === 'dark') {
    app.classList.add('qaproof-dark');
  }
  // aria-pressed reflects whether dark theme is currently active. Set once
  // on load so the initial state is announced correctly by screen readers,
  // then kept in sync on every toggle below.
  toggleBtn.setAttribute('aria-pressed', savedTheme === 'dark' ? 'true' : 'false');

  function updateChartColors(isDark) {
    if (typeof Chart === 'undefined' || !Chart.instances) return;
    var textColor  = isDark ? '#f0f3f7' : '#222831';
    var gridColor  = isDark ? 'rgba(238,238,238,0.1)' : 'rgba(0,0,0,0.08)';
    var angleColor = isDark ? 'rgba(238,238,238,0.08)' : 'rgba(0,0,0,0.06)';
    var tickColor  = isDark ? 'rgba(238,238,238,0.5)' : '#9CA3AF';
    var borderCol  = isDark ? '#222831' : '#ffffff';

    Object.values(Chart.instances).forEach(function (chart) {
      if (!chart || !chart.config) return;
      if (chart.config.type === 'radar' && chart.options.scales && chart.options.scales.r) {
        chart.options.scales.r.ticks.color = tickColor;
        chart.options.scales.r.pointLabels.color = textColor;
        chart.options.scales.r.grid.color = gridColor;
        chart.options.scales.r.angleLines.color = angleColor;
      }
      if (chart.config.type === 'doughnut') {
        if (chart.data.datasets[0]) {
          chart.data.datasets[0].borderColor = borderCol;
        }
        if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
          chart.options.plugins.legend.labels.color = textColor;
        }
        if (chart.legend && chart.legend.legendItems) {
          chart.legend.legendItems.forEach(function(item) {
            item.fontColor = textColor;
          });
        }
      }
      chart.update('none');
    });
  }

  // Apply colors after charts are initialized (short delay for DOMContentLoaded timing)
  if (savedTheme === 'dark') {
    setTimeout(function () { updateChartColors(true); }, 100);
  }

  toggleBtn.addEventListener('click', function () {
    app.classList.toggle('qaproof-dark');
    var isDark = app.classList.contains('qaproof-dark');
    document.body.classList.toggle('qaproof-dark-page', isDark);
    localStorage.setItem('qaproof_theme', isDark ? 'dark' : 'light');
    toggleBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    updateChartColors(isDark);
  });
})();
