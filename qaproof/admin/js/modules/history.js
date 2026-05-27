/* global qaproof */
(function () {
  'use strict';
  var Q = window.QAProof;

  // ============================
  // Test History — Reusable Factory
  // ============================

  /**
   * Creates a self-contained history manager for any page.
   *
   * @param {Object} cfg
   * @param {string} cfg.sectionId       — wrapper element ID
   * @param {string} cfg.contentId       — collapsible content ID
   * @param {string} cfg.toggleId        — collapse toggle button ID
   * @param {string} cfg.listId          — row container ID
   * @param {string} cfg.loadingId       — loading spinner ID
   * @param {string} cfg.emptyId         — empty-state ID
   * @param {string} cfg.loadMoreId      — load-more button ID
   * @param {string} cfg.filtersId       — filter tabs container ID
   * @param {string} cfg.defaultType     — pre-set filter type ('' = all)
   * @param {string} [cfg.excludeType]   — test type to always exclude from results
   * @param {number} [cfg.perPage=10]    — items per page
   * @param {Element} cfg.resultLoadingEl  — loading element to show while fetching a single result
   * @param {Element} cfg.resultLoadingTextEl — text element inside loading
   * @param {Element} cfg.resultContainerEl   — results container to render into
   * @param {Function} cfg.renderResult  — function(resultData) to display a history item's full result
   * @param {Function} [cfg.showError]   — function(msg) to display errors
   * @returns {Object|null}
   */
  function createHistoryManager(cfg) {
    var section   = document.getElementById(cfg.sectionId);
    if (!section) return null;

    var content   = document.getElementById(cfg.contentId);
    var toggle    = document.getElementById(cfg.toggleId);
    var list      = document.getElementById(cfg.listId);
    var hLoading  = document.getElementById(cfg.loadingId);
    var empty     = document.getElementById(cfg.emptyId);
    var loadMore  = document.getElementById(cfg.loadMoreId);
    var filters   = document.getElementById(cfg.filtersId);

    var filterType = cfg.defaultType || '';
    var offset     = 0;
    var limit      = cfg.perPage || 10;
    var total      = 0;
    var collapsed  = true;

    function init() {
      // Toggle collapse
      if (toggle) {
        toggle.addEventListener('click', function () {
          collapsed = !collapsed;
          content.classList.toggle('hidden', collapsed);
          section.classList.toggle('is-collapsed', collapsed);
          toggle.querySelector('.dashicons').className = 'dashicons dashicons-arrow-' + (collapsed ? 'down' : 'up') + '-alt2';
          if (!collapsed && list && list.children.length === 0) {
            load(true);
          }
        });
        content.classList.add('hidden');
      }

      // Filter tabs
      if (filters) {
        filters.addEventListener('click', function (e) {
          var btn = e.target.closest('.qaproof-filter-btn');
          if (!btn) return;
          filters.querySelectorAll('.qaproof-filter-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          filterType = btn.dataset.type || '';
          offset = 0;
          load(true);
        });
      }

      // Load More
      if (loadMore) {
        loadMore.addEventListener('click', function () { load(false); });
      }
    }

    function load(reset) {
      if (reset) {
        offset = 0;
        if (list) list.innerHTML = '';
      }
      if (hLoading) hLoading.classList.remove('hidden');
      if (empty) empty.classList.add('hidden');
      if (loadMore) loadMore.classList.add('hidden');

      var base = qaproof.restBase.replace(/\/+$/, '');
      var sep = base.indexOf('?') !== -1 ? '&' : '?';
      var url = base + '/test-history' + sep + 'limit=' + limit + '&offset=' + offset;
      if (filterType) url += '&test_type=' + filterType;
      if (cfg.excludeType && !filterType) url += '&exclude_type=' + cfg.excludeType;

      fetch(url, {
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin'
      })
        .then(Q.safeJson)
        .then(function (resp) {
          if (hLoading) hLoading.classList.add('hidden');
          if (!resp.success) {
            if (offset === 0 && empty) empty.classList.remove('hidden');
            return;
          }

          total = resp.total || 0;
          var items = resp.data || [];

          if (items.length === 0 && offset === 0) {
            if (empty) empty.classList.remove('hidden');
            return;
          }

          items.forEach(function (item) {
            if (list) list.appendChild(buildRow(item));
          });

          offset += items.length;
          if (offset < total && loadMore) {
            loadMore.classList.remove('hidden');
          }
        })
        .catch(function (err) {
          if (hLoading) hLoading.classList.add('hidden');
          if (offset === 0 && empty) empty.classList.remove('hidden');
          if (typeof console !== 'undefined') console.warn('[QAProof] History load error:', err);
        });
    }

    function buildRow(item) {
      var row = document.createElement('div');
      row.className = 'qaproof-history-row';
      row.dataset.id = item.id;

      var score = item.score != null ? parseInt(item.score, 10) : null;
      var scoreClass = score != null ? Q.getScoreClass(score) : '';
      var typeBadgeClass = 'qaproof-badge-' + (item.test_type || 'fidelity');
      var typeLabels = { fidelity: (qaproof.i18n.histTestTypeFidelity || 'Fidelity'), responsive: (qaproof.i18n.histTestTypeResponsive || 'Responsive'), accessibility: (qaproof.i18n.histTestTypeA11y || 'Accessibility'), regression: (qaproof.i18n.histTestTypeRegression || 'Regression'), 'design-audit': (qaproof.i18n.histTestTypeDesignAudit || 'Design Audit') };
      var dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      var urlDisplay = item.page_url || '';
      if (urlDisplay.length > 50) urlDisplay = urlDisplay.substring(0, 50) + '...';

      row.innerHTML =
        '<div class="qaproof-history-date">' + Q.escapeHtml(dateStr) + '</div>' +
        '<div class="qaproof-history-type"><span class="qaproof-badge ' + typeBadgeClass + '">' + Q.escapeHtml(typeLabels[item.test_type] || item.test_type) + '</span></div>' +
        '<div class="qaproof-history-url" title="' + Q.escapeAttr(item.page_url || '') + '">' + Q.escapeHtml(urlDisplay) + '</div>' +
        '<div class="qaproof-history-score ' + scoreClass + '">' + (score != null ? score : '\u2014') + '</div>' +
        '<div class="qaproof-history-actions">' +
        '  <button type="button" class="button button-small qaproof-history-view" data-id="' + item.id + '" title="' + (qaproof.i18n.histViewReport || 'View report') + '">' +
        '    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
        '    ' + (qaproof.i18n.histView || 'View') +
        '  </button>' +
        '  <button type="button" class="button button-small qaproof-history-download" data-id="' + item.id + '" title="' + (qaproof.i18n.histDownloadPdf || 'Download PDF report') + '">' +
        '    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        '  </button>' +
        '  <button type="button" class="button button-small qaproof-history-delete" data-id="' + item.id + '" title="' + (qaproof.i18n.histDelete || 'Delete') + '">' +
        '    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
        '  </button>' +
        '</div>';

      row.querySelector('.qaproof-history-view').addEventListener('click', function () {
        viewItem(item.id);
      });

      row.querySelector('.qaproof-history-download').addEventListener('click', function () {
        downloadItemPdf(item.id);
      });

      row.querySelector('.qaproof-history-delete').addEventListener('click', function () {
        Q.confirm(
          qaproof.i18n.histDeleteConfirm || 'Delete this test result?',
          { danger: true, okLabel: qaproof.i18n.modalDelete || 'Delete' }
        ).then(function (ok) {
          if (ok) deleteItem(item.id, row);
        });
      });

      return row;
    }

    function parseJson(raw) {
      if (!raw) return null;
      if (typeof raw !== 'string') return raw;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function parseResultData(item) {
      var screenshots = parseJson(item.screenshots_json) || {};
      var extractedData = parseJson(item.extracted_data_json) || {};

      // Reconstruct screenshotsAvailable so the screenshot section renders
      // even when screenshots were compressed+saved (desktop key present) or
      // when the save failed (no screenshots — at least show that they existed).
      var screenshotKeys = Object.keys(screenshots).filter(function (k) { return !!screenshots[k]; });
      var screenshotsAvailable = screenshotKeys.length > 0 ? screenshotKeys : null;

      var result = {
        testType: item.test_type,
        score: item.score != null ? parseInt(item.score, 10) : null,
        summary: item.summary || '',
        categories: parseJson(item.categories_json) || {},
        differences: parseJson(item.differences_json) || [],
        recommendations: parseJson(item.recommendations_json) || [],
        screenshots: screenshots,
        screenshotsAvailable: screenshotsAvailable,
        pageUrl: item.page_url,
      };

      // Restore design-audit extracted data (designSystem, components, designDebtScore)
      if (extractedData.designSystem) result.designSystem = extractedData.designSystem;
      if (extractedData.components) result.components = extractedData.components;
      if (extractedData.designDebtScore != null) result.designDebtScore = extractedData.designDebtScore;
      // Restore WCAG target level so PDF subtitle shows the correct level (A/AA/AAA)
      if (extractedData.wcagLevel) result.targetWcagLevel = extractedData.wcagLevel;

      // Restore render-branch flags from the raw result blob. Without these
      // the renderer falls through to the generic score UI even when the
      // original test was a mismatch ("design and live page are different
      // sites") or an element-mode no-match — both have meaningful recovery
      // panels that depend on these booleans. history_save() in
      // class-api-client.php is responsible for putting them in `result` on
      // save; parseResultData lifts them back out on read. Keep the two
      // lists in lockstep.
      var rawResult = parseJson(item.result) || {};
      var passthroughFlags = [
        'mismatch', 'designSite', 'liveSite',
        'elementTest', 'matched',
        'freshnessCheckFailed', 'scoreRecomputed',
        'parseFailed',
      ];
      passthroughFlags.forEach(function (k) {
        if (rawResult[k] !== undefined) result[k] = rawResult[k];
      });

      return result;
    }

    function viewItem(id) {
      var rLoading = cfg.resultLoadingEl;
      var rText    = cfg.resultLoadingTextEl;
      var rContainer = cfg.resultContainerEl;

      // Switch to test/audit tab, hide form, mark source
      if (cfg.onBeforeView) cfg.onBeforeView();

      if (rLoading) {
        rLoading.classList.remove('hidden');
        rLoading.style.display = '';
      }
      if (rText) rText.textContent = qaproof.i18n.histLoadingResult || 'Loading test result...';
      if (rContainer) rContainer.classList.add('hidden');

      fetch(qaproof.restBase.replace(/\/+$/, '') + '/test-history/' + id, {
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin'
      })
        .then(Q.safeJson)
        .then(function (resp) {
          if (rLoading) rLoading.classList.add('hidden');
          if (!resp.success || !resp.data) {
            if (cfg.showError) cfg.showError(qaproof.i18n.histCouldNotLoad || 'Could not load test result.');
            return;
          }

          var resultData = parseResultData(resp.data);

          // Use page-specific render callback if provided
          if (cfg.renderResult) {
            cfg.renderResult(resultData);
          } else {
            // Fallback: use global render functions (Tests page)
            if (resultData.testType === 'responsive') {
              Q.renderResponsiveResults(resultData);
            } else if (resultData.testType === 'accessibility') {
              Q.renderAccessibilityResults(resultData);
            } else if (resultData.testType === 'design-audit') {
              Q.renderDesignAuditResults(resultData);
            } else {
              Q.renderFidelityResults(resultData);
            }
          }

          // Scroll to results
          if (rContainer) {
            Q.scrollToElement(rContainer);
          }
        })
        .catch(function () {
          if (rLoading) rLoading.classList.add('hidden');
          if (cfg.showError) cfg.showError(qaproof.i18n.histFailedLoad || 'Failed to load test result.');
        });
    }

    function deleteItem(id, rowEl) {
      fetch(qaproof.restBase.replace(/\/+$/, '') + '/test-history/' + id, {
        method: 'DELETE',
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin'
      })
        .then(Q.safeJson)
        .then(function (resp) {
          if (resp.success) {
            rowEl.style.transition = 'opacity 0.3s, transform 0.3s';
            rowEl.style.opacity = '0';
            rowEl.style.transform = 'translateX(20px)';
            setTimeout(function () { rowEl.remove(); }, 300);
            // Decrement total count but NOT offset — offset tracks how many items
            // were fetched, not displayed. Decrementing offset would cause the next
            // "Load More" to overlap or skip a boundary item.
            total--;
            if (list.children.length === 0) {
              empty.classList.remove('hidden');
            }
          } else {
            var msg = (resp.error && resp.error.message) ? resp.error.message : (qaproof.i18n.histDeleteFailed || 'Failed to delete.');
            if (cfg.showError) cfg.showError(msg);
          }
        })
        .catch(function () {
          if (cfg.showError) cfg.showError(qaproof.i18n.histDeleteFailed || 'Failed to delete.');
        });
    }

    function downloadItemPdf(id) {
      fetch(qaproof.restBase.replace(/\/+$/, '') + '/test-history/' + id, {
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin'
      })
        .then(Q.safeJson)
        .then(function (resp) {
          if (resp.success && resp.data) {
            var resultData = parseResultData(resp.data);
            Q.generatePdfReport(resultData);
          }
        })
        .catch(function () {
          Q.alert(qaproof.i18n.histFailedDownload || 'Failed to download report.');
        });
    }

    return { init: init, load: load };
  }

  // ============================
  // Expose on namespace
  // ============================
  Q.createHistoryManager = createHistoryManager;
})();
