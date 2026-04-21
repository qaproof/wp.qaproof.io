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

  toggleBtn.addEventListener('click', function () {
    app.classList.toggle('qaproof-dark');
    var isDark = app.classList.contains('qaproof-dark');
    document.body.classList.toggle('qaproof-dark-page', isDark);
    localStorage.setItem('qaproof_theme', isDark ? 'dark' : 'light');

    // Update Chart.js instances if any exist (re-color for theme)
    if (typeof Chart !== 'undefined' && Chart.instances) {
      var textColor = isDark ? '#EEEEEE' : '#374151';
      var gridColor = isDark ? 'rgba(238,238,238,0.1)' : 'rgba(0,0,0,0.08)';
      var angleColor = isDark ? 'rgba(238,238,238,0.08)' : 'rgba(0,0,0,0.06)';
      var tickColor = isDark ? 'rgba(238,238,238,0.5)' : '#9CA3AF';
      var borderCol = isDark ? '#222831' : '#ffffff';

      Object.values(Chart.instances).forEach(function (chart) {
        if (!chart || !chart.config) return;
        // Radar chart
        if (chart.config.type === 'radar' && chart.options.scales && chart.options.scales.r) {
          chart.options.scales.r.ticks.color = tickColor;
          chart.options.scales.r.pointLabels.color = textColor;
          chart.options.scales.r.grid.color = gridColor;
          chart.options.scales.r.angleLines.color = angleColor;
        }
        // Donut chart
        if (chart.config.type === 'doughnut') {
          if (chart.data.datasets[0]) {
            chart.data.datasets[0].borderColor = borderCol;
          }
          if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
            chart.options.plugins.legend.labels.color = textColor;
          }
        }
        chart.update('none');
      });
    }
  });
})();
