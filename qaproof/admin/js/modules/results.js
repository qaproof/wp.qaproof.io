/**
 * QAProof — Results Rendering Module
 *
 * All rendering-related code for test results: score rings, charts, markers,
 * fidelity / responsive / accessibility / design-audit renderers, categories,
 * differences, recommendations, tooltips, filters, device tabs, sync scroll,
 * and toolbar helpers.
 *
 * Depends on: QAProof namespace (window.QAProof) with utility helpers and
 * shared state initialised by the core admin.js bootstrap.
 */
(function () {
  'use strict';

  var Q = window.QAProof;
  var S = Q.state;

  // ============================
  // Category Descriptions
  // ============================
  var categoryDescriptions = {
    // Fidelity
    layout: 'Evaluates structural alignment, grid positioning, and element placement accuracy',
    colors: 'Checks color accuracy, gradient matching, and background consistency',
    typography: 'Compares font sizes, weights, line heights, and text styling',
    spacing: 'Measures padding, margins, gaps, and overall dimensional accuracy',
    components: 'Reviews buttons, inputs, cards, icons, and interactive element fidelity',
    // Responsive
    layout_adaptation: 'How well the layout restructures across viewport sizes',
    typography_scaling: 'Font size adjustments and readability at different breakpoints',
    touch_targets: 'Button and link sizes suitable for touch interaction on mobile',
    images_media: 'Image scaling, aspect ratios, and media query responsiveness',
    navigation: 'Menu adaptation, hamburger menus, and navigation usability',
    content_overflow: 'Text truncation, horizontal scrolling, and content clipping issues',
    // Accessibility
    color_contrast: 'WCAG 2.1 AA contrast ratios between text and backgrounds',
    text_readability: 'Font sizes, line spacing, and overall text legibility',
    form_labels: 'Proper label associations, placeholders, and input accessibility',
    heading_hierarchy: 'Correct heading order (h1→h2→h3) and semantic structure',
    focus_indicators: 'Visible focus outlines for keyboard navigation',
    spacing_layout: 'Touch spacing, element grouping, and visual hierarchy',
    images: 'Alt text presence, decorative image handling, and image descriptions',
    // Regression
    styling: 'CSS changes including colors, borders, shadows, and visual properties',
    // Design Audit
    color_consistency: 'How well colors align with a consistent, intentional palette',
    typography_system: 'Font family and size scale consistency and harmony',
    spacing_system: 'Margin and padding values following a modular scale (4px grid)',
    component_consistency: 'UI components (buttons, cards, forms) look unified',
    visual_hierarchy: 'Clear visual distinction between element importance levels',
  };

  // ============================
  // Score Ring SVG helper
  // ============================
  function getScoreLevelText(score) {
    if (score == null) return '';
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    return 'Needs Work';
  }

  function buildBackButtonHtml() {
    return '<div class="qaproof-back-nav">' +
      '<button type="button" class="qaproof-back-btn" id="qaproof-back-to-form">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
        '<span>Back to Test</span>' +
      '</button>' +
    '</div>';
  }

  function buildScoreRingHtml(score, label, scoreClass) {
    var circumference = 2 * Math.PI * 42; // r=42
    var offset = circumference - (score / 100) * circumference;
    var levelText = getScoreLevelText(score);
    var html = '';
    html += '<div class="qaproof-score-ring-row">';
    html += '  <div class="qaproof-score-ring-wrap">';
    html += '    <svg viewBox="0 0 100 100">';
    html += '      <circle class="qaproof-score-ring-bg" cx="50" cy="50" r="42" />';
    html += '      <circle class="qaproof-score-ring-fill ' + scoreClass + '" cx="50" cy="50" r="42"';
    html += '        stroke-dasharray="' + circumference.toFixed(3) + '"';
    html += '        stroke-dashoffset="' + offset.toFixed(3) + '" />';
    html += '    </svg>';
    html += '    <div class="qaproof-score-ring-inner">';
    html += '      <div class="qaproof-overall-score ' + scoreClass + '">' + (score != null ? score : '—') + '</div>';
    html += '      <div class="qaproof-score-out-of">/ 100</div>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div class="qaproof-score-level ' + scoreClass + '">';
    html += '    <span class="qaproof-score-level-dot ' + scoreClass + '"></span>';
    html += '    <span class="qaproof-score-level-text">' + levelText + '</span>';
    html += '  </div>';
    html += '</div>';
    return html;
  }

  // ============================
  // Parse Warning Banner
  // ============================

  /**
   * Show a warning banner when AI analysis data is empty or parsing failed.
   * This helps users understand why they see 0 issues / 0% pass rate.
   */
  function buildParseWarningHtml(data) {
    var categories = data.categories || {};
    var catCount = Object.keys(categories).length;
    var hasDiffs = (data.differences || []).length > 0;

    // Explicit parse failure from backend
    if (data._parseFailed) {
      return '<div class="qaproof-parse-warning">' +
        '<span class="dashicons dashicons-warning"></span> ' +
        '<strong>Analysis incomplete:</strong> The AI response could not be fully parsed. ' +
        'Category scores and some details may be missing. Please try running the test again.' +
        (data._rawPreview ? '<br><small style="opacity:0.7">Debug: ' + Q.escapeHtml(data._rawPreview.substring(0, 120)) + '...</small>' : '') +
        '</div>';
    }

    // Empty categories without explicit flag (e.g., old data)
    if (catCount === 0 && !hasDiffs && data.score == null) {
      return '<div class="qaproof-parse-warning">' +
        '<span class="dashicons dashicons-warning"></span> ' +
        '<strong>No analysis data available.</strong> The AI analysis may have failed to produce results. ' +
        'Try running the test again.' +
        '</div>';
    }

    return '';
  }

  // ============================
  // Report Charts & Statistics
  // ============================
  function buildReportStatsHtml(data, containerId) {
    var differences = data.differences || [];
    var categories = data.categories || {};
    var catEntries = Object.entries(categories);

    // Calculate stats
    var highCount = 0, medCount = 0, lowCount = 0;
    differences.forEach(function(d) {
      var s = (d.severity || 'low').toLowerCase();
      if (s === 'high') highCount++;
      else if (s === 'medium') medCount++;
      else lowCount++;
    });

    var highestCat = { name: '—', score: 0 };
    var lowestCat = { name: '—', score: 100 };
    var passCount = 0;
    catEntries.forEach(function(entry) {
      var name = entry[0].replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
      var s = entry[1].score;
      if (s >= highestCat.score) highestCat = { name: name, score: s };
      if (s <= lowestCat.score) lowestCat = { name: name, score: s };
      if (s >= 90) passCount++;
    });
    var passRate = catEntries.length > 0 ? Math.round((passCount / catEntries.length) * 100) : 0;

    var html = '';
    html += '<div class="qaproof-report-stats">';

    // Stats cards row
    html += '<div class="qaproof-stats-row">';

    // Total issues card
    html += '<div class="qaproof-stat-card">';
    html += '  <div class="qaproof-stat-value">' + differences.length + '</div>';
    html += '  <div class="qaproof-stat-label">Issues Found</div>';
    if (differences.length > 0) {
      html += '  <div class="qaproof-stat-detail">';
      var parts = [];
      if (highCount > 0) parts.push('<span class="qaproof-stat-high">' + highCount + ' ' + (qaproof.i18n.monitorHigh || 'High') + '</span>');
      if (medCount > 0) parts.push('<span class="qaproof-stat-med">' + medCount + ' Med</span>');
      if (lowCount > 0) parts.push('<span class="qaproof-stat-low">' + lowCount + ' ' + (qaproof.i18n.monitorLow || 'Low') + '</span>');
      html += parts.join(' · ');
      html += '  </div>';
    }
    html += '</div>';

    // Pass rate card
    html += '<div class="qaproof-stat-card">';
    html += '  <div class="qaproof-stat-value ' + Q.getScoreClass(passRate * 1) + '">' + passRate + '%</div>';
    html += '  <div class="qaproof-stat-label">Pass Rate</div>';
    html += '  <div class="qaproof-stat-detail">' + passCount + ' of ' + catEntries.length + ' categories</div>';
    html += '</div>';

    // Best category card
    html += '<div class="qaproof-stat-card">';
    html += '  <div class="qaproof-stat-value ' + Q.getScoreClass(highestCat.score) + '">' + highestCat.score + '</div>';
    html += '  <div class="qaproof-stat-label">Best Category</div>';
    html += '  <div class="qaproof-stat-detail">' + Q.escapeHtml(highestCat.name) + '</div>';
    html += '</div>';

    // Worst category card
    html += '<div class="qaproof-stat-card">';
    html += '  <div class="qaproof-stat-value ' + Q.getScoreClass(lowestCat.score) + '">' + lowestCat.score + '</div>';
    html += '  <div class="qaproof-stat-label">Needs Attention</div>';
    html += '  <div class="qaproof-stat-detail">' + Q.escapeHtml(lowestCat.name) + '</div>';
    html += '</div>';

    html += '</div>'; // stats-row

    // Charts row
    var hasIssues = differences.length > 0;
    html += '<div class="qaproof-charts-row' + (hasIssues ? '' : ' qaproof-charts-single') + '">';

    // Radar chart
    html += '<div class="qaproof-chart-card' + (hasIssues ? '' : ' qaproof-chart-full') + '">';
    html += '  <div class="qaproof-chart-title">Category Scores</div>';
    html += '  <div class="qaproof-chart-wrap"><canvas id="' + containerId + '-radar"></canvas></div>';
    html += '</div>';

    // Donut chart (only if issues exist)
    if (hasIssues) {
      html += '<div class="qaproof-chart-card">';
      html += '  <div class="qaproof-chart-title">Issue Severity</div>';
      html += '  <div class="qaproof-chart-wrap qaproof-donut-wrap"><canvas id="' + containerId + '-donut"></canvas></div>';
      html += '</div>';
    }

    html += '</div>'; // charts-row
    html += '</div>'; // report-stats

    return html;
  }

  /* ─── Feedback Section Builder ─── */
  function buildFeedbackSectionHtml(idPrefix) {
    var id = idPrefix || 'qaproof';
    var h = '';
    h += '<h2>Feedback</h2>';
    h += '<div class="qaproof-card qaproof-feedback-card" id="' + id + '-feedback">';
    h += '  <div class="qaproof-feedback-inner">';
    h += '    <div class="qaproof-feedback-prompt">How accurate was this analysis?</div>';
    h += '    <div class="qaproof-feedback-stars" id="' + id + '-feedback-stars">';
    for (var i = 1; i <= 5; i++) {
      h += '      <button type="button" class="qaproof-star-btn" data-rating="' + i + '" title="' + i + ' star' + (i > 1 ? 's' : '') + '">';
      h += '        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
      h += '          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
      h += '        </svg>';
      h += '      </button>';
    }
    h += '    </div>';
    h += '    <div class="qaproof-feedback-labels">';
    h += '      <span>Not helpful</span><span>Very accurate</span>';
    h += '    </div>';
    h += '    <textarea class="qaproof-feedback-comment" id="' + id + '-feedback-comment" placeholder="Any additional comments? (optional)" rows="3"></textarea>';
    h += '    <div class="qaproof-feedback-actions">';
    h += '      <button type="button" class="qaproof-feedback-submit qaproof-btn-primary" id="' + id + '-feedback-submit" disabled>Submit Feedback</button>';
    h += '    </div>';
    h += '  </div>';
    h += '  <div class="qaproof-feedback-success hidden" id="' + id + '-feedback-success">';
    h += '    <div class="qaproof-feedback-success-icon">';
    h += '      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--qp-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    h += '    </div>';
    h += '    <div class="qaproof-feedback-success-title">Thank you for your feedback!</div>';
    h += '    <div class="qaproof-feedback-success-text">Your input helps us improve the accuracy of our analysis.</div>';
    h += '  </div>';
    h += '</div>';
    return h;
  }

  function initFeedbackSection(idPrefix) {
    var id = idPrefix || 'qaproof';
    var starsContainer = document.getElementById(id + '-feedback-stars');
    var commentEl = document.getElementById(id + '-feedback-comment');
    var submitBtn = document.getElementById(id + '-feedback-submit');
    var successEl = document.getElementById(id + '-feedback-success');
    var innerEl = starsContainer ? starsContainer.closest('.qaproof-feedback-inner') : null;
    if (!starsContainer || !submitBtn) return;

    var selectedRating = 0;
    var starBtns = starsContainer.querySelectorAll('.qaproof-star-btn');

    function updateStars(hoverRating) {
      starBtns.forEach(function (btn) {
        var r = parseInt(btn.getAttribute('data-rating'), 10);
        var svg = btn.querySelector('svg');
        if (r <= hoverRating) {
          btn.classList.add('active');
          svg.setAttribute('fill', 'currentColor');
        } else {
          btn.classList.remove('active');
          svg.setAttribute('fill', 'none');
        }
      });
    }

    starBtns.forEach(function (btn) {
      btn.addEventListener('mouseenter', function () {
        updateStars(parseInt(btn.getAttribute('data-rating'), 10));
      });
      btn.addEventListener('click', function () {
        selectedRating = parseInt(btn.getAttribute('data-rating'), 10);
        updateStars(selectedRating);
        submitBtn.disabled = false;
      });
    });

    starsContainer.addEventListener('mouseleave', function () {
      updateStars(selectedRating);
    });

    submitBtn.addEventListener('click', function () {
      var comment = commentEl ? commentEl.value.trim() : '';
      var lastResult = window.QAProof && window.QAProof.state && window.QAProof.state.lastResult;

      submitBtn.disabled = true;

      fetch(qaproof.restBase + '/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': qaproof.nonce,
        },
        body: JSON.stringify({
          rating: selectedRating,
          comment: comment,
          testType: (lastResult && lastResult.testType) || id.replace('qaproof-', ''),
          pageUrl: (lastResult && lastResult.pageUrl) || '',
          score: (lastResult && lastResult.score) || 0,
        }),
      })
      .then(function(r) { return r.json(); })
      .catch(function() { return { success: false }; })
      .finally(function() {
        // Show success regardless of server response (best-effort)
        if (innerEl) innerEl.classList.add('hidden');
        if (successEl) successEl.classList.remove('hidden');
      });
    });
  }

  function buildReportStatsInlineHtml(data) {
    var differences = data.differences || [];
    var categories = data.categories || {};
    var catEntries = Object.entries(categories);

    var highCount = 0, medCount = 0, lowCount = 0;
    differences.forEach(function(d) {
      var s = (d.severity || 'low').toLowerCase();
      if (s === 'high') highCount++;
      else if (s === 'medium') medCount++;
      else lowCount++;
    });

    var highestCat = { name: '—', score: 0 };
    var lowestCat = { name: '—', score: 100 };
    var passCount = 0;
    catEntries.forEach(function(entry) {
      var name = entry[0].replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
      var s = entry[1].score;
      if (s >= highestCat.score) highestCat = { name: name, score: s };
      if (s <= lowestCat.score) lowestCat = { name: name, score: s };
      if (s >= 90) passCount++;
    });
    var passRate = catEntries.length > 0 ? Math.round((passCount / catEntries.length) * 100) : 0;

    var html = '<div class="qaproof-stats-row qaproof-stats-inline">';
    html += '<div class="qaproof-stat-card"><div class="qaproof-stat-value">' + differences.length + '</div><div class="qaproof-stat-label">Issues</div>';
    if (differences.length > 0) {
      html += '<div class="qaproof-stat-detail">';
      var parts = [];
      if (highCount > 0) parts.push('<span class="qaproof-stat-high">' + highCount + ' ' + (qaproof.i18n.monitorHigh || 'High') + '</span>');
      if (medCount > 0) parts.push('<span class="qaproof-stat-med">' + medCount + ' Med</span>');
      if (lowCount > 0) parts.push('<span class="qaproof-stat-low">' + lowCount + ' ' + (qaproof.i18n.monitorLow || 'Low') + '</span>');
      html += parts.join(' · ') + '</div>';
    }
    html += '</div>';
    html += '<div class="qaproof-stat-card"><div class="qaproof-stat-value ' + Q.getScoreClass(passRate) + '">' + passRate + '%</div><div class="qaproof-stat-label">Pass Rate</div><div class="qaproof-stat-detail">' + passCount + ' of ' + catEntries.length + ' categories</div></div>';
    html += '<div class="qaproof-stat-card"><div class="qaproof-stat-value ' + Q.getScoreClass(highestCat.score) + '">' + highestCat.score + '</div><div class="qaproof-stat-label">Best</div><div class="qaproof-stat-detail">' + Q.escapeHtml(highestCat.name) + '</div></div>';
    html += '<div class="qaproof-stat-card"><div class="qaproof-stat-value ' + Q.getScoreClass(lowestCat.score) + '">' + lowestCat.score + '</div><div class="qaproof-stat-label">Weakest</div><div class="qaproof-stat-detail">' + Q.escapeHtml(lowestCat.name) + '</div></div>';
    html += '</div>';
    return html;
  }

  /**
   * Build just the charts row (no stats cards).
   */
  function buildReportChartsHtml(data, containerId) {
    var differences = data.differences || [];
    var hasIssues = differences.length > 0;
    var html = '<div class="qaproof-report-stats"><div class="qaproof-charts-row' + (hasIssues ? '' : ' qaproof-charts-single') + '">';
    html += '<div class="qaproof-chart-card' + (hasIssues ? '' : ' qaproof-chart-full') + '"><div class="qaproof-chart-title">Category Scores</div><div class="qaproof-chart-wrap"><canvas id="' + containerId + '-radar"></canvas></div></div>';
    if (hasIssues) {
      html += '<div class="qaproof-chart-card"><div class="qaproof-chart-title">Issue Severity</div><div class="qaproof-chart-wrap qaproof-donut-wrap"><canvas id="' + containerId + '-donut"></canvas></div></div>';
    }
    html += '</div></div>';
    return html;
  }

  // ============================
  // Chart Initialization (Chart.js)
  // ============================
  function initReportCharts(data, containerId) {
    if (typeof Chart === 'undefined') {
      var chartCards = document.querySelectorAll('.qaproof-chart-card');
      for (var ci = 0; ci < chartCards.length; ci++) {
        chartCards[ci].style.display = 'none';
      }
      return;
    }

    var chartFont = "'Kodchasan', 'Inter', system-ui, sans-serif";
    var isDark = document.getElementById('qaproof-app') && document.getElementById('qaproof-app').classList.contains('qaproof-dark');
    var chartTextColor = isDark ? '#EEEEEE' : '#374151';
    var chartTickColor = isDark ? 'rgba(238,238,238,0.5)' : '#9CA3AF';
    var chartGridColor = isDark ? 'rgba(238,238,238,0.1)' : 'rgba(0,0,0,0.08)';
    var chartAngleColor = isDark ? 'rgba(238,238,238,0.08)' : 'rgba(0,0,0,0.06)';
    var chartBorderColor = isDark ? '#393E46' : '#ffffff';
    var categories = data.categories || {};
    var catEntries = Object.entries(categories);
    var differences = data.differences || [];

    // ── Radar chart ──
    var radarCanvas = document.getElementById(containerId + '-radar');
    if (radarCanvas && catEntries.length > 0) {
      var labels = catEntries.map(function(e) {
        return e[0].replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
      });
      var scores = catEntries.map(function(e) { return e[1].score; });

      // Create gradient fill
      var radarCtx = radarCanvas.getContext('2d');
      var radarGradient = radarCtx.createRadialGradient(
        radarCanvas.width / 2, radarCanvas.height / 2, 0,
        radarCanvas.width / 2, radarCanvas.height / 2, radarCanvas.width / 2.5
      );
      radarGradient.addColorStop(0, 'rgba(0, 173, 181, 0.25)');
      radarGradient.addColorStop(1, 'rgba(0, 173, 181, 0.03)');

      new Chart(radarCanvas, {
        type: 'radar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Score',
            data: scores,
            borderColor: '#00ADB5',
            backgroundColor: radarGradient,
            borderWidth: 2.5,
            pointBackgroundColor: scores.map(function(s) {
              return s >= 90 ? '#10B981' : s >= 70 ? '#F59E0B' : '#EF4444';
            }),
            pointBorderColor: '#fff',
            pointBorderWidth: 2.5,
            pointRadius: 7,
            pointHoverRadius: 10,
            pointHoverBorderWidth: 3,
            pointHoverBorderColor: '#fff',
            fill: true,
            tension: 0.05
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          layout: { padding: { top: 16, bottom: 12, left: 16, right: 16 } },
          scales: {
            r: {
              beginAtZero: true,
              max: 100,
              min: 0,
              ticks: {
                stepSize: 20,
                font: { family: chartFont, size: 11, weight: '500' },
                color: chartTickColor,
                backdropColor: 'transparent',
                showLabelBackdrop: false,
                z: 1
              },
              pointLabels: {
                font: { family: chartFont, size: 13, weight: '600' },
                color: chartTextColor,
                padding: 18,
                callback: function(label) {
                  // Wrap long labels
                  if (label.length > 14) {
                    var words = label.split(' ');
                    if (words.length >= 2) {
                      return words;
                    }
                  }
                  return label;
                }
              },
              grid: {
                color: chartGridColor,
                lineWidth: 1,
                circular: true
              },
              angleLines: {
                color: chartAngleColor,
                lineWidth: 1
              }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(34, 40, 49, 0.95)',
              titleFont: { family: chartFont, size: 0 },
              bodyFont: { family: chartFont, size: 14, weight: '500' },
              padding: { top: 10, bottom: 10, left: 16, right: 16 },
              cornerRadius: 12,
              displayColors: false,
              caretSize: 6,
              caretPadding: 8,
              callbacks: {
                title: function() { return ''; },
                label: function(ctx) {
                  var emoji = ctx.raw >= 90 ? '' : ctx.raw >= 70 ? '' : '';
                  return ctx.label + '  ' + ctx.raw + ' / 100';
                }
              }
            }
          },
          animation: {
            duration: 800,
            easing: 'easeOutQuart'
          }
        }
      });
    }

    // ── Donut chart ──
    var donutCanvas = document.getElementById(containerId + '-donut');
    if (donutCanvas && differences.length > 0) {
      var highCount = 0, medCount = 0, lowCount = 0;
      differences.forEach(function(d) {
        var s = (d.severity || 'low').toLowerCase();
        if (s === 'high') highCount++;
        else if (s === 'medium') medCount++;
        else lowCount++;
      });

      var donutLabels = [];
      var donutData = [];
      var donutColors = [];
      var donutHoverColors = [];
      // Intentional order: High first (most severe)
      if (highCount > 0) { donutLabels.push(qaproof.i18n.monitorHigh || 'High'); donutData.push(highCount); donutColors.push('#EF4444'); donutHoverColors.push('#DC2626'); }
      if (medCount > 0) { donutLabels.push(qaproof.i18n.monitorMedium || 'Medium'); donutData.push(medCount); donutColors.push('#F59E0B'); donutHoverColors.push('#D97706'); }
      if (lowCount > 0) { donutLabels.push(qaproof.i18n.monitorLow || 'Low'); donutData.push(lowCount); donutColors.push('#00ADB5'); donutHoverColors.push('#009CA3'); }

      var totalIssues = differences.length;

      // Center text plugin — renders issue count inside the ring
      var centerTextPlugin = {
        id: 'centerText_' + containerId,
        afterDraw: function(chart) {
          var ctx = chart.ctx;
          var area = chart.chartArea;
          var cx = area.left + (area.right - area.left) / 2;
          var cy = area.top + (area.bottom - area.top) / 2;
          var innerRadius = chart.getDatasetMeta(0).data[0] ? chart.getDatasetMeta(0).data[0].innerRadius : 0;

          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Large number
          var numSize = Math.max(28, Math.min(42, innerRadius * 0.55));
          var isChartDark = document.getElementById('qaproof-app') && document.getElementById('qaproof-app').classList.contains('qaproof-dark');
          ctx.font = '700 ' + numSize + 'px ' + chartFont;
          ctx.fillStyle = isChartDark ? '#EEEEEE' : '#222831';
          ctx.fillText(totalIssues, cx, cy - numSize * 0.22);

          // "issues" or "issue" label
          var labelSize = Math.max(11, Math.min(15, innerRadius * 0.18));
          ctx.font = '500 ' + labelSize + 'px ' + chartFont;
          ctx.fillStyle = isChartDark ? 'rgba(238,238,238,0.5)' : '#9CA3AF';
          ctx.fillText(totalIssues === 1 ? 'issue' : 'issues found', cx, cy + numSize * 0.42);

          ctx.restore();
        }
      };

      new Chart(donutCanvas, {
        type: 'doughnut',
        data: {
          labels: donutLabels,
          datasets: [{
            data: donutData,
            backgroundColor: donutColors,
            hoverBackgroundColor: donutHoverColors,
            borderColor: chartBorderColor,
            borderWidth: 5,
            hoverBorderWidth: 2,
            hoverOffset: 6,
            borderRadius: 6,
            spacing: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: '66%',
          layout: { padding: { top: 8, bottom: 8 } },
          animation: {
            animateRotate: true,
            animateScale: false,
            duration: 900,
            easing: 'easeOutQuart'
          },
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 24,
                usePointStyle: true,
                pointStyle: 'rectRounded',
                pointStyleWidth: 14,
                font: { family: chartFont, size: 13, weight: '600' },
                color: chartTextColor,
                generateLabels: function(chart) {
                  var ds = chart.data.datasets[0];
                  return chart.data.labels.map(function(label, i) {
                    return {
                      text: label + '  ' + ds.data[i],
                      fillStyle: ds.backgroundColor[i],
                      fontColor: chartTextColor,
                      strokeStyle: 'transparent',
                      lineWidth: 0,
                      pointStyle: 'rectRounded',
                      hidden: false,
                      index: i
                    };
                  });
                }
              }
            },
            tooltip: {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.95)' : 'rgba(34, 40, 49, 0.95)',
              titleFont: { family: chartFont, size: 0 },
              titleColor: isDark ? '#222831' : '#ffffff',
              bodyFont: { family: chartFont, size: 14, weight: '500' },
              bodyColor: isDark ? '#222831' : '#ffffff',
              padding: { top: 10, bottom: 10, left: 16, right: 16 },
              cornerRadius: 12,
              displayColors: true,
              boxWidth: 12,
              boxHeight: 12,
              boxPadding: 8,
              caretSize: 6,
              borderColor: isDark ? 'rgba(0, 0, 0, 0.1)' : 'transparent',
              borderWidth: isDark ? 1 : 0,
              position: 'nearest',
              yAlign: 'bottom',
              callbacks: {
                title: function() { return ''; },
                label: function(ctx) {
                  var total = ctx.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                  var pct = Math.round((ctx.raw / total) * 100);
                  return ' ' + ctx.label + ' severity: ' + ctx.raw + ' (' + pct + '%)';
                }
              }
            }
          }
        },
        plugins: [centerTextPlugin]
      });
    }
  }

  // ============================
  // Render Fidelity Results
  // ============================
  function renderFidelityResults(data) {
    S.activeDiffIndex = null;
    S.syncScrollEnabled = true;
    S.markersVisible = true;
    S.isScrollSyncing = false;
    S.allDifferences = data.differences || [];
    S.activeDevice = 'desktop';

    var score = data.score;
    var scoreClass = Q.getScoreClass(score);

    var html = buildBackButtonHtml();

    // Combined score + stats header
    html += '<div class="qaproof-report-hero">';
    html += '  <div class="qaproof-report-hero-top">';
    html += '    <div class="qaproof-report-hero-score">';
    html += buildScoreRingHtml(score, 'Design Fidelity Score', scoreClass);
    html += '      <div class="qaproof-score-label">Design Fidelity Score</div>';
    html += '    </div>';
    html += '    <div class="qaproof-report-hero-info">';
    html += '      <div class="qaproof-summary">' + Q.escapeHtml(data.summary || '') + '</div>';
    html += '      <div class="qaproof-report-hero-actions">';
    html += '        <button type="button" id="qaproof-pdf-btn" class="qaproof-btn qaproof-pdf-btn"><span class="dashicons dashicons-pdf"></span> Download PDF Report</button>';
    html += '        <button type="button" id="qaproof-email-btn" class="qaproof-btn qaproof-email-btn"><span class="dashicons dashicons-email-alt"></span> Send to Email</button>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Parse failure warning
    html += buildParseWarningHtml(data);

    // Stats + Charts rows (outside hero, light theme)
    html += buildReportStatsInlineHtml(data);
    html += buildReportChartsHtml(data, 'qaproof-chart-fidelity');

    // Categories
    html += '<div class="qaproof-categories" id="qaproof-categories"></div>';

    // Comparison Viewport
    if (data.screenshots) {
      html += '<div class="qaproof-screenshot-section">';
      html += '  <div class="qaproof-screenshot-chrome">';
      html += '    <div class="qaproof-chrome-bar">';
      html += '      <div class="qaproof-chrome-dots"><span></span><span></span><span></span></div>';
      html += '      <div class="qaproof-chrome-title">Visual Comparison</div>';
      html += '      <div class="qaproof-chrome-actions">';
      html += '        <button type="button" id="qaproof-toggle-markers" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.5 4.5 8.5 4.5 8.5S12.5 9.5 12.5 6c0-2.485-2.015-4.5-4.5-4.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="6" r="1.5" fill="currentColor"/></svg> Markers</button>';
      html += '        <button type="button" id="qaproof-toggle-sync" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2v4h4M12 14v-4H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4L8.5 7.5M4 12l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Sync Scroll</button>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="qaproof-comparison-viewport">';
      html += '      <div class="qaproof-screenshot-col">';
      html += '        <div class="qaproof-screenshot-label">Design (Figma)</div>';
      html += '        <div class="qaproof-screenshot-wrapper" id="qaproof-wrapper-figma">';
      html += '          <div class="qaproof-screenshot-inner">';
      html += '            <img id="qaproof-screenshot-figma" src="' + Q.escapeAttr(data.screenshots.figma || '') + '" alt="Figma" />';
      html += '            <div class="qaproof-markers-layer" id="qaproof-markers-figma"></div>';
      html += '          </div>';
      html += '        </div>';
      html += '      </div>';
      html += '      <div class="qaproof-screenshot-col">';
      html += '        <div class="qaproof-screenshot-label">Live Page</div>';
      html += '        <div class="qaproof-screenshot-wrapper" id="qaproof-wrapper-live">';
      html += '          <div class="qaproof-screenshot-inner">';
      html += '            <img id="qaproof-screenshot-live" src="' + Q.escapeAttr(data.screenshots.live || '') + '" alt="Live" />';
      html += '            <div class="qaproof-markers-layer" id="qaproof-markers-live"></div>';
      html += '          </div>';
      html += '        </div>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    }

    // Differences + Recommendations — two-column grid
    html += '<div class="qaproof-diff-rec-grid">';

    html += '<div class="qaproof-diff-rec-col">';
    html += '<h2>Differences <span class="qaproof-diff-count" id="qaproof-diff-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-severity-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-severity="all">' + (qaproof.i18n.monitorAll || 'All') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="high">' + (qaproof.i18n.monitorHigh || 'High') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="medium">' + (qaproof.i18n.monitorMedium || 'Medium') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="low">' + (qaproof.i18n.monitorLow || 'Low') + '</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div id="qaproof-differences"></div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="qaproof-diff-rec-col">';
    html += '<h2>Recommendations <span class="qaproof-diff-count" id="qaproof-rec-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-rec-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-rectype="all">All</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="code">Code Fixes</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="quick">Quick Wins</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="structural">Structural</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div class="qaproof-recommendations" id="qaproof-recommendations"></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // .qaproof-diff-rec-grid

    // Feedback
    html += buildFeedbackSectionHtml('qaproof');

    S.resultsContainer.innerHTML = html;
    S.resultsContainer.classList.remove('hidden');

    // Initialize charts
    initReportCharts(data, 'qaproof-chart-fidelity');
    initFeedbackSection('qaproof');

    // Render dynamic sections
    renderCategoriesInto('qaproof-categories', data.categories, {
      layout: 'Layout & Structure',
      colors: 'Colors & Backgrounds',
      typography: 'Typography',
      spacing: 'Spacing & Sizing',
      components: 'Components & UI',
    });

    renderDifferencesInto('qaproof-differences', 'qaproof-diff-count', S.allDifferences, false);
    renderRecommendationsInto('qaproof-recommendations', data.recommendations, 'qaproof-rec-count');

    // Markers after images load
    if (data.screenshots) {
      var figmaImg = document.getElementById('qaproof-screenshot-figma');
      var liveImg = document.getElementById('qaproof-screenshot-live');
      Promise.all([Q.waitForImage(figmaImg), Q.waitForImage(liveImg)]).then(function () {
        renderMarkers(S.allDifferences);
      });

      setupSyncScroll();
      setupToolbar();
    }

    setupFilterFor('qaproof-severity-filter', 'severity');

    // PDF download button
    var pdfBtn = document.getElementById('qaproof-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        Q.generatePdfReport(data);
      });
    }

    Q.scrollToElement(S.resultsContainer);
  }

  // ============================
  // Render Responsive Results
  // ============================
  function renderResponsiveResults(data) {
    S.activeDiffIndex = null;
    S.allDifferences = data.differences || [];
    S.activeDevice = 'desktop';

    var score = data.score;
    var scoreClass = Q.getScoreClass(score);
    var html = buildBackButtonHtml();

    // Combined score + stats header
    html += '<div class="qaproof-report-hero">';
    html += '  <div class="qaproof-report-hero-top">';
    html += '    <div class="qaproof-report-hero-score">';
    html += buildScoreRingHtml(score, 'Responsive Score', scoreClass);
    html += '      <div class="qaproof-score-label">Responsive Score</div>';
    html += '    </div>';
    html += '    <div class="qaproof-report-hero-info">';
    html += '      <div class="qaproof-summary">' + Q.escapeHtml(data.summary || '') + '</div>';
    html += '      <div class="qaproof-report-hero-actions">';
    html += '        <button type="button" id="qaproof-pdf-btn" class="qaproof-btn qaproof-pdf-btn"><span class="dashicons dashicons-pdf"></span> Download PDF Report</button>';
    html += '        <button type="button" id="qaproof-email-btn" class="qaproof-btn qaproof-email-btn"><span class="dashicons dashicons-email-alt"></span> Send to Email</button>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Parse failure warning
    html += buildParseWarningHtml(data);

    // Stats + Charts rows (outside hero, light theme)
    html += buildReportStatsInlineHtml(data);
    html += buildReportChartsHtml(data, 'qaproof-chart-responsive');

    // Categories
    html += '<div class="qaproof-categories" id="qaproof-resp-categories"></div>';

    // Device Tabs + Panels — show section if screenshots exist OR are loading asynchronously
    var hasScreenshots = data.screenshots || data.screenshotsAvailable;
    if (hasScreenshots) {
      html += '<div class="qaproof-screenshot-section">';
      html += '  <div class="qaproof-screenshot-chrome">';
      html += '    <div class="qaproof-chrome-bar">';
      html += '      <div class="qaproof-chrome-dots"><span></span><span></span><span></span></div>';
      html += '      <div class="qaproof-chrome-title">Responsive Screenshots</div>';
      html += '      <div class="qaproof-chrome-actions">';
      html += '        <div class="qaproof-device-tabs">';
      html += '          <button type="button" class="qaproof-device-tab active" data-device="desktop">Desktop</button>';
      html += '          <button type="button" class="qaproof-device-tab" data-device="tablet">Tablet</button>';
      html += '          <button type="button" class="qaproof-device-tab" data-device="tablet_landscape">Tablet <span class="dashicons dashicons-image-rotate" style="font-size:14px;width:14px;height:14px;vertical-align:middle;margin-left:2px;"></span></button>';
      html += '          <button type="button" class="qaproof-device-tab" data-device="mobile">Mobile</button>';
      html += '          <button type="button" class="qaproof-device-tab" data-device="mobile_landscape">Mobile <span class="dashicons dashicons-image-rotate" style="font-size:14px;width:14px;height:14px;vertical-align:middle;margin-left:2px;"></span></button>';
      html += '        </div>';
      html += '      </div>';
      html += '    </div>';

      // Show loading indicator when screenshots are being fetched asynchronously
      if (!data.screenshots && data.screenshotsAvailable) {
        html += '  <div id="qaproof-screenshots-loading" style="text-align:center;padding:40px 20px;color:#999;font-size:14px;">';
        html += '    <span class="dashicons dashicons-format-image" style="font-size:32px;width:32px;height:32px;display:block;margin:0 auto 10px;"></span>';
        html += '    Loading screenshots...';
        html += '  </div>';
      }

      var devices = ['desktop', 'tablet', 'tablet_landscape', 'mobile', 'mobile_landscape'];
      var frameClasses = { desktop: '', tablet: 'tablet-frame', tablet_landscape: 'tablet-landscape-frame', mobile: 'mobile-frame', mobile_landscape: 'mobile-landscape-frame' };
      var deviceLabels = { desktop: 'Desktop', tablet: 'Tablet', tablet_landscape: 'Tablet Landscape', mobile: 'Mobile', mobile_landscape: 'Mobile Landscape' };
      for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        var isActive = device === 'desktop' ? ' active' : '';
        var src = (data.screenshots && data.screenshots[device]) || '';
        // For async loading, always render panels for known available screenshots
        var isAvailable = data.screenshotsAvailable && data.screenshotsAvailable.indexOf(device) !== -1;
        if (!src && !isAvailable && (device === 'tablet_landscape' || device === 'mobile_landscape')) continue;
        html += '  <div class="qaproof-device-panel' + isActive + '" id="qaproof-panel-' + device + '">';
        html += '    <div class="qaproof-device-screenshot-wrapper ' + frameClasses[device] + '">';
        html += '      <div class="qaproof-screenshot-inner">';
        html += '        <img id="qaproof-screenshot-' + device + '" src="' + Q.escapeAttr(src) + '" alt="' + deviceLabels[device] + '" style="display:block;width:100%;height:auto;" />';
        html += '        <div class="qaproof-markers-layer" id="qaproof-markers-' + device + '"></div>';
        html += '      </div>';
        html += '    </div>';
        html += '  </div>';
      }
      html += '  </div>';
      html += '</div>';
    }

    // Differences + Recommendations — two-column grid
    html += '<div class="qaproof-diff-rec-grid">';

    html += '<div class="qaproof-diff-rec-col">';
    html += '<h2>Differences <span class="qaproof-diff-count" id="qaproof-resp-diff-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-resp-severity-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-severity="all">' + (qaproof.i18n.monitorAll || 'All') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="high">' + (qaproof.i18n.monitorHigh || 'High') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="medium">' + (qaproof.i18n.monitorMedium || 'Medium') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="low">' + (qaproof.i18n.monitorLow || 'Low') + '</button>';
    html += '    </div>';
    html += '    <div class="qaproof-device-filter" id="qaproof-device-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-device="all">All</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-device="desktop">Desktop</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-device="tablet">Tablet</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-device="tablet_landscape">Tablet Landscape</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-device="mobile">Mobile</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-device="mobile_landscape">Mobile Landscape</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div id="qaproof-resp-differences"></div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="qaproof-diff-rec-col">';
    html += '<h2>Recommendations <span class="qaproof-diff-count" id="qaproof-resp-rec-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-resp-rec-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-rectype="all">All</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="code">Code Fixes</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="quick">Quick Wins</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="structural">Structural</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div class="qaproof-recommendations" id="qaproof-resp-recommendations"></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // .qaproof-diff-rec-grid

    // Feedback
    html += buildFeedbackSectionHtml('qaproof-resp');

    S.resultsContainer.innerHTML = html;
    S.resultsContainer.classList.remove('hidden');

    // Initialize charts
    initReportCharts(data, 'qaproof-chart-responsive');
    initFeedbackSection('qaproof-resp');

    // Render dynamic sections
    renderCategoriesInto('qaproof-resp-categories', data.categories, {
      layout_adaptation: 'Layout Adaptation',
      typography_scaling: 'Typography Scaling',
      touch_targets: 'Touch Targets',
      images_media: 'Images & Media',
      navigation: 'Navigation',
      content_overflow: 'Content Overflow',
      orientation_handling: 'Orientation Handling',
    });

    renderDifferencesInto('qaproof-resp-differences', 'qaproof-resp-diff-count', S.allDifferences, true);
    renderRecommendationsInto('qaproof-resp-recommendations', data.recommendations, 'qaproof-resp-rec-count');

    // Device tabs
    setupDeviceTabs();

    // Auto-switch to the device tab with the most differences
    // (responsive tests often have no desktop issues, so default desktop tab shows nothing)
    // Uses double-rAF so it runs AFTER setupDeviceTabs() initialises the slider position
    // (rAF A → initialise at Desktop; rAF B → re-enable transition; then our switch fires
    // and animates the slider smoothly to whichever device has the most issues).
    (function () {
      var normDevice = function (dev) { return dev === 'tablet_portrait' ? 'tablet' : dev; };
      var counts = {};
      S.allDifferences.forEach(function (d) {
        if (d.device) { var dev = normDevice(d.device); counts[dev] = (counts[dev] || 0) + 1; }
      });
      var best = 'desktop', bestN = 0;
      Object.keys(counts).forEach(function (dev) {
        if (counts[dev] > bestN) { bestN = counts[dev]; best = dev; }
      });
      if (best !== 'desktop' && bestN > 0) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            switchDeviceTab(best);
          });
        });
      }
    })();

    // Markers after images load
    if (data.screenshots) {
      var imgPromises = [];
      ['desktop', 'tablet', 'tablet_landscape', 'mobile', 'mobile_landscape'].forEach(function (d) {
        var img = document.getElementById('qaproof-screenshot-' + d);
        if (img && img.src) imgPromises.push(Q.waitForImage(img));
      });
      Promise.all(imgPromises).then(function () {
        renderMarkersForDevice(S.activeDevice || 'desktop', S.allDifferences);
      });
    }

    setupFilterFor('qaproof-resp-severity-filter', 'severity');
    setupFilterFor('qaproof-device-filter', 'device');

    // PDF download button
    var pdfBtn = document.getElementById('qaproof-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        Q.generatePdfReport(data);
      });
    }

    Q.scrollToElement(S.resultsContainer);
  }

  // ============================
  // Render Accessibility Results
  // ============================
  function renderAccessibilityResults(data) {
    S.activeDiffIndex = null;
    S.allDifferences = data.differences || [];
    S.markersVisible = true;

    var score = data.score;
    var scoreClass = Q.getScoreClass(score);

    var html = buildBackButtonHtml();

    // Combined score + stats header
    html += '<div class="qaproof-report-hero">';
    html += '  <div class="qaproof-report-hero-top">';
    html += '    <div class="qaproof-report-hero-score">';
    html += buildScoreRingHtml(score, 'Accessibility Score', scoreClass);
    html += '      <div class="qaproof-score-label">Accessibility Score</div>';
    html += '    </div>';
    html += '    <div class="qaproof-report-hero-info">';
    html += '      <div class="qaproof-summary">' + Q.escapeHtml(data.summary || '') + '</div>';
    html += '      <div class="qaproof-report-hero-actions">';
    html += '        <button type="button" id="qaproof-pdf-btn" class="qaproof-btn qaproof-pdf-btn"><span class="dashicons dashicons-pdf"></span> Download PDF Report</button>';
    html += '        <button type="button" id="qaproof-email-btn" class="qaproof-btn qaproof-email-btn"><span class="dashicons dashicons-email-alt"></span> Send to Email</button>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Parse failure warning
    html += buildParseWarningHtml(data);

    // Stats + Charts rows (outside hero, light theme)
    html += buildReportStatsInlineHtml(data);
    html += buildReportChartsHtml(data, 'qaproof-chart-accessibility');

    // Categories (8 accessibility categories)
    html += '<div class="qaproof-categories" id="qaproof-a11y-categories"></div>';

    // Screenshot with markers — show if available or loading async
    var hasA11yScreenshot = (data.screenshots && data.screenshots.desktop) || data.screenshotsAvailable;
    if (hasA11yScreenshot) {
      var a11ySrc = (data.screenshots && data.screenshots.desktop) || '';
      html += '<div class="qaproof-screenshot-section">';
      html += '  <div class="qaproof-screenshot-chrome">';
      html += '    <div class="qaproof-chrome-bar">';
      html += '      <div class="qaproof-chrome-dots"><span></span><span></span><span></span></div>';
      html += '      <div class="qaproof-chrome-title">Page Screenshot</div>';
      html += '      <div class="qaproof-chrome-actions">';
      html += '        <button type="button" id="qaproof-toggle-markers" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.5 4.5 8.5 4.5 8.5S12.5 9.5 12.5 6c0-2.485-2.015-4.5-4.5-4.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="6" r="1.5" fill="currentColor"/></svg> Markers</button>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="qaproof-screenshot-viewport">';
      html += '      <div class="qaproof-screenshot-inner">';
      if (a11ySrc) {
        html += '        <img id="qaproof-screenshot-a11y" src="' + Q.escapeAttr(a11ySrc) + '" alt="Page Screenshot" style="display:block;width:100%;height:auto;" />';
      } else {
        html += '        <img id="qaproof-screenshot-a11y" src="" alt="Page Screenshot" style="display:block;width:100%;height:auto;" />';
        html += '        <div id="qaproof-screenshots-loading" style="text-align:center;padding:40px 20px;color:#999;font-size:14px;">Loading screenshot...</div>';
      }
      html += '        <div class="qaproof-markers-layer" id="qaproof-markers-a11y"></div>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    }

    // Issues + Recommendations — two-column grid
    html += '<div class="qaproof-diff-rec-grid">';

    html += '<div class="qaproof-diff-rec-col">';
    html += '<h2>Issues <span class="qaproof-diff-count" id="qaproof-a11y-diff-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-a11y-severity-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-severity="all">' + (qaproof.i18n.monitorAll || 'All') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="high">' + (qaproof.i18n.monitorHigh || 'High') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="medium">' + (qaproof.i18n.monitorMedium || 'Medium') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="low">' + (qaproof.i18n.monitorLow || 'Low') + '</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div id="qaproof-a11y-differences"></div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="qaproof-diff-rec-col">';
    html += '<h2>Recommendations <span class="qaproof-diff-count" id="qaproof-a11y-rec-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-a11y-rec-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-rectype="all">All</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="code">Code Fixes</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="quick">Quick Wins</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="structural">Structural</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div class="qaproof-recommendations" id="qaproof-a11y-recommendations"></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // .qaproof-diff-rec-grid

    // Feedback
    html += buildFeedbackSectionHtml('qaproof-a11y');

    S.resultsContainer.innerHTML = html;
    S.resultsContainer.classList.remove('hidden');

    // Initialize charts
    initReportCharts(data, 'qaproof-chart-accessibility');
    initFeedbackSection('qaproof-a11y');

    // Render dynamic sections
    renderCategoriesInto('qaproof-a11y-categories', data.categories, {
      color_contrast: 'Color Contrast',
      text_readability: 'Text Readability',
      form_labels: 'Form Labels',
      touch_targets: 'Touch Targets',
      heading_hierarchy: 'Heading Hierarchy',
      focus_indicators: 'Focus Indicators',
      spacing_layout: 'Spacing & Layout',
      images: 'Images & Alt Text',
    });

    renderDifferencesInto('qaproof-a11y-differences', 'qaproof-a11y-diff-count', S.allDifferences, false);
    renderRecommendationsInto('qaproof-a11y-recommendations', data.recommendations, 'qaproof-a11y-rec-count');

    // Markers after image loads
    if (data.screenshots && data.screenshots.desktop) {
      var a11yImg = document.getElementById('qaproof-screenshot-a11y');
      Q.waitForImage(a11yImg).then(function () {
        renderAccessibilityMarkers(S.allDifferences);
      });

      // Toggle markers button
      var toggleMarkersBtn = document.getElementById('qaproof-toggle-markers');
      if (toggleMarkersBtn) {
        toggleMarkersBtn.addEventListener('click', function () {
          S.markersVisible = !S.markersVisible;
          toggleMarkersBtn.classList.toggle('active', S.markersVisible);
          var layer = document.getElementById('qaproof-markers-a11y');
          if (layer) layer.style.display = S.markersVisible ? '' : 'none';
        });
      }
    }

    setupFilterFor('qaproof-a11y-severity-filter', 'severity');

    // PDF download button
    var pdfBtn = document.getElementById('qaproof-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        Q.generatePdfReport(data);
      });
    }

    Q.scrollToElement(S.resultsContainer);
  }

  // ============================
  // Render Design Audit Results
  // ============================
  function renderDesignAuditResults(data) {
    S.activeDiffIndex = null;
    S.allDifferences = data.differences || [];
    S.markersVisible = true;

    // Safe defaults for missing data
    var score = typeof data.score === 'number' ? data.score : 0;
    var debtScore = typeof data.designDebtScore === 'number' ? data.designDebtScore : (100 - score);
    var scoreClass = Q.getScoreClass(score);
    var ds = data.designSystem || {};
    var comps = data.components || {};

    // Debt grade letter
    var debtGrade = debtScore <= 10 ? 'A+' : debtScore <= 20 ? 'A' : debtScore <= 30 ? 'B' : debtScore <= 45 ? 'C' : debtScore <= 60 ? 'D' : 'F';
    var debtColor = debtScore > 50 ? '#EF4444' : debtScore > 25 ? '#F0B429' : '#00ADB5';

    var html = buildBackButtonHtml();

    // Combined score + stats header
    html += '<div class="qaproof-report-hero">';
    html += '  <div class="qaproof-report-hero-top">';
    html += '    <div class="qaproof-report-hero-score">';
    html += buildScoreRingHtml(score, 'Design System Score', scoreClass);
    html += '      <div class="qaproof-score-label">Design System Score</div>';
    html += '    </div>';
    html += '    <div class="qaproof-report-hero-info">';
    html += '      <div class="qaproof-summary">' + Q.escapeHtml(data.summary || '') + '</div>';
    html += '      <div class="qaproof-report-hero-actions">';
    html += '        <button type="button" id="qaproof-pdf-btn" class="qaproof-btn qaproof-pdf-btn"><span class="dashicons dashicons-pdf"></span> Download PDF Report</button>';
    html += '        <button type="button" id="qaproof-email-btn" class="qaproof-btn qaproof-email-btn"><span class="dashicons dashicons-email-alt"></span> Send to Email</button>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Design Debt Gauge — SVG circular gauge with grade
    html += '<div class="qaproof-card qaproof-debt-card">';
    html += '  <div class="qaproof-debt-header">';
    html += '    <h3 class="qaproof-debt-title">Design Debt Score</h3>';
    html += '    <div class="qaproof-debt-subtitle">Lower is better — represents inconsistency in the design system</div>';
    html += '  </div>';
    html += '  <div class="qaproof-debt-visual">';
    // SVG circular gauge
    var debtCircumference = 2 * Math.PI * 54;
    var debtOffset = debtCircumference - (debtScore / 100) * debtCircumference;
    html += '    <div class="qaproof-debt-ring">';
    html += '      <svg viewBox="0 0 130 130">';
    html += '        <circle cx="65" cy="65" r="54" fill="none" stroke="#393E46" stroke-width="8" />';
    html += '        <circle cx="65" cy="65" r="54" fill="none" stroke="' + debtColor + '" stroke-width="8" stroke-linecap="round"';
    html += '          stroke-dasharray="' + debtCircumference.toFixed(2) + '" stroke-dashoffset="' + debtOffset.toFixed(2) + '"';
    html += '          transform="rotate(-90 65 65)" style="transition:stroke-dashoffset 1.2s ease;" />';
    html += '      </svg>';
    html += '      <div class="qaproof-debt-ring-inner">';
    html += '        <div class="qaproof-debt-pct" style="color:' + debtColor + ';">' + debtScore + '%</div>';
    html += '        <div class="qaproof-debt-grade" style="color:' + debtColor + ';">Grade ' + debtGrade + '</div>';
    html += '      </div>';
    html += '    </div>';
    // Debt breakdown bars
    html += '    <div class="qaproof-debt-breakdown">';
    var catOrder = ['color_consistency', 'typography_system', 'spacing_system', 'component_consistency', 'visual_hierarchy'];
    var catLabelsShort = { color_consistency: 'Colors', typography_system: 'Typography', spacing_system: 'Spacing', component_consistency: 'Components', visual_hierarchy: 'Hierarchy' };
    catOrder.forEach(function (key) {
      var cat = (data.categories || {})[key];
      var catScore = cat ? cat.score : 0;
      var catDebt = 100 - catScore;
      var catColor = catDebt > 50 ? '#EF4444' : catDebt > 25 ? '#F0B429' : '#00ADB5';
      html += '      <div class="qaproof-debt-bar-row">';
      html += '        <div class="qaproof-debt-bar-label">' + (catLabelsShort[key] || key) + '</div>';
      html += '        <div class="qaproof-debt-bar-track"><div class="qaproof-debt-bar-fill" style="width:' + catDebt + '%;background:' + catColor + ';"></div></div>';
      html += '        <div class="qaproof-debt-bar-val" style="color:' + catColor + ';">' + catDebt + '%</div>';
      html += '      </div>';
    });
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Parse failure warning
    html += buildParseWarningHtml(data);

    // Report stats + charts
    var colorCount = (ds.colors) ? ds.colors.total : 0;
    var outlierCount = (ds.colors && ds.colors.outliers) ? ds.colors.outliers.length : 0;
    var fontCount = (ds.fonts) ? ds.fonts.families.length : 0;
    var spacingScaleCount = (ds.spacing) ? ds.spacing.scale.length : 0;
    var spacingOutlierCount = (ds.spacing && ds.spacing.outliers) ? ds.spacing.outliers.length : 0;
    var componentCount = 0;
    var variationCount = 0;
    Object.keys(comps).forEach(function (k) {
      componentCount += comps[k].count || 0;
      variationCount += comps[k].variations || 0;
    });

    var statsHtml = '<div class="qaproof-report-stats" id="qaproof-chart-design-audit">';
    statsHtml += '<div class="qaproof-stats-row">';
    statsHtml += '<div class="qaproof-stat-card"><div class="qaproof-stat-num">' + colorCount + '</div><div class="qaproof-stat-label">Unique Colors</div><div class="qaproof-stat-sub">' + outlierCount + ' outliers</div></div>';
    statsHtml += '<div class="qaproof-stat-card"><div class="qaproof-stat-num">' + fontCount + '</div><div class="qaproof-stat-label">Font Families</div><div class="qaproof-stat-sub">' + ((ds.fonts && ds.fonts.sizes) ? ds.fonts.sizes.length : 0) + ' sizes</div></div>';
    statsHtml += '<div class="qaproof-stat-card"><div class="qaproof-stat-num">' + spacingScaleCount + '</div><div class="qaproof-stat-label">Scale Values</div><div class="qaproof-stat-sub">' + spacingOutlierCount + ' off-grid</div></div>';
    statsHtml += '<div class="qaproof-stat-card"><div class="qaproof-stat-num">' + componentCount + '</div><div class="qaproof-stat-label">Components</div><div class="qaproof-stat-sub">' + variationCount + ' variations</div></div>';
    statsHtml += '</div>';

    // Charts row
    statsHtml += '<div class="qaproof-charts-row">';
    statsHtml += '<div class="qaproof-chart-card"><h4>Category Breakdown</h4><div class="qaproof-chart-wrap"><canvas id="qaproof-chart-design-audit-radar"></canvas></div></div>';
    statsHtml += '<div class="qaproof-chart-card"><h4>Score Distribution</h4><div class="qaproof-chart-wrap"><canvas id="qaproof-chart-design-audit-donut"></canvas></div></div>';
    statsHtml += '</div></div>';
    html += statsHtml;

    // Token Inventory (Tabs)
    if (ds.colors || ds.fonts || ds.spacing || ds.borderRadius) {
      html += '<h2>Token Inventory</h2>';
      html += '<div class="qaproof-card">';

      // Tab buttons with count badges
      var colorTabCount = (ds.colors) ? ds.colors.total : 0;
      var fontTabCount = (ds.fonts) ? ds.fonts.families.length : 0;
      var spacingTabLabel = (ds.spacing) ? ds.spacing.scale.length + ' scale' : '0';
      var radiusTabCount = (ds.borderRadius && ds.borderRadius.values) ? ds.borderRadius.values.length : 0;

      html += '  <div class="qaproof-token-tabs">';
      html += '    <button type="button" class="qaproof-token-tab active" data-panel="colors">Colors <span class="qaproof-tab-badge">' + colorTabCount + '</span></button>';
      html += '    <button type="button" class="qaproof-token-tab" data-panel="fonts">Typography <span class="qaproof-tab-badge">' + fontTabCount + '</span></button>';
      html += '    <button type="button" class="qaproof-token-tab" data-panel="spacing">Spacing <span class="qaproof-tab-badge">' + spacingTabLabel + '</span></button>';
      html += '    <button type="button" class="qaproof-token-tab" data-panel="radius">Border Radius <span class="qaproof-tab-badge">' + radiusTabCount + '</span></button>';
      if (ds.cssVars && Object.keys(ds.cssVars).length > 0) {
        html += '    <button type="button" class="qaproof-token-tab" data-panel="cssvars">CSS Variables <span class="qaproof-tab-badge">' + Object.keys(ds.cssVars).length + '</span></button>';
      }
      html += '  </div>';

      // Colors panel
      html += '  <div class="qaproof-token-panel active" data-panel="colors">';
      if (ds.colors && ds.colors.used && ds.colors.used.length > 0) {
        html += '    <div class="qaproof-token-section-head">';
        html += '      <h4>Primary Palette</h4>';
        html += '      <span class="qaproof-token-count">' + ds.colors.used.length + ' colors used 3+ times</span>';
        html += '    </div>';
        html += '    <div class="qaproof-color-grid">';
        ds.colors.used.slice(0, 24).forEach(function (c, i) {
          html += '<div class="qaproof-color-swatch qaproof-fade-in" style="animation-delay:' + (i * 30) + 'ms;">';
          html += '  <div class="qaproof-swatch-circle" style="background:' + Q.escapeAttr(c.value) + ';"></div>';
          html += '  <div class="qaproof-swatch-hex">' + Q.escapeHtml(c.value) + '</div>';
          html += '  <div class="qaproof-swatch-count">' + c.count + ' uses</div>';
          html += '</div>';
        });
        html += '    </div>';
        if (ds.colors.outliers && ds.colors.outliers.length > 0) {
          html += '    <div class="qaproof-token-section-head" style="margin-top:20px;">';
          html += '      <h4>Outliers</h4>';
          html += '      <span class="qaproof-token-count qaproof-token-count-warn">' + ds.colors.outliers.length + ' colors used only 1-2 times</span>';
          html += '    </div>';
          html += '    <div class="qaproof-color-grid qaproof-color-outliers">';
          ds.colors.outliers.slice(0, 18).forEach(function (c) {
            html += '<div class="qaproof-color-swatch qaproof-color-outlier">';
            html += '  <div class="qaproof-swatch-circle" style="background:' + Q.escapeAttr(c.value) + ';"></div>';
            html += '  <div class="qaproof-swatch-hex">' + Q.escapeHtml(c.value) + '</div>';
            html += '  <div class="qaproof-swatch-count">' + c.count + ' use' + (c.count > 1 ? 's' : '') + '</div>';
            html += '</div>';
          });
          html += '    </div>';
        }
      } else {
        html += '    <div class="qaproof-token-empty">No significant color palette detected</div>';
      }
      html += '  </div>';

      // Fonts panel
      html += '  <div class="qaproof-token-panel" data-panel="fonts">';
      if (ds.fonts && ds.fonts.families && ds.fonts.families.length > 0) {
        html += '    <div class="qaproof-token-section-head">';
        html += '      <h4>Font Families</h4>';
        html += '      <span class="qaproof-token-count">' + ds.fonts.families.length + ' families detected</span>';
        html += '    </div>';
        var totalFontUses = 0;
        ds.fonts.families.forEach(function (f) { totalFontUses += f.count; });
        ds.fonts.families.slice(0, 8).forEach(function (f, i) {
          var pct = totalFontUses > 0 ? Math.round((f.count / totalFontUses) * 100) : 0;
          html += '<div class="qaproof-font-item qaproof-fade-in" style="animation-delay:' + (i * 50) + 'ms;">';
          html += '  <div class="qaproof-font-name" style="font-family:' + Q.escapeAttr(f.name) + ',sans-serif;">' + Q.escapeHtml(f.name) + '</div>';
          html += '  <div class="qaproof-font-bar-wrap"><div class="qaproof-font-bar" style="width:' + pct + '%;"></div></div>';
          html += '  <div class="qaproof-font-pct">' + pct + '% <small>(' + f.count + ')</small></div>';
          html += '</div>';
        });
        if (ds.fonts.sizes && ds.fonts.sizes.length > 0) {
          html += '    <div class="qaproof-token-section-head" style="margin-top:20px;">';
          html += '      <h4>Type Scale</h4>';
          html += '      <span class="qaproof-token-count">' + ds.fonts.sizes.length + ' distinct sizes</span>';
          html += '    </div>';
          html += '    <div class="qaproof-type-scale">';
          ds.fonts.sizes.slice(0, 10).forEach(function (s) {
            var sizePx = parseFloat(s.value) || 14;
            var previewSize = Math.max(11, Math.min(sizePx, 32));
            var isOutlier = s.count <= 1;
            html += '<div class="qaproof-type-scale-item' + (isOutlier ? ' qaproof-type-outlier' : '') + '">';
            html += '  <div class="qaproof-type-preview" style="font-size:' + previewSize + 'px;">Aa</div>';
            html += '  <div class="qaproof-type-info">';
            html += '    <span class="qaproof-type-val">' + Q.escapeHtml(s.value) + '</span>';
            html += '    <span class="qaproof-type-count">' + s.count + ' element' + (s.count !== 1 ? 's' : '') + '</span>';
            html += '  </div>';
            html += '</div>';
          });
          html += '    </div>';
        }
        if (ds.fonts.weights && ds.fonts.weights.length > 0) {
          html += '    <div class="qaproof-token-section-head" style="margin-top:20px;">';
          html += '      <h4>Font Weights</h4>';
          html += '    </div>';
          html += '    <div class="qaproof-token-list">';
          ds.fonts.weights.slice(0, 6).forEach(function (w) {
            var weightLabel = { '100': 'Thin', '200': 'Extra Light', '300': 'Light', '400': 'Regular', '500': 'Medium', '600': 'Semi Bold', '700': 'Bold', '800': 'Extra Bold', '900': 'Black' };
            var label = weightLabel[w.value] || w.value;
            html += '<span class="qaproof-token-pill"><strong style="font-weight:' + Q.escapeAttr(w.value) + ';">' + Q.escapeHtml(label) + '</strong> <small>(' + w.count + ')</small></span>';
          });
          html += '    </div>';
        }
      } else {
        html += '    <div class="qaproof-token-empty">No font data extracted</div>';
      }
      html += '  </div>';

      // Spacing panel
      html += '  <div class="qaproof-token-panel" data-panel="spacing">';
      if (ds.spacing && ds.spacing.scale && ds.spacing.scale.length > 0) {
        var gridPct = ds.spacing.gridAdherence || 0;
        html += '    <div class="qaproof-token-section-head">';
        html += '      <h4>Detected Scale (4px grid)</h4>';
        html += '      <span class="qaproof-token-count">' + gridPct + '% on-grid adherence</span>';
        html += '    </div>';
        html += '    <div class="qaproof-spacing-scale">';
        ds.spacing.scale.forEach(function (v, i) {
          var boxSize = Math.min(v, 64);
          html += '<div class="qaproof-spacing-item qaproof-fade-in" style="animation-delay:' + (i * 40) + 'ms;">';
          html += '  <div class="qaproof-spacing-box" style="width:' + boxSize + 'px;height:' + boxSize + 'px;"></div>';
          html += '  <div class="qaproof-spacing-val">' + v + 'px</div>';
          html += '</div>';
        });
        html += '    </div>';
        if (ds.spacing.outliers && ds.spacing.outliers.length > 0) {
          html += '    <div class="qaproof-token-section-head" style="margin-top:20px;">';
          html += '      <h4>Off-grid Outliers</h4>';
          html += '      <span class="qaproof-token-count qaproof-token-count-warn">' + ds.spacing.outliers.length + ' values not on 4px grid</span>';
          html += '    </div>';
          html += '    <div class="qaproof-token-list">';
          ds.spacing.outliers.slice(0, 15).forEach(function (o) {
            html += '<span class="qaproof-token-pill qaproof-token-outlier">' + Q.escapeHtml(o.value) + ' <small>(' + o.count + 'x)</small></span>';
          });
          html += '    </div>';
        }
      } else {
        html += '    <div class="qaproof-token-empty">No spacing scale detected</div>';
      }
      html += '  </div>';

      // Border radius panel
      html += '  <div class="qaproof-token-panel" data-panel="radius">';
      if (ds.borderRadius && ds.borderRadius.values && ds.borderRadius.values.length > 0) {
        html += '    <div class="qaproof-token-section-head">';
        html += '      <h4>Border Radius Values</h4>';
        html += '      <span class="qaproof-token-count">' + ds.borderRadius.values.length + ' unique radii</span>';
        html += '    </div>';
        html += '    <div class="qaproof-radius-grid">';
        ds.borderRadius.values.slice(0, 12).forEach(function (r) {
          var rVal = parseInt(r.value) || 0;
          html += '<div class="qaproof-radius-item">';
          html += '  <div class="qaproof-radius-preview" style="border-radius:' + rVal + 'px;"></div>';
          html += '  <div class="qaproof-radius-val">' + Q.escapeHtml(r.value) + '</div>';
          html += '  <div class="qaproof-radius-count">' + r.count + ' uses</div>';
          html += '</div>';
        });
        html += '    </div>';
      } else {
        html += '    <div class="qaproof-token-empty">No border radius values detected</div>';
      }
      html += '  </div>';

      // CSS Variables panel
      if (ds.cssVars && Object.keys(ds.cssVars).length > 0) {
        html += '  <div class="qaproof-token-panel" data-panel="cssvars">';
        html += '    <div class="qaproof-token-section-head">';
        html += '      <h4>CSS Custom Properties</h4>';
        html += '      <span class="qaproof-token-count">' + Object.keys(ds.cssVars).length + ' variables on :root</span>';
        html += '    </div>';
        html += '    <div class="qaproof-cssvar-list">';
        Object.entries(ds.cssVars).slice(0, 30).forEach(function (entry) {
          var prop = entry[0], val = entry[1];
          var isColor = /^#|^rgb|^hsl/.test(val.trim());
          html += '<div class="qaproof-cssvar-item">';
          html += '  <code class="qaproof-cssvar-name">' + Q.escapeHtml(prop) + '</code>';
          html += '  <span class="qaproof-cssvar-val">';
          if (isColor) {
            html += '<span class="qaproof-cssvar-swatch" style="background:' + Q.escapeAttr(val.trim()) + ';"></span>';
          }
          html += Q.escapeHtml(val) + '</span>';
          html += '</div>';
        });
        if (Object.keys(ds.cssVars).length > 30) {
          html += '<div class="qaproof-token-more">+ ' + (Object.keys(ds.cssVars).length - 30) + ' more variables</div>';
        }
        html += '    </div>';
        html += '  </div>';
      }

      html += '</div>'; // end card
    }

    // Component Inventory
    if (comps && Object.keys(comps).length > 0) {
      var hasAnyComponents = false;
      Object.keys(comps).forEach(function (k) { if (comps[k].count > 0) hasAnyComponents = true; });

      if (hasAnyComponents) {
        html += '<h2>Component Inventory</h2>';
        html += '<div class="qaproof-component-grid">';
        var compIcons = {
          buttons: 'dashicons-button',
          cards: 'dashicons-screenoptions',
          forms: 'dashicons-feedback',
          navigation: 'dashicons-menu',
          headings: 'dashicons-heading',
          inputs: 'dashicons-editor-textcolor',
          links: 'dashicons-admin-links',
          images: 'dashicons-format-image',
        };
        var compColors = {
          buttons: '#00ADB5', cards: '#3B82F6', forms: '#8B5CF6',
          navigation: '#F59E0B', headings: '#EC4899', inputs: '#10B981',
          links: '#6366F1', images: '#F97316',
        };
        Object.keys(comps).forEach(function (type) {
          var comp = comps[type];
          if (comp.count === 0) return;
          var icon = compIcons[type] || 'dashicons-marker';
          var color = compColors[type] || '#00ADB5';
          // Health indicator: 1-3 variations = good, 4-5 = warn, 6+ = bad
          var healthClass = comp.variations <= 3 ? 'health-good' : comp.variations <= 5 ? 'health-warn' : 'health-bad';
          var healthLabel = comp.variations <= 3 ? 'Consistent' : comp.variations <= 5 ? 'Review' : 'Needs cleanup';
          html += '<div class="qaproof-component-card">';
          html += '  <div class="qaproof-comp-icon" style="background:' + color + '1a;"><span class="dashicons ' + icon + '" style="color:' + color + ';"></span></div>';
          html += '  <div class="qaproof-comp-info">';
          html += '    <div class="qaproof-comp-name">' + type.charAt(0).toUpperCase() + type.slice(1) + '</div>';
          html += '    <div class="qaproof-comp-count">' + comp.count + ' found</div>';
          html += '    <div class="qaproof-comp-meta">';
          html += '      <span class="qaproof-comp-variations">' + comp.variations + ' variation' + (comp.variations !== 1 ? 's' : '') + '</span>';
          html += '      <span class="qaproof-comp-health ' + healthClass + '">' + healthLabel + '</span>';
          html += '    </div>';
          html += '  </div>';
          html += '</div>';
        });
        html += '</div>';
      }
    }

    // Categories
    html += '<h2>Categories</h2>';
    html += '<div class="qaproof-categories" id="qaproof-da-categories"></div>';

    // Screenshot with markers — show if available or loading async
    var hasDaScreenshot = (data.screenshots && data.screenshots.desktop) || data.screenshotsAvailable;
    if (hasDaScreenshot) {
      var daSrc = (data.screenshots && data.screenshots.desktop) || '';
      html += '<div class="qaproof-screenshot-section">';
      html += '  <div class="qaproof-screenshot-chrome">';
      html += '    <div class="qaproof-chrome-bar">';
      html += '      <div class="qaproof-chrome-dots"><span></span><span></span><span></span></div>';
      html += '      <div class="qaproof-chrome-title">Page Screenshot</div>';
      html += '      <div class="qaproof-chrome-actions">';
      html += '        <button type="button" id="qaproof-toggle-markers" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.5 4.5 8.5 4.5 8.5S12.5 9.5 12.5 6c0-2.485-2.015-4.5-4.5-4.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="6" r="1.5" fill="currentColor"/></svg> Markers</button>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="qaproof-screenshot-viewport">';
      html += '      <div class="qaproof-screenshot-inner">';
      if (daSrc) {
        html += '        <img id="qaproof-screenshot-da" src="' + Q.escapeAttr(daSrc) + '" alt="Page Screenshot" style="display:block;width:100%;height:auto;" />';
      } else {
        html += '        <img id="qaproof-screenshot-da" src="" alt="Page Screenshot" style="display:block;width:100%;height:auto;" />';
        html += '        <div id="qaproof-screenshots-loading" style="text-align:center;padding:40px 20px;color:#999;font-size:14px;">Loading screenshot...</div>';
      }
      html += '        <div class="qaproof-markers-layer" id="qaproof-markers-da"></div>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    }

    // Design Debt Issues + Recommendations — two-column grid
    html += '<div class="qaproof-diff-rec-grid">';

    html += '<div class="qaproof-diff-rec-col">';
    html += '<h2>Design Debt Issues <span class="qaproof-diff-count" id="qaproof-da-diff-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-da-severity-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-severity="all">' + (qaproof.i18n.monitorAll || 'All') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="high">' + (qaproof.i18n.monitorHigh || 'High') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="medium">' + (qaproof.i18n.monitorMedium || 'Medium') + '</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="low">' + (qaproof.i18n.monitorLow || 'Low') + '</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div id="qaproof-da-differences"></div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="qaproof-diff-rec-col">';
    html += '<h2>Recommendations <span class="qaproof-diff-count" id="qaproof-da-rec-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-da-rec-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-rectype="all">All</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="code">Code Fixes</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="quick">Quick Wins</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-rectype="structural">Structural</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div class="qaproof-recommendations" id="qaproof-da-recommendations"></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // .qaproof-diff-rec-grid

    // Feedback
    html += buildFeedbackSectionHtml('qaproof-da');

    S.resultsContainer.innerHTML = html;
    S.resultsContainer.classList.remove('hidden');

    // Initialize charts
    initReportCharts(data, 'qaproof-chart-design-audit');
    initFeedbackSection('qaproof-da');

    // Render dynamic sections
    renderCategoriesInto('qaproof-da-categories', data.categories, {
      color_consistency: 'Color Consistency',
      typography_system: 'Typography System',
      spacing_system: 'Spacing System',
      component_consistency: 'Component Consistency',
      visual_hierarchy: 'Visual Hierarchy',
    });

    renderDifferencesInto('qaproof-da-differences', 'qaproof-da-diff-count', S.allDifferences, false);
    renderRecommendationsInto('qaproof-da-recommendations', data.recommendations, 'qaproof-da-rec-count');

    // Markers after image loads
    if (data.screenshots && data.screenshots.desktop) {
      var daImg = document.getElementById('qaproof-screenshot-da');
      if (daImg) {
        Q.waitForImage(daImg).then(function () {
          var markersLayer = document.getElementById('qaproof-markers-da');
          renderMarkersIntoLayer(markersLayer, S.allDifferences);
        });
      }

      var toggleMarkersBtn = document.getElementById('qaproof-toggle-markers');
      if (toggleMarkersBtn) {
        toggleMarkersBtn.addEventListener('click', function () {
          S.markersVisible = !S.markersVisible;
          toggleMarkersBtn.classList.toggle('active', S.markersVisible);
          var layer = document.getElementById('qaproof-markers-da');
          if (layer) layer.style.display = S.markersVisible ? '' : 'none';
        });
      }
    }

    setupFilterFor('qaproof-da-severity-filter', 'severity');

    // Token tabs interaction
    var tokenTabsContainer = document.querySelector('.qaproof-token-tabs');
    var tokenTabs = document.querySelectorAll('.qaproof-token-tab');
    if (tokenTabsContainer) {
      var ttSlider = document.createElement('div');
      ttSlider.className = 'qaproof-token-tab-slider';
      tokenTabsContainer.appendChild(ttSlider);

      function moveTokenSlider(btn) {
        var navRect = tokenTabsContainer.getBoundingClientRect();
        var btnRect = btn.getBoundingClientRect();
        ttSlider.style.width = btnRect.width + 'px';
        ttSlider.style.height = btnRect.height + 'px';
        ttSlider.style.transform = 'translateX(' + (btnRect.left - navRect.left - tokenTabsContainer.clientLeft) + 'px) translateY(' + (btnRect.top - navRect.top - tokenTabsContainer.clientTop) + 'px)';
      }

      requestAnimationFrame(function () {
        var activeTab = tokenTabsContainer.querySelector('.qaproof-token-tab.active');
        if (activeTab) {
          ttSlider.style.transition = 'none';
          moveTokenSlider(activeTab);
          requestAnimationFrame(function () { ttSlider.style.transition = ''; });
        }
      });

      tokenTabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          var panel = tab.dataset.panel;
          tokenTabs.forEach(function (t) { t.classList.remove('active'); });
          tab.classList.add('active');
          moveTokenSlider(tab);
          document.querySelectorAll('.qaproof-token-panel').forEach(function (p) {
            p.classList.toggle('active', p.dataset.panel === panel);
          });
        });
      });
    }

    // PDF download button
    var pdfBtn = document.getElementById('qaproof-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        Q.generatePdfReport(data);
      });
    }

    Q.scrollToElement(S.resultsContainer);
  }

  // ============================
  // Marker Helpers
  // ============================

  // Severity color map for pie markers
  var sevColorMap = { high: '#EF4444', medium: '#F0B429', low: '#3B82F6' };

  /**
   * Check if two element bounding boxes overlap significantly.
   * Returns true when the issues refer to the same visual element.
   */
  function boundsOverlap(locA, locB) {
    // Both must have real element bounds to compare
    if (locA.elTop == null || locA.elLeft == null || !locA.width || !locA.height) return false;
    if (locB.elTop == null || locB.elLeft == null || !locB.width || !locB.height) return false;

    var aTop = locA.elTop, aLeft = locA.elLeft;
    var aBottom = aTop + locA.height, aRight = aLeft + locA.width;
    var bTop = locB.elTop, bLeft = locB.elLeft;
    var bBottom = bTop + locB.height, bRight = bLeft + locB.width;

    // Compute intersection
    var overlapX = Math.max(0, Math.min(aRight, bRight) - Math.max(aLeft, bLeft));
    var overlapY = Math.max(0, Math.min(aBottom, bBottom) - Math.max(aTop, bTop));
    if (overlapX <= 0 || overlapY <= 0) return false;

    // If intersection is >= 50% of the smaller element, they're the same
    var interArea = overlapX * overlapY;
    var areaA = locA.width * locA.height;
    var areaB = locB.width * locB.height;
    var smaller = Math.min(areaA, areaB);
    return smaller > 0 && (interArea / smaller) >= 0.5;
  }

  function groupMarkersByLocation(differences, threshold) {
    threshold = threshold || 2.5; // % distance to merge
    var groups = [];
    for (var i = 0; i < differences.length; i++) {
      var diff = differences[i];
      if (!diff.location) continue;
      // Use _origIndex (set by renderDifferencesInto) so marker clicks select
      // the correct list item even when differences are filtered by device.
      var origIdx = diff._origIndex !== undefined ? diff._origIndex : i;
      var t = diff.location.top;
      var l = diff.location.left;
      var merged = false;
      for (var g = 0; g < groups.length; g++) {
        var gt = groups[g].top;
        var gl = groups[g].left;
        // Merge if marker centers are close OR element bounds overlap
        var closeEnough = Math.abs(t - gt) < threshold && Math.abs(l - gl) < threshold;
        var sameElement = boundsOverlap(diff.location, groups[g].diffs[0].diff.location);
        if (closeEnough || sameElement) {
          groups[g].diffs.push({ idx: origIdx, diff: diff });
          // DO NOT average positions. Keep the first member's position
          // (DOM-extracted diffs come first in allDifferences and have
          // pixel-perfect coordinates from getBoundingClientRect).
          // AI-generated diffs have approximate positions that would
          // drag the marker away from the correct location.
          merged = true;
          break;
        }
      }
      if (!merged) {
        groups.push({ diffs: [{ idx: origIdx, diff: diff }], top: t, left: l });
      }
    }
    return groups;
  }

  /**
   * Build a conic-gradient CSS value for pie segments.
   * counts = { high: N, medium: N, low: N }
   */
  function buildPieGradient(counts) {
    var total = (counts.high || 0) + (counts.medium || 0) + (counts.low || 0);
    if (total === 0) return '#3B82F6';
    var segments = [];
    var angle = 0;
    var order = ['high', 'medium', 'low'];
    for (var i = 0; i < order.length; i++) {
      var sev = order[i];
      var count = counts[sev] || 0;
      if (count === 0) continue;
      var slice = (count / total) * 360;
      var endAngle = angle + slice;
      segments.push(sevColorMap[sev] + ' ' + angle.toFixed(1) + 'deg ' + endAngle.toFixed(1) + 'deg');
      angle = endAngle;
    }
    return 'conic-gradient(' + segments.join(', ') + ')';
  }

  /**
   * Can we draw a highlight box around this issue's element?
   * Requires real element bounds (width/height/elTop/elLeft).
   */
  function isWrappable(diff) {
    if (diff.noMarker || diff.noHighlight) return false;
    var loc = diff.location;
    if (!loc) return false;
    return !!(loc.width && loc.height && loc.elTop != null && loc.elLeft != null);
  }

  /**
   * Should this marker have a pin arrow pointing to the element?
   */
  function shouldHavePin(diff) {
    if (diff.noMarker) return false;
    var loc = diff.location;
    if (!loc) return false;
    // Accessibility diffs: require real element bounds for pin
    if (diff.wcag_criterion) {
      return !!(loc.width && loc.height);
    }
    // Responsive/fidelity/regression: AI locations are the best we have — show pin
    return true;
  }

  function createMarkerEl(idx, diff) {
    var severity = diff.severity || 'low';
    var severityClass = 'qaproof-marker-' + severity;
    // Pin by default. No-pin only for page-level issues we can't logically point to.
    var isNoPin = !shouldHavePin(diff);

    var marker = document.createElement('div');
    marker.className = 'qaproof-marker ' + severityClass + (isNoPin ? ' qaproof-marker-nopin' : '');
    marker.dataset.index = idx;
    marker.style.top = diff.location.top + '%';
    // No-pin markers (page-level issues) are always centered horizontally
    marker.style.left = isNoPin ? '50%' : (diff.location.left + '%');

    // Pin head shows count (always 1 for single marker)
    var head = document.createElement('div');
    head.className = 'marker-head';
    head.textContent = '1';
    marker.appendChild(head);

    // Pin tail (triangle) — only for element-specific markers
    if (!isNoPin) {
      var tail = document.createElement('div');
      tail.className = 'marker-tail';
      marker.appendChild(tail);
    }

    var tooltipData = {
      severity: severity,
      category: diff.category || '',
      description: Q.truncate(diff.description, 180),
      num: diff._displayNum || (idx + 1),
      origIdx: idx
    };

    marker.addEventListener('mouseenter', function () {
      showTooltip(this, tooltipData);
      showElementHighlight(this, diff);
    });
    marker.addEventListener('mouseleave', function () {
      hideElementHighlight();
    });
    marker.addEventListener('click', function (e) {
      e.stopPropagation();
      selectDifference(idx, 'marker');
    });

    return marker;
  }

  /**
   * Create a merged pie marker for multiple overlapping issues.
   * group = { diffs: [{idx, diff}...], top, left }
   */
  function createPieMarkerEl(group) {
    var diffs = group.diffs;
    var counts = { high: 0, medium: 0, low: 0 };
    var tooltipLines = [];
    var worstSev = 'low';
    var sevWeight = { high: 3, medium: 2, low: 1 };

    for (var i = 0; i < diffs.length; i++) {
      var sev = (diffs[i].diff.severity || 'low').toLowerCase();
      counts[sev] = (counts[sev] || 0) + 1;
      if ((sevWeight[sev] || 0) > (sevWeight[worstSev] || 0)) worstSev = sev;
      tooltipLines.push(Q.truncate(diffs[i].diff.description, 80));
    }

    var pieGradient = buildPieGradient(counts);

    // Pin if ANY issue in the group points to a real element.
    // No-pin only when ALL grouped issues are page-level/abstract (noMarker).
    var anyHasPin = diffs.some(function(d) { return shouldHavePin(d.diff); });
    var anyWrappable = diffs.some(function(d) { return isWrappable(d.diff); });

    var marker = document.createElement('div');
    marker.className = 'qaproof-marker qaproof-marker-pie' + (!anyHasPin ? ' qaproof-marker-nopin' : '');
    // Store all indices
    marker.dataset.index = diffs[0].idx;
    marker.dataset.indices = diffs.map(function(d) { return d.idx; }).join(',');
    marker.style.top = group.top + '%';
    // No-pin pie markers (all page-level issues) are always centered horizontally
    marker.style.left = !anyHasPin ? '50%' : (group.left + '%');
    marker.style.setProperty('--qp-pie-bg', pieGradient);

    // Pin head (circle with count)
    var head = document.createElement('div');
    head.className = 'marker-head';
    head.textContent = diffs.length;
    marker.appendChild(head);

    // Pin tail — only for element-specific markers
    if (anyHasPin) {
      var tail = document.createElement('div');
      tail.className = 'marker-tail';
      marker.appendChild(tail);
    }

    var tooltipData = {
      severity: 'multi',
      items: diffs.map(function(d) {
        return {
          severity: (d.diff.severity || 'low').toLowerCase(),
          description: Q.truncate(d.diff.description, 100),
          num: d.diff._displayNum || (d.idx + 1),
          origIdx: d.idx
        };
      })
    };

    marker.addEventListener('mouseenter', function () {
      showTooltip(this, tooltipData);
      // For pie markers, compute the bounding box that covers ALL grouped
      // elements (union of all rects).
      if (!anyWrappable) return; // skip highlight for page-level groups
      var minTop = Infinity, minLeft = Infinity, maxBottom = -Infinity, maxRight = -Infinity;
      var hasAnyBounds = false;
      for (var k = 0; k < diffs.length; k++) {
        var loc = diffs[k].diff.location;
        if (loc && loc.width && loc.height && loc.elTop != null && loc.elLeft != null) {
          hasAnyBounds = true;
          var t = loc.elTop;
          var l = loc.elLeft;
          var b = t + loc.height;
          var r = l + loc.width;
          if (t < minTop) minTop = t;
          if (l < minLeft) minLeft = l;
          if (b > maxBottom) maxBottom = b;
          if (r > maxRight) maxRight = r;
        }
      }
      if (hasAnyBounds) {
        var unionW = maxRight - minLeft;
        var unionH = maxBottom - minTop;
        var unionDiff = {
          severity: worstSev,
          location: {
            elTop: minTop,
            elLeft: minLeft,
            width: unionW,
            height: unionH,
            top: minTop + unionH / 2,
            left: minLeft + unionW / 2,
          },
        };
        showElementHighlight(this, unionDiff);
      }
    });
    marker.addEventListener('mouseleave', function () {
      hideElementHighlight();
    });
    marker.addEventListener('click', function (e) {
      e.stopPropagation();
      selectDifference(diffs[0].idx, 'marker');
    });

    return marker;
  }

  /**
   * Render markers into a layer, merging overlapping ones into pie markers.
   */
  function renderMarkersIntoLayer(markersLayer, differences, filterFn) {
    if (!markersLayer) return;
    markersLayer.innerHTML = '';
    var filtered = [];
    for (var i = 0; i < differences.length; i++) {
      var diff = differences[i];
      if (!diff.location) continue;
      // noMarker items are rendered as round markers without the pin tail
      if (filterFn && !filterFn(diff, i)) continue;
      filtered.push(differences[i]);
    }
    var groups = groupMarkersByLocation(filtered);
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      if (group.diffs.length === 1) {
        markersLayer.appendChild(createMarkerEl(group.diffs[0].idx, group.diffs[0].diff));
      } else {
        markersLayer.appendChild(createPieMarkerEl(group));
      }
    }
  }

  // ── Element highlight overlay (WAVE-style) ──
  var elementHighlight = null;

  function showElementHighlight(markerEl, diff) {
    var loc = diff.location;
    if (!loc) return;

    // Don't show highlight for noMarker/noHighlight issues
    if (diff.noMarker || diff.noHighlight) return;

    var w = loc.width;
    var h = loc.height;

    // DOM-snapped bounds (from accessibility extractor or responsive DOM queries)
    // are pixel-perfect — show them at any size.
    var hasDomBounds = !!diff.wcag_criterion || !!diff._domSnapped;

    if (!w || !h) {
      if (hasDomBounds) return; // DOM snap returned nothing — don't guess
      // No element bounds from AI or DOM — show a small fallback highlight
      // centered on the marker's top/left position so hover still works.
      w = 8;
      h = 1.5;
    }

    if (!hasDomBounds) {
      // Cap: skip highlight if AI-estimated box covers too much of the page.
      // Max 35% width and 10% height. Tight AI boxes are still shown.
      if (w > 35 || h > 10) return;
    }

    // Find the markers layer (parent of the marker)
    var layer = markerEl.closest('.qaproof-markers-layer');
    if (!layer) return;

    if (!elementHighlight) {
      elementHighlight = document.createElement('div');
      elementHighlight.className = 'qaproof-element-highlight';
    }

    var severity = diff.severity || 'low';
    elementHighlight.className = 'qaproof-element-highlight qaproof-highlight-' + severity;

    // Position highlight at the element's actual top-left corner.
    // elTop/elLeft are the element bounds; top/left are the marker center.
    var highlightTop = loc.elTop != null ? loc.elTop : loc.top;
    var highlightLeft = loc.elLeft != null ? loc.elLeft : loc.left;

    // For fallback (no elTop/elLeft), center the small box around the marker point
    if (loc.elTop == null && !hasDomBounds) {
      highlightTop = Math.max(0, loc.top - h / 2);
      highlightLeft = Math.max(0, loc.left - w / 2);
    }

    elementHighlight.style.top = highlightTop + '%';
    elementHighlight.style.left = highlightLeft + '%';
    elementHighlight.style.width = w + '%';
    elementHighlight.style.height = h + '%';

    layer.appendChild(elementHighlight);
  }

  function hideElementHighlight() {
    if (elementHighlight && elementHighlight.parentNode) {
      elementHighlight.parentNode.removeChild(elementHighlight);
    }
  }

  function renderAccessibilityMarkers(differences) {
    var markersLayer = document.getElementById('qaproof-markers-a11y');
    renderMarkersIntoLayer(markersLayer, differences);
  }

  // ============================
  // Shared Rendering: Categories
  // ============================
  function renderCategoriesInto(containerId, categories, labels) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    var entries = Object.entries(categories || {});
    if (!entries.length) return;

    var r = 23;
    var circumference = 2 * Math.PI * r;

    // Build tabs nav
    var nav = document.createElement('div');
    nav.className = 'qaproof-cat-tabs-nav';

    // Build tab panels container
    var panels = document.createElement('div');
    panels.className = 'qaproof-cat-tabs-panels';

    for (var i = 0; i < entries.length; i++) {
      var name = entries[i][0];
      var cat = entries[i][1];
      var scoreClass = Q.getScoreClass(cat.score);
      var description = categoryDescriptions[name] || '';
      var offset = circumference - (cat.score / 100) * circumference;
      var displayName = labels[name] || Q.capitalize(name.replace(/_/g, ' '));

      // Tab button
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'qaproof-cat-tab' + (i === 0 ? ' active' : '');
      tab.setAttribute('data-tab', name);
      tab.innerHTML =
        '<div class="qaproof-cat-score-ring">' +
        '  <svg viewBox="0 0 56 56">' +
        '    <circle class="qaproof-ring-bg" cx="28" cy="28" r="' + r + '" />' +
        '    <circle class="qaproof-ring-fill ' + scoreClass + '" cx="28" cy="28" r="' + r + '"' +
        '      stroke-dasharray="' + circumference.toFixed(2) + '"' +
        '      stroke-dashoffset="' + offset.toFixed(2) + '" />' +
        '  </svg>' +
        '  <div class="qaproof-cat-score-num">' + cat.score + '</div>' +
        '</div>' +
        '<span class="qaproof-cat-tab-label">' + Q.escapeHtml(displayName) + '</span>';
      nav.appendChild(tab);

      // Tab panel
      var panel = document.createElement('div');
      panel.className = 'qaproof-cat-tab-panel' + (i === 0 ? ' active' : '');
      panel.setAttribute('data-panel', name);
      panel.innerHTML =
        '<div class="qaproof-cat-panel-content">' +
        '  <div class="qaproof-cat-panel-header">' +
        '    <h3>' + Q.escapeHtml(displayName) + '</h3>' +
        (description ? '    <div class="qaproof-cat-evaluates">' + Q.escapeHtml(description) + '</div>' : '') +
        '  </div>' +
        '  <p>' + Q.escapeHtml(cat.notes || '') + '</p>' +
        '</div>';
      panels.appendChild(panel);
    }

    // Sliding indicator
    var slider = document.createElement('div');
    slider.className = 'qaproof-cat-tab-slider';
    nav.appendChild(slider);

    container.appendChild(nav);
    container.appendChild(panels);

    // Position slider on active tab
    function moveSlider(tab) {
      var navRect = nav.getBoundingClientRect();
      var tabRect = tab.getBoundingClientRect();
      slider.style.width = tabRect.width + 'px';
      slider.style.height = tabRect.height + 'px';
      slider.style.transform = 'translateX(' + (tabRect.left - navRect.left - nav.clientLeft) + 'px) translateY(' + (tabRect.top - navRect.top - nav.clientTop) + 'px)';
    }

    // Initial position (no transition)
    requestAnimationFrame(function () {
      var firstTab = nav.querySelector('.qaproof-cat-tab.active');
      if (firstTab) {
        slider.style.transition = 'none';
        moveSlider(firstTab);
        // Enable transition after initial placement
        requestAnimationFrame(function () {
          slider.style.transition = '';
        });
      }
    });

    // Expand button
    var expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'qaproof-cat-panel-expand';
    expandBtn.title = 'Expand';
    expandBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    expandBtn.style.display = 'none';
    panels.appendChild(expandBtn);

    function applyClamp(panel, navH) {
      var p = panel ? panel.querySelector('p') : null;
      if (!p) return;
      var header = panel.querySelector('.qaproof-cat-panel-header');
      var panelStyle = getComputedStyle(panel);
      var paddingTop = parseFloat(panelStyle.paddingTop) || 25;
      var paddingBottom = parseFloat(panelStyle.paddingBottom) || 25;
      var headerH = header ? header.offsetHeight : 0;
      var headerMarginBottom = header ? (parseFloat(getComputedStyle(header).marginBottom) || 10) : 0;
      var lineH = parseFloat(getComputedStyle(p).lineHeight);
      var availH = navH - paddingTop - paddingBottom - headerH - headerMarginBottom;
      var maxLines = Math.max(1, Math.floor(availH / lineH));
      p.style.display = '-webkit-box';
      p.style.webkitBoxOrient = 'vertical';
      p.style.webkitLineClamp = String(maxLines);
      p.style.overflow = 'hidden';
    }

    function removeClamp(panel) {
      var p = panel ? panel.querySelector('p') : null;
      if (!p) return;
      p.style.webkitLineClamp = '';
      p.style.display = '';
      p.style.overflow = '';
    }

    var navNaturalH = 0;

    function checkOverflow() {
      requestAnimationFrame(function () {
        navNaturalH = nav.offsetHeight;

        var activePanel = panels.querySelector('.qaproof-cat-tab-panel.active');
        removeClamp(activePanel);
        panels.style.maxHeight = '';

        var naturalPanelsH = panels.scrollHeight;
        var isOverflowing = naturalPanelsH > navNaturalH + 2;

        if (!panels.classList.contains('expanded')) {
          panels.style.maxHeight = navNaturalH + 'px';
          if (isOverflowing) {
            applyClamp(activePanel, navNaturalH);
          }
        }
        expandBtn.style.display = isOverflowing ? 'flex' : 'none';
      });
    }

    expandBtn.addEventListener('click', function () {
      var expanded = panels.classList.toggle('expanded');
      expandBtn.classList.toggle('rotated', expanded);
      var activePanel = panels.querySelector('.qaproof-cat-tab-panel.active');
      if (expanded) {
        removeClamp(activePanel);
        panels.style.maxHeight = panels.scrollHeight + 'px';
      } else {
        panels.style.maxHeight = navNaturalH + 'px';
        applyClamp(activePanel, navNaturalH);
      }
    });

    requestAnimationFrame(checkOverflow);

    // Tab click handler
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.qaproof-cat-tab');
      if (!btn || btn.classList.contains('active')) return;
      var key = btn.getAttribute('data-tab');

      nav.querySelectorAll('.qaproof-cat-tab').forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      moveSlider(btn);

      panels.querySelectorAll('.qaproof-cat-tab-panel').forEach(function (p) {
        p.classList.remove('active');
      });
      var target = panels.querySelector('[data-panel="' + key + '"]');
      if (target) target.classList.add('active');

      // Reset expand state on tab switch
      panels.classList.remove('expanded');
      expandBtn.classList.remove('rotated');
      checkOverflow();
    });

  }

  // ============================
  // Shared Rendering: Differences
  // ============================
  function renderDifferencesInto(containerId, countId, differences, showDevice) {
    var container = document.getElementById(containerId);
    var countEl = document.getElementById(countId);
    if (!container) return;
    container.innerHTML = '';
    if (countEl) countEl.textContent = differences.length;

    if (!differences || differences.length === 0) {
      container.innerHTML = '<p style="color:#646970;font-size:13px;">No significant issues found.</p>';
      return;
    }

    // Group differences by category
    var groups = {};
    var groupOrder = [];
    for (var i = 0; i < differences.length; i++) {
      var diff = differences[i];
      var catKey = diff.category || 'general';
      if (!groups[catKey]) {
        groups[catKey] = [];
        groupOrder.push(catKey);
      }
      diff._origIndex = i; // preserve original index for marker selection
      groups[catKey].push(diff);
    }

    // Sort groups: highest severity first, then by count
    var sevWeight = { high: 3, medium: 2, low: 1 };
    groupOrder.sort(function(a, b) {
      var aMax = 0, bMax = 0;
      groups[a].forEach(function(d) { aMax = Math.max(aMax, sevWeight[d.severity || 'low'] || 0); });
      groups[b].forEach(function(d) { bMax = Math.max(bMax, sevWeight[d.severity || 'low'] || 0); });
      if (bMax !== aMax) return bMax - aMax;
      return groups[b].length - groups[a].length;
    });

    var severityIcon = function(sev) {
      return sev === 'high'
        ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1L1 14h14L8 1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v4M8 11.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
        : sev === 'medium'
        ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v4M8 10.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="10.5" r="0.75" fill="currentColor"/></svg>';
    };

    // Summary bar: severity counts
    var highCount = 0, medCount = 0, lowCount = 0;
    differences.forEach(function(d) {
      var s = (d.severity || 'low').toLowerCase();
      if (s === 'high') highCount++;
      else if (s === 'medium') medCount++;
      else lowCount++;
    });

    var summaryBar = document.createElement('div');
    summaryBar.className = 'qaproof-diff-summary-bar';
    var barHtml = '';
    if (highCount > 0) barHtml += '<span class="qaproof-diff-sev-chip qaproof-diff-sev-chip-high">' + severityIcon('high') + ' ' + highCount + ' ' + (qaproof.i18n.monitorHigh || 'High') + '</span>';
    if (medCount > 0) barHtml += '<span class="qaproof-diff-sev-chip qaproof-diff-sev-chip-medium">' + severityIcon('medium') + ' ' + medCount + ' ' + (qaproof.i18n.monitorMedium || 'Medium') + '</span>';
    if (lowCount > 0) barHtml += '<span class="qaproof-diff-sev-chip qaproof-diff-sev-chip-low">' + severityIcon('low') + ' ' + lowCount + ' ' + (qaproof.i18n.monitorLow || 'Low') + '</span>';
    // Progress bar
    var total = differences.length;
    var highPct = Math.round((highCount / total) * 100);
    var medPct = Math.round((medCount / total) * 100);
    var lowPct = 100 - highPct - medPct;
    barHtml += '<div class="qaproof-diff-severity-bar">';
    if (highCount > 0) barHtml += '<div class="qaproof-sbar-seg qaproof-sbar-high" style="width:' + highPct + '%"></div>';
    if (medCount > 0) barHtml += '<div class="qaproof-sbar-seg qaproof-sbar-med" style="width:' + medPct + '%"></div>';
    if (lowCount > 0) barHtml += '<div class="qaproof-sbar-seg qaproof-sbar-low" style="width:' + lowPct + '%"></div>';
    barHtml += '</div>';
    summaryBar.innerHTML = barHtml;
    container.appendChild(summaryBar);

    // Render each category group
    var globalNum = 0;
    for (var g = 0; g < groupOrder.length; g++) {
      var catKey = groupOrder[g];
      var items = groups[catKey];
      var catLabel = catKey.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });

      // Count severities in this group
      var gHigh = 0, gMed = 0, gLow = 0;
      items.forEach(function(d) {
        var s = (d.severity || 'low').toLowerCase();
        if (s === 'high') gHigh++;
        else if (s === 'medium') gMed++;
        else gLow++;
      });
      var worstSev = gHigh > 0 ? 'high' : gMed > 0 ? 'medium' : 'low';

      var groupEl = document.createElement('div');
      groupEl.className = 'qaproof-diff-group' + (g > 0 ? ' collapsed' : '');
      groupEl.dataset.category = catKey;

      // Group header (collapsible)
      var headerEl = document.createElement('div');
      headerEl.className = 'qaproof-diff-group-header';
      var chipsSummary = '';
      if (gHigh > 0) chipsSummary += '<span class="qaproof-diff-mini-chip qaproof-diff-mini-high">' + gHigh + '</span>';
      if (gMed > 0) chipsSummary += '<span class="qaproof-diff-mini-chip qaproof-diff-mini-med">' + gMed + '</span>';
      if (gLow > 0) chipsSummary += '<span class="qaproof-diff-mini-chip qaproof-diff-mini-low">' + gLow + '</span>';

      headerEl.innerHTML =
        '<div class="qaproof-diff-group-left">' +
        '  <span class="qaproof-diff-group-accent qaproof-diff-group-accent-' + worstSev + '"></span>' +
        '  <span class="qaproof-diff-group-title">' + Q.escapeHtml(catLabel) + '</span>' +
        '  <span class="qaproof-diff-group-count">' + items.length + '</span>' +
        '</div>' +
        '<div class="qaproof-diff-group-right">' +
        chipsSummary +
        '  <span class="qaproof-diff-group-chevron">&#9662;</span>' +
        '</div>';

      // Toggle collapse
      headerEl.addEventListener('click', (function(grp) {
        return function() {
          grp.classList.toggle('collapsed');
        };
      })(groupEl));

      groupEl.appendChild(headerEl);

      // Group body (items)
      var bodyEl = document.createElement('div');
      bodyEl.className = 'qaproof-diff-group-body';

      for (var j = 0; j < items.length; j++) {
        globalNum++;
        var diff = items[j];
        diff._displayNum = globalNum; // sync marker number with list number
        var severity = diff.severity || 'low';

        var deviceLabelMap = { desktop: 'Desktop', tablet: 'Tablet', tablet_landscape: 'Tablet Landscape', mobile: 'Mobile', mobile_landscape: 'Mobile Landscape' };
        var deviceBadge = showDevice && diff.device
          ? '<span class="qaproof-badge qaproof-badge-device">' + Q.escapeHtml(deviceLabelMap[diff.device] || diff.device) + '</span>'
          : '';

        var el = document.createElement('div');
        el.className = 'qaproof-difference';
        el.dataset.index = diff._origIndex;
        el.dataset.severity = severity;
        if (diff.device) el.dataset.device = diff.device;

        el.innerHTML =
          '<div class="qaproof-diff-indicator qaproof-diff-indicator-' + severity + '">' +
          '  <span class="qaproof-diff-num">' + globalNum + '</span>' +
          '</div>' +
          '<div class="qaproof-diff-body">' +
          '  <div class="qaproof-diff-header">' +
          '    <span class="qaproof-severity-tag qaproof-severity-tag-' + severity + '">' + severityIcon(severity) + ' ' + Q.escapeHtml(Q.capitalize(severity)) + '</span>' +
          '    ' + deviceBadge +
          '  </div>' +
          '  <div class="qaproof-diff-description">' + Q.escapeHtml(diff.description || '') + '</div>' +
          '</div>';

        el.addEventListener('click', (function (idx) {
          return function () { selectDifference(idx); };
        })(diff._origIndex));

        bodyEl.appendChild(el);
      }

      groupEl.appendChild(bodyEl);
      container.appendChild(groupEl);
    }
  }

  // ============================
  // Shared Rendering: Recommendations
  // ============================
  function renderRecommendationsInto(containerId, recommendations, countId) {
    var list = document.getElementById(containerId);
    if (!list) return;
    list.innerHTML = '';

    var count = recommendations ? recommendations.length : 0;
    if (countId) {
      var countEl = document.getElementById(countId);
      if (countEl) countEl.textContent = count;
    }

    if (!recommendations || recommendations.length === 0) {
      list.innerHTML = '<div class="qaproof-rec-empty">No recommendations at this time.</div>';
      return;
    }

    function formatRecText(text) {
      var formatted = Q.escapeHtml(text)
        .replace(/\{([^}]+)\}/g, '<code class="qaproof-rec-code">{$1}</code>')
        .replace(/&lt;(\/?[\w-]+(?:\s+[\w-]+(?:=&#039;[^&#]*&#039;)?)?\s*\/?)&gt;/g, '<code class="qaproof-rec-tag">&lt;$1&gt;</code>');
      formatted = formatted.replace(/(WCAG\s+[\d.]+\s+SC\s+[\d.]+(?:\s+[\w\s,&]+)?(?:\([^)]+\))?)/g, '<span class="qaproof-rec-wcag">$1</span>');
      formatted = formatted.replace(/(#[0-9A-Fa-f]{3,8})\b/g, '<span class="qaproof-rec-color"><span class="qaproof-rec-swatch" style="background:$1"></span>$1</span>');
      return formatted;
    }

    // Classify recommendations: "code" recs contain CSS/HTML snippets, "quick" are short, rest are "structural"
    var codeRecs = [];
    var quickRecs = [];
    var structuralRecs = [];

    for (var i = 0; i < recommendations.length; i++) {
      var text = recommendations[i];
      var hasCode = /\{[^}]+\}|<[a-z]/.test(text);
      var isShort = text.length < 120;
      if (hasCode) {
        codeRecs.push({ text: text, num: i + 1 });
      } else if (isShort) {
        quickRecs.push({ text: text, num: i + 1 });
      } else {
        structuralRecs.push({ text: text, num: i + 1 });
      }
    }

    // Summary bar
    var recTotal = recommendations.length;
    var recSummaryBar = document.createElement('div');
    recSummaryBar.className = 'qaproof-diff-summary-bar';
    var recBarHtml = '';
    if (codeRecs.length > 0) recBarHtml += '<span class="qaproof-diff-sev-chip qaproof-diff-sev-chip-high"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M5.5 4L2 8l3.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 4L14 8l-3.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + codeRecs.length + ' Code Fixes</span>';
    if (quickRecs.length > 0) recBarHtml += '<span class="qaproof-diff-sev-chip qaproof-diff-sev-chip-medium"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v6l4 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/></svg> ' + quickRecs.length + ' Quick Wins</span>';
    if (structuralRecs.length > 0) recBarHtml += '<span class="qaproof-diff-sev-chip qaproof-diff-sev-chip-low"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/></svg> ' + structuralRecs.length + ' Structural</span>';
    var codePct  = Math.round((codeRecs.length / recTotal) * 100);
    var quickPct = Math.round((quickRecs.length / recTotal) * 100);
    var structPct = 100 - codePct - quickPct;
    recBarHtml += '<div class="qaproof-diff-severity-bar">';
    if (codeRecs.length > 0)     recBarHtml += '<div class="qaproof-sbar-seg qaproof-sbar-high" style="width:' + codePct + '%"></div>';
    if (quickRecs.length > 0)    recBarHtml += '<div class="qaproof-sbar-seg qaproof-sbar-med" style="width:' + quickPct + '%"></div>';
    if (structuralRecs.length > 0) recBarHtml += '<div class="qaproof-sbar-seg qaproof-sbar-low" style="width:' + structPct + '%"></div>';
    recBarHtml += '</div>';
    recSummaryBar.innerHTML = recBarHtml;
    list.appendChild(recSummaryBar);

    var rectypeIcon = {
      code:       '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M5.5 4L2 8l3.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 4L14 8l-3.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      quick:      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v6l4 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/></svg>',
      structural: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>',
    };
    // code→high colors, quick→medium, structural→low
    var rectypeColor = { code: 'high', quick: 'medium', structural: 'low' };

    var recGroupIndex = 0;
    function renderRecGroup(label, items, rectype) {
      if (items.length === 0) return;
      var color = rectypeColor[rectype];

      var groupEl = document.createElement('div');
      groupEl.className = 'qaproof-diff-group' + (recGroupIndex > 0 ? ' collapsed' : '');
      groupEl.dataset.rectype = rectype;
      recGroupIndex++;

      var headerEl = document.createElement('div');
      headerEl.className = 'qaproof-diff-group-header';
      headerEl.innerHTML =
        '<div class="qaproof-diff-group-left">' +
        '  <span class="qaproof-diff-group-accent qaproof-diff-group-accent-' + color + '"></span>' +
        '  <span class="qaproof-diff-group-title">' + Q.escapeHtml(label) + '</span>' +
        '  <span class="qaproof-diff-group-count">' + items.length + '</span>' +
        '</div>' +
        '<div class="qaproof-diff-group-right">' +
        '  <span class="qaproof-diff-mini-chip qaproof-diff-mini-' + (color === 'high' ? 'high' : color === 'medium' ? 'med' : 'low') + '">' + items.length + '</span>' +
        '  <span class="qaproof-diff-group-chevron">&#9662;</span>' +
        '</div>';

      headerEl.addEventListener('click', (function(grp) {
        return function() { grp.classList.toggle('collapsed'); };
      })(groupEl));

      groupEl.appendChild(headerEl);

      var bodyEl = document.createElement('div');
      bodyEl.className = 'qaproof-diff-group-body';

      for (var j = 0; j < items.length; j++) {
        var rec = items[j];
        var item = document.createElement('div');
        item.className = 'qaproof-difference';
        item.innerHTML =
          '<div class="qaproof-diff-indicator qaproof-diff-indicator-' + color + '">' +
          '  <span class="qaproof-diff-num">' + rec.num + '</span>' +
          '</div>' +
          '<div class="qaproof-diff-body">' +
          '  <div class="qaproof-diff-header">' +
          '    <span class="qaproof-severity-tag qaproof-severity-tag-' + color + '">' + rectypeIcon[rectype] + ' ' + Q.escapeHtml(label) + '</span>' +
          '  </div>' +
          '  <div class="qaproof-diff-description">' + formatRecText(rec.text) + '</div>' +
          '</div>';
        bodyEl.appendChild(item);
      }

      groupEl.appendChild(bodyEl);
      list.appendChild(groupEl);
    }

    renderRecGroup('Code Fixes', codeRecs, 'code');
    renderRecGroup('Quick Wins', quickRecs, 'quick');
    renderRecGroup('Structural Changes', structuralRecs, 'structural');

    // Wire up filter buttons
    var filterId = containerId.replace('qaproof-', 'qaproof-').replace('-recommendations', '-rec-filter');
    // Build filter ID from containerId: e.g. "qaproof-recommendations" → "qaproof-rec-filter"
    var filterMap = {
      'qaproof-recommendations':      'qaproof-rec-filter',
      'qaproof-resp-recommendations':  'qaproof-resp-rec-filter',
      'qaproof-a11y-recommendations':  'qaproof-a11y-rec-filter',
      'qaproof-da-recommendations':    'qaproof-da-rec-filter',
    };
    var filterContainer = document.getElementById(filterMap[containerId] || '');
    if (filterContainer) {
      // Hide buttons for empty categories
      var counts = { code: codeRecs.length, quick: quickRecs.length, structural: structuralRecs.length };
      filterContainer.querySelectorAll('.qaproof-filter-btn[data-rectype]').forEach(function (btn) {
        var rt = btn.dataset.rectype;
        if (rt !== 'all' && counts[rt] === 0) {
          btn.style.display = 'none';
        }
      });

      filterContainer.addEventListener('click', function (e) {
        var btn = e.target.closest('.qaproof-filter-btn');
        if (!btn) return;
        filterContainer.querySelectorAll('.qaproof-filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var rectype = btn.dataset.rectype;
        list.querySelectorAll('.qaproof-diff-group').forEach(function (grp) {
          grp.style.display = (rectype === 'all' || grp.dataset.rectype === rectype) ? '' : 'none';
        });
      });
    }
  }

  // ============================
  // Tooltips
  // ============================
  function ensureGlobalTooltip() {
    if (!S.globalTooltip) {
      S.globalTooltip = document.createElement('div');
      S.globalTooltip.className = 'qaproof-marker-tooltip';
      document.getElementById('qaproof-app').appendChild(S.globalTooltip);

      // Close button and diff-link clicks
      S.globalTooltip.addEventListener('click', function (e) {
        if (e.target.closest('.tooltip-close')) {
          hideTooltip();
          return;
        }
        var diffLink = e.target.closest('.tooltip-diff-link');
        if (diffLink) {
          var origIdx = parseInt(diffLink.dataset.diffIdx, 10);
          hideTooltip();
          selectDifference(origIdx, 'marker');
        }
      });

      // Close on click outside tooltip and markers
      document.addEventListener('click', function (e) {
        if (!S.globalTooltip || !S.globalTooltip.classList.contains('visible')) return;
        if (e.target.closest('.tooltip-close')) return; // handled above
        if (S.globalTooltip.contains(e.target)) return; // click inside tooltip — keep open
        if (e.target.closest('.qaproof-marker')) return; // marker click — keep open
        hideTooltip();
      });

      // Close on any scroll anywhere on the page
      window.addEventListener('scroll', function () { hideTooltip(); }, true);
    }
    return S.globalTooltip;
  }

  function buildTooltipHTML(data) {
    // data can be:
    //   { severity, category, description } — single issue
    //   { severity: 'multi', items: [{ severity, description }...] } — pie/grouped
    var html = '';
    var sevLabels = { high: (qaproof.i18n.pdfSeverityCritical || 'High Severity'), medium: (qaproof.i18n.monitorMedium || 'Medium'), low: (qaproof.i18n.monitorLow || 'Low Severity'), multi: (qaproof.i18n.multipleIssues || 'Multiple Issues') };

    var closeBtn = '<button type="button" class="tooltip-close" aria-label="Close">\u00d7</button>';

    if (data.items) {
      // Multi-issue tooltip
      html += '<div class="tooltip-header sev-multi"><span class="sev-dot"></span>' + data.items.length + ' Issues Found' + closeBtn + '</div>';
      html += '<div class="tooltip-body">';
      for (var i = 0; i < data.items.length; i++) {
        var item = data.items[i];
        html += '<div class="tooltip-item">';
        html += '<div class="sev-indicator ind-' + Q.escapeHtml(item.severity) + '"></div>';
        html += '<button type="button" class="tooltip-diff-link" data-diff-idx="' + item.origIdx + '">#' + item.num + '</button>';
        html += '<div>' + Q.escapeHtml(item.description) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    } else {
      // Single issue tooltip
      var sev = data.severity || 'low';
      html += '<div class="tooltip-header sev-' + Q.escapeHtml(sev) + '"><span class="sev-dot"></span>' + Q.escapeHtml(sevLabels[sev] || sev) + closeBtn + '</div>';
      html += '<div class="tooltip-body">';
      if (data.category) {
        html += '<span class="tooltip-category">' + Q.escapeHtml(data.category) + '</span>';
      }
      html += '<button type="button" class="tooltip-diff-link" data-diff-idx="' + data.origIdx + '">#' + data.num + '</button>';
      html += '<div>' + Q.escapeHtml(data.description) + '</div>';
      html += '</div>';
    }
    return html;
  }

  function showTooltip(marker, data) {
    var tooltip = ensureGlobalTooltip();

    // Support legacy plain string calls (backwards compat)
    if (typeof data === 'string') {
      tooltip.innerHTML = '<div class="tooltip-body">' + Q.escapeHtml(data) + '</div>';
    } else {
      tooltip.innerHTML = buildTooltipHTML(data);
    }
    tooltip.classList.add('visible');

    var rect = marker.getBoundingClientRect();
    var tooltipRect = tooltip.getBoundingClientRect();

    var left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    var top = rect.top - tooltipRect.height - 12;

    if (left < 8) left = 8;
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }
    if (top < 8) {
      top = rect.bottom + 12;
      tooltip.classList.add('tooltip-below');
    } else {
      tooltip.classList.remove('tooltip-below');
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hideTooltip() {
    if (S.globalTooltip) {
      S.globalTooltip.classList.remove('visible');
    }
  }

  function renderMarkers(differences) {
    var markersFigma = document.getElementById('qaproof-markers-figma');
    var markersLive = document.getElementById('qaproof-markers-live');
    renderMarkersIntoLayer(markersFigma, differences);
    renderMarkersIntoLayer(markersLive, differences);
  }

  function renderMarkersForDevice(device, differences) {
    var markersLayer = document.getElementById('qaproof-markers-' + device);
    renderMarkersIntoLayer(markersLayer, differences, function (diff) {
      // Normalize API device names that don't match tab IDs (e.g. tablet_portrait → tablet)
      var diffDevice = diff.device === 'tablet_portrait' ? 'tablet' : diff.device;
      return !diffDevice || diffDevice === device;
    });
  }

  // ============================
  // Selection & Cross-Linking
  // ============================
  /**
   * @param {number} index - difference index
   * @param {string} origin - 'marker' if clicked from screenshot marker,
   *                          'list' if clicked from issues list (default)
   */
  function selectDifference(index, origin) {
    deselectAll();
    S.activeDiffIndex = index;

    // Highlight the clicked difference in the list
    var diffEl = S.resultsContainer.querySelector('.qaproof-difference[data-index="' + index + '"]');
    if (diffEl) {
      diffEl.classList.add('active');
    }

    // Highlight markers on screenshots (including pie markers that contain this index)
    S.resultsContainer.querySelectorAll('.qaproof-marker').forEach(function (marker) {
      if (marker.dataset.index === String(index)) {
        marker.classList.add('active');
      } else if (marker.dataset.indices) {
        var indices = marker.dataset.indices.split(',');
        if (indices.indexOf(String(index)) !== -1) {
          marker.classList.add('active');
        }
      }
    });

    if (origin === 'marker') {
      // Clicked from a screenshot marker → scroll DOWN to the issue in the list.
      // First, expand the parent category group if it's collapsed.
      if (diffEl) {
        var group = diffEl.closest('.qaproof-diff-group');
        if (group && group.classList.contains('collapsed')) {
          var groupHeader = group.querySelector('.qaproof-diff-group-header');
          if (groupHeader) groupHeader.click();
        }
        setTimeout(function () {
          diffEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      }
    } else {
      // Clicked from the issues list → scroll UP to the screenshot and
      // scroll within the screenshot wrapper to the marker position.
      var comparisonSection = S.resultsContainer.querySelector('.qaproof-comparison-viewport') ||
                              S.resultsContainer.querySelector('.qaproof-device-screenshot-wrapper');
      if (comparisonSection) {
        Q.scrollToElement(comparisonSection);
      }

      setTimeout(function () {
        var testType = S.testType;
        if (testType === 'fidelity') {
          scrollScreenshotsToMarker(index);
        } else if (testType === 'accessibility') {
          scrollAccessibilityScreenshotToMarker(index);
        } else {
          var diff = S.allDifferences[index];
          if (diff && diff.device && diff.device !== S.activeDevice) {
            switchDeviceTab(diff.device);
          }
          scrollDeviceScreenshotToMarker(index);
        }
      }, 400);
    }
  }

  function deselectAll() {
    S.resultsContainer.querySelectorAll('.qaproof-difference.active').forEach(function (el) {
      el.classList.remove('active');
    });
    S.resultsContainer.querySelectorAll('.qaproof-marker.active').forEach(function (el) {
      el.classList.remove('active');
    });
    S.activeDiffIndex = null;
  }

  function scrollScreenshotsToMarker(index) {
    var diff = S.allDifferences[index];
    if (!diff || !diff.location) return;

    var wrapperFigma = document.getElementById('qaproof-wrapper-figma');
    var wrapperLive = document.getElementById('qaproof-wrapper-live');
    if (!wrapperFigma || !wrapperLive) return;

    S.isScrollSyncing = true;

    var innerFigma = wrapperFigma.querySelector('.qaproof-screenshot-inner');
    var figmaTargetTop = (diff.location.top / 100) * innerFigma.offsetHeight - wrapperFigma.clientHeight / 2;
    wrapperFigma.scrollTo({ top: Math.max(0, figmaTargetTop), behavior: 'smooth' });

    var innerLive = wrapperLive.querySelector('.qaproof-screenshot-inner');
    var liveTargetTop = (diff.location.top / 100) * innerLive.offsetHeight - wrapperLive.clientHeight / 2;
    wrapperLive.scrollTo({ top: Math.max(0, liveTargetTop), behavior: 'smooth' });

    setTimeout(function () { S.isScrollSyncing = false; }, 600);
  }

  function scrollDeviceScreenshotToMarker(index) {
    var diff = S.allDifferences[index];
    if (!diff || !diff.location) return;

    var device = diff.device || S.activeDevice;
    var panel = document.getElementById('qaproof-panel-' + device);
    if (!panel) return;

    var wrapper = panel.querySelector('.qaproof-device-screenshot-wrapper');
    var inner = panel.querySelector('.qaproof-screenshot-inner');
    if (!wrapper || !inner) return;

    var targetTop = (diff.location.top / 100) * inner.offsetHeight - wrapper.clientHeight / 2;
    wrapper.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }

  function scrollAccessibilityScreenshotToMarker(index) {
    var diff = S.allDifferences[index];
    if (!diff || !diff.location) return;

    var wrapper = S.resultsContainer.querySelector('.qaproof-device-screenshot-wrapper');
    var inner = S.resultsContainer.querySelector('.qaproof-screenshot-inner');
    if (!wrapper || !inner) return;

    var targetTop = (diff.location.top / 100) * inner.offsetHeight - wrapper.clientHeight / 2;
    wrapper.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }

  // ============================
  // Device Tabs (Responsive)
  // ============================
  function setupDeviceTabs() {
    S.resultsContainer.querySelectorAll('.qaproof-device-tabs').forEach(function (container) {
      // Create sliding indicator
      var slider = document.createElement('div');
      slider.className = 'qaproof-device-tab-slider';
      container.appendChild(slider);

      function moveSlider(btn) {
        var navRect = container.getBoundingClientRect();
        var btnRect = btn.getBoundingClientRect();
        slider.style.width = btnRect.width + 'px';
        slider.style.height = btnRect.height + 'px';
        slider.style.transform = 'translateX(' + (btnRect.left - navRect.left - container.clientLeft) + 'px) translateY(' + (btnRect.top - navRect.top - container.clientTop) + 'px)';
      }

      // Initial position without transition
      requestAnimationFrame(function () {
        var activeTab = container.querySelector('.qaproof-device-tab.active');
        if (activeTab) {
          slider.style.transition = 'none';
          moveSlider(activeTab);
          requestAnimationFrame(function () {
            slider.style.transition = '';
          });
        }
      });

      container.querySelectorAll('.qaproof-device-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          var device = tab.dataset.device;
          container.querySelectorAll('.qaproof-device-tab').forEach(function (t) {
            t.classList.toggle('active', t.dataset.device === device);
          });
          moveSlider(tab);
          switchDeviceTab(device);
        });
      });
    });
  }

  function switchDeviceTab(device) {
    S.activeDevice = device;

    // Switch visible panel
    S.resultsContainer.querySelectorAll('.qaproof-device-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'qaproof-panel-' + device);
    });

    // Sync tab button active states (fixes programmatic calls that bypass the click handler)
    S.resultsContainer.querySelectorAll('.qaproof-device-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.device === device);
    });

    // Move slider to newly-active tab
    S.resultsContainer.querySelectorAll('.qaproof-device-tabs').forEach(function (container) {
      var slider = container.querySelector('.qaproof-device-tab-slider');
      var activeBtn = container.querySelector('.qaproof-device-tab[data-device="' + device + '"]');
      if (slider && activeBtn) {
        var navRect = container.getBoundingClientRect();
        var btnRect = activeBtn.getBoundingClientRect();
        slider.style.width  = btnRect.width  + 'px';
        slider.style.height = btnRect.height + 'px';
        slider.style.transform = 'translateX(' + (btnRect.left - navRect.left - container.clientLeft) + 'px) translateY(' + (btnRect.top - navRect.top - container.clientTop) + 'px)';
      }
    });

    renderMarkersForDevice(device, S.allDifferences);
  }

  // ============================
  // Synchronized Scrolling (Fidelity)
  // ============================
  function setupSyncScroll() {
    var wrapperFigma = document.getElementById('qaproof-wrapper-figma');
    var wrapperLive = document.getElementById('qaproof-wrapper-live');
    if (!wrapperFigma || !wrapperLive) return;

    function syncScroll(source, target) {
      if (!S.syncScrollEnabled || S.isScrollSyncing) return;
      S.isScrollSyncing = true;

      var maxScroll = source.scrollHeight - source.clientHeight;
      var scrollPercent = maxScroll > 0 ? source.scrollTop / maxScroll : 0;
      var targetMax = target.scrollHeight - target.clientHeight;
      target.scrollTop = scrollPercent * targetMax;

      requestAnimationFrame(function () { S.isScrollSyncing = false; });
    }

    wrapperFigma.addEventListener('scroll', function () {
      hideTooltip();
      syncScroll(wrapperFigma, wrapperLive);
    });
    wrapperLive.addEventListener('scroll', function () {
      hideTooltip();
      syncScroll(wrapperLive, wrapperFigma);
    });
  }

  // ============================
  // Toolbar (Fidelity)
  // ============================
  function setupToolbar() {
    var toggleMarkersBtn = document.getElementById('qaproof-toggle-markers');
    var toggleSyncBtn = document.getElementById('qaproof-toggle-sync');
    if (!toggleMarkersBtn || !toggleSyncBtn) return;

    toggleMarkersBtn.addEventListener('click', function () {
      S.markersVisible = !S.markersVisible;
      toggleMarkersBtn.classList.toggle('active', S.markersVisible);
      S.resultsContainer.querySelectorAll('.qaproof-markers-layer').forEach(function (layer) {
        layer.style.display = S.markersVisible ? '' : 'none';
      });
    });

    toggleSyncBtn.addEventListener('click', function () {
      S.syncScrollEnabled = !S.syncScrollEnabled;
      toggleSyncBtn.classList.toggle('active', S.syncScrollEnabled);
    });
  }

  // ============================
  // Filter Setup
  // ============================
  function setupFilterFor(filterId, filterKey) {
    var filterContainer = document.getElementById(filterId);
    if (!filterContainer) return;

    filterContainer.addEventListener('click', function (e) {
      var btn = e.target.closest('.qaproof-filter-btn');
      if (!btn) return;

      filterContainer.querySelectorAll('.qaproof-filter-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      var filterValue = btn.dataset[filterKey];

      // Determine diff container
      var diffContainerId;
      if (filterId.indexOf('a11y') !== -1) {
        diffContainerId = 'qaproof-a11y-differences';
      } else if (filterId.indexOf('resp') !== -1 || filterId === 'qaproof-device-filter') {
        diffContainerId = 'qaproof-resp-differences';
      } else if (filterId.indexOf('da-') !== -1) {
        diffContainerId = 'qaproof-da-differences';
      } else {
        diffContainerId = 'qaproof-differences';
      }

      var diffContainer = document.getElementById(diffContainerId);
      if (diffContainer) {
        diffContainer.querySelectorAll('.qaproof-difference').forEach(function (el) {
          var elValue = el.dataset[filterKey];
          if (filterValue === 'all' || elValue === filterValue) {
            el.classList.remove('filtered-out');
          } else {
            el.classList.add('filtered-out');
          }
        });

        // Hide groups where all items are filtered out + manage collapse state
        var visibleGroupIndex = 0;
        diffContainer.querySelectorAll('.qaproof-diff-group').forEach(function (grp) {
          var visibleItems = grp.querySelectorAll('.qaproof-difference:not(.filtered-out)');
          if (visibleItems.length === 0) {
            grp.style.display = 'none';
          } else {
            grp.style.display = '';
            if (filterValue === 'all') {
              // "All" tab: only first visible group open, rest collapsed
              if (visibleGroupIndex === 0) {
                grp.classList.remove('collapsed');
              } else {
                grp.classList.add('collapsed');
              }
            } else {
              // Specific filter tab: expand all visible groups
              grp.classList.remove('collapsed');
            }
            visibleGroupIndex++;
          }
        });
      }

      // Filter markers for severity
      if (filterKey === 'severity') {
        var isA11y = filterId.indexOf('a11y') !== -1;
        var isResp = filterId.indexOf('resp') !== -1;
        var markersContainer;
        if (isA11y) {
          markersContainer = document.getElementById('qaproof-markers-a11y');
        } else if (isResp) {
          markersContainer = document.getElementById('qaproof-markers-' + S.activeDevice);
        } else {
          markersContainer = S.resultsContainer;
        }
        if (markersContainer) {
          markersContainer.querySelectorAll('.qaproof-marker').forEach(function (marker) {
            if (filterValue === 'all') {
              marker.style.display = '';
              return;
            }
            // For pie markers, check if ANY contained diff matches the filter
            var indices = marker.dataset.indices
              ? marker.dataset.indices.split(',').map(Number)
              : [parseInt(marker.dataset.index, 10)];
            var anyMatch = false;
            for (var m = 0; m < indices.length; m++) {
              var diff = S.allDifferences[indices[m]];
              if (diff && diff[filterKey] === filterValue) { anyMatch = true; break; }
            }
            marker.style.display = anyMatch ? '' : 'none';
          });
        }
      }
    });
  }

  // ============================
  // Expose on namespace
  // ============================
  Q.buildBackButtonHtml = buildBackButtonHtml;
  Q.buildScoreRingHtml = buildScoreRingHtml;
  Q.buildReportStatsHtml = buildReportStatsHtml;
  Q.buildReportStatsInlineHtml = buildReportStatsInlineHtml;
  Q.buildReportChartsHtml = buildReportChartsHtml;
  Q.buildFeedbackSectionHtml = buildFeedbackSectionHtml;
  Q.initFeedbackSection = initFeedbackSection;
  Q.initReportCharts = initReportCharts;
  Q.renderFidelityResults = renderFidelityResults;
  Q.renderResponsiveResults = renderResponsiveResults;
  Q.renderAccessibilityResults = renderAccessibilityResults;
  Q.renderDesignAuditResults = renderDesignAuditResults;
  Q.renderCategoriesInto = renderCategoriesInto;
  Q.renderDifferencesInto = renderDifferencesInto;
  Q.renderRecommendationsInto = renderRecommendationsInto;
  Q.renderMarkers = renderMarkers;
  Q.renderMarkersIntoLayer = renderMarkersIntoLayer;
  Q.renderMarkersForDevice = renderMarkersForDevice;
  Q.renderAccessibilityMarkers = renderAccessibilityMarkers;
  Q.selectDifference = selectDifference;
  Q.deselectAll = deselectAll;
  Q.setupDeviceTabs = setupDeviceTabs;
  Q.switchDeviceTab = switchDeviceTab;
  Q.setupSyncScroll = setupSyncScroll;
  Q.setupToolbar = setupToolbar;
  Q.setupFilterFor = setupFilterFor;
  Q.showTooltip = showTooltip;
  Q.hideTooltip = hideTooltip;
  Q.categoryDescriptions = categoryDescriptions;

})();