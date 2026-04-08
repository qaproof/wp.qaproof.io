/* global qaproof */
(function () {
  'use strict';

  // ============================
  // Safe JSON parsing helper
  // ============================
  function safeJson(response) {
    if (!response.ok) {
      return response.text().then(function (text) {
        var msg = 'Server returned HTTP ' + response.status;
        if (response.status === 404) {
          msg = 'REST API endpoint not found (404). Check that the plugin is activated and permalinks are flushed (Settings → Permalinks → Save).';
        } else if (response.status === 403) {
          msg = 'Access denied (403). Your login session may have expired — try refreshing the page.';
        } else if (response.status === 500) {
          msg = 'Internal server error (500). Check the server error log for details.';
        }
        throw new Error(msg);
      });
    }
    return response.json().catch(function () {
      throw new Error('Invalid JSON response from server. The API endpoint may be misconfigured.');
    });
  }

  // ============================
  // Job persistence — survive page reloads & tab switches
  // Stores one job per page (tests / accessibility) so they don't overwrite each other
  // ============================
  var JOB_KEY_PREFIX = 'qaproof_job_';

  /**
   * Save active job to localStorage.
   * phase: 'submitting' (before API responds) or 'polling' (jobId known, polling for results)
   */
  function saveActiveJob(jobId, testType, pageUrl, page, phase, retries) {
    try {
      localStorage.setItem(JOB_KEY_PREFIX + page, JSON.stringify({
        jobId: jobId, testType: testType, pageUrl: pageUrl, page: page,
        phase: phase || 'polling', startedAt: Date.now(),
        retries: retries || 0,
      }));
    } catch (e) { /* quota exceeded or private mode */ }
  }

  function clearActiveJob(page) {
    try { localStorage.removeItem(JOB_KEY_PREFIX + page); } catch (e) { /* noop */ }
  }

  function getActiveJob(page) {
    try {
      var raw = localStorage.getItem(JOB_KEY_PREFIX + page);
      if (!raw) return null;
      var job = JSON.parse(raw);
      // Expire after 10 minutes
      if (Date.now() - job.startedAt > 10 * 60 * 1000) {
        clearActiveJob(page);
        return null;
      }
      return job;
    } catch (e) { return null; }
  }

  /**
   * Build a poll URL that works with both pretty permalinks and ?rest_route= format.
   */
  function buildPollUrl(jobId) {
    var pollUrl = qaproof.restBase + '/poll-job/' + jobId;
    if (qaproof.restBase.indexOf('rest_route=') !== -1) {
      pollUrl = qaproof.restBase + '%2Fpoll-job%2F' + jobId;
    }
    return pollUrl;
  }

  /**
   * Build URL for fetching job screenshots separately.
   */
  function buildScreenshotsUrl(jobId) {
    var base = qaproof.restBase;
    var sep = base.indexOf('?') !== -1 ? '&' : '?';
    return base + '/job-screenshots/' + encodeURIComponent(jobId) + sep + '_=' + Date.now();
  }

  /**
   * Fetch screenshots for a completed job and inject into existing DOM.
   * Screenshots are fetched separately to avoid multi-MB responses
   * through the WP proxy during polling.
   */
  function fetchAndInjectScreenshots(jobId, resultData, onComplete) {
    console.log('[QAProof] Fetching screenshots separately for job:', jobId);

    fetch(buildScreenshotsUrl(jobId), {
      method: 'GET',
      headers: { 'X-WP-Nonce': qaproof.nonce },
      credentials: 'same-origin',
    })
    .then(safeJson)
    .then(function (resp) {
      if (!resp.success || !resp.data || !resp.data.screenshots) {
        console.warn('[QAProof] Screenshots fetch failed or empty');
        // Remove loading placeholder
        var placeholder = document.getElementById('qaproof-screenshots-loading');
        if (placeholder) placeholder.remove();
        if (onComplete) onComplete(resultData);
        return;
      }

      var screenshots = resp.data.screenshots;
      console.log('[QAProof] Screenshots received:', Object.keys(screenshots).length, 'viewports');

      // Inject screenshots into existing img elements
      var viewports = ['desktop', 'tablet', 'tablet_landscape', 'mobile', 'mobile_landscape'];
      for (var i = 0; i < viewports.length; i++) {
        var vp = viewports[i];
        if (screenshots[vp]) {
          var img = document.getElementById('qaproof-screenshot-' + vp);
          if (img) {
            img.src = screenshots[vp];
            // Render markers for this viewport after screenshot loads
            (function(imgEl, device) {
              waitForImage(imgEl).then(function () {
                var markersLayer = document.getElementById('qaproof-markers-' + device);
                if (markersLayer && markersLayer.children.length === 0 && resultData.differences) {
                  console.log('[QAProof] Rendering markers after screenshot load for:', device);
                  renderMarkersIntoLayer(markersLayer, resultData.differences, function (diff) {
                    return !diff.device || diff.device === device;
                  });
                }
              });
            })(img, vp);
          }
        }
      }

      // Handle fidelity (figma/live) and regression (baseline/current) screenshots
      // Both test types reuse the same img IDs: qaproof-screenshot-figma + qaproof-screenshot-live
      var figmaSrc = screenshots.figma || screenshots.baseline || null;
      var liveSrc = screenshots.live || screenshots.current || null;
      if (figmaSrc) {
        var figmaImg = document.getElementById('qaproof-screenshot-figma');
        if (figmaImg && (!figmaImg.getAttribute('src') || figmaImg.getAttribute('src') === '')) {
          figmaImg.src = figmaSrc;
        }
      }
      if (liveSrc) {
        var liveImg = document.getElementById('qaproof-screenshot-live');
        if (liveImg && (!liveImg.getAttribute('src') || liveImg.getAttribute('src') === '')) {
          liveImg.src = liveSrc;
        }
      }
      // Render markers for fidelity/regression after both images load
      if (figmaSrc || liveSrc) {
        var figmaImgEl = document.getElementById('qaproof-screenshot-figma');
        var liveImgEl = document.getElementById('qaproof-screenshot-live');
        var markerImgs = [figmaImgEl, liveImgEl].filter(function(el) { return el && el.src; });
        var loadPromises = markerImgs.map(function(el) { return waitForImage(el); });
        Promise.all(loadPromises).then(function () {
          if (resultData.differences) {
            var markersFigma = document.getElementById('qaproof-markers-figma');
            var markersLive = document.getElementById('qaproof-markers-live');
            if (markersFigma && markersFigma.children.length === 0) {
              renderMarkersIntoLayer(markersFigma, resultData.differences);
            }
            if (markersLive && markersLive.children.length === 0) {
              renderMarkersIntoLayer(markersLive, resultData.differences);
            }
          }
        });
      }

      // Also check for single-screenshot tests (accessibility, design-audit)
      if (screenshots.desktop) {
        var singleImgs = ['qaproof-screenshot-a11y', 'qaproof-screenshot-da', 'qaproof-screenshot-fidelity'];
        for (var j = 0; j < singleImgs.length; j++) {
          var sImg = document.getElementById(singleImgs[j]);
          if (sImg && (!sImg.getAttribute('src') || sImg.getAttribute('src') === '')) {
            sImg.src = screenshots.desktop;
            // Render markers after screenshot loads (they were skipped during
            // initial report render because screenshots weren't available yet)
            (function(imgEl) {
              waitForImage(imgEl).then(function () {
                var imgId = imgEl.id; // e.g. 'qaproof-screenshot-da'
                var suffix = imgId.replace('qaproof-screenshot-', ''); // e.g. 'da', 'a11y', 'fidelity'
                var markersLayerId = 'qaproof-markers-' + suffix;
                // For fidelity, markers use 'figma' and 'live' layers, not 'fidelity'
                if (suffix === 'fidelity') return;
                var markersLayer = document.getElementById(markersLayerId);
                if (markersLayer && markersLayer.children.length === 0 && resultData.differences) {
                  console.log('[QAProof] Rendering markers after screenshot load for:', markersLayerId);
                  renderMarkersIntoLayer(markersLayer, resultData.differences);
                }
              });
            })(sImg);
          }
        }
      }

      // Remove loading placeholder
      var placeholder = document.getElementById('qaproof-screenshots-loading');
      if (placeholder) {
        placeholder.textContent = '';
        placeholder.remove();
      }

      // Store screenshots on resultData for PDF export etc
      resultData.screenshots = screenshots;
      if (onComplete) onComplete(resultData);
    })
    .catch(function (err) {
      console.warn('[QAProof] Screenshots fetch error:', err.message);
      var placeholder = document.getElementById('qaproof-screenshots-loading');
      if (placeholder) placeholder.textContent = 'Screenshots could not be loaded.';
      if (onComplete) onComplete(resultData);
    });
  }

  /**
   * Start polling a job. Calls onDone(resultData) or onFailed(errorMsg) when finished.
   * Returns a function to cancel polling.
   *
   * Screenshots are stripped from poll responses to keep them small (<100KB).
   * When the job is done, screenshots are fetched separately via /job-screenshots/:id.
   */
  function startJobPolling(jobId, opts) {
    var onDone = opts.onDone || function () {};
    var onFailed = opts.onFailed || function () {};
    var onPoll = opts.onPoll || function () {};
    var onScreenshotsDone = opts.onScreenshotsDone || null;
    var page = opts.page || 'tests';
    var cancelled = false;

    var pollInterval = setInterval(function () {
      if (cancelled) return;

      fetch(buildPollUrl(jobId), {
        method: 'GET',
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin',
      })
        .then(safeJson)
        .then(function (pollData) {
          if (cancelled) return;
          if (!pollData.success) {
            clearInterval(pollInterval);
            clearActiveJob(page);
            onFailed((pollData.error && pollData.error.message) || 'Polling failed.');
            return;
          }

          var job = pollData.data;
          onPoll(job.status, job.elapsed);

          if (job.status === 'done' && job.result) {
            clearInterval(pollInterval);
            clearActiveJob(page);

            // Render results immediately (without screenshots for fast display)
            onDone(job.result);

            // Fetch screenshots separately if they were stripped from poll response
            if (job.result.screenshotsAvailable && !job.result.screenshots) {
              fetchAndInjectScreenshots(jobId, job.result, function (resultWithScreenshots) {
                if (onScreenshotsDone) onScreenshotsDone(resultWithScreenshots);
              });
            } else {
              // Screenshots already included or not applicable — fire callback immediately
              if (onScreenshotsDone) onScreenshotsDone(job.result);
            }
          } else if (job.status === 'failed') {
            clearInterval(pollInterval);
            clearActiveJob(page);
            onFailed(job.error || 'Test failed on the server.');
          }
        })
        .catch(function (pollErr) {
          console.warn('[QAProof] Poll error (retrying):', pollErr.message);
        });
    }, 5000);

    return function cancel() {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }

  // ============================
  // DOM References
  // ============================
  const form = document.getElementById('qaproof-test-form');
  const loading = document.getElementById('qaproof-loading');
  const loadingText = document.getElementById('qaproof-loading-text');
  const loadingSubtext = document.getElementById('qaproof-loading-subtext');
  const errorDiv = document.getElementById('qaproof-error');
  const errorMessage = document.getElementById('qaproof-error-message');
  let resultsContainer = document.getElementById('qaproof-results');
  const submitBtn = document.getElementById('qaproof-submit-btn');
  const testTypeSelector = document.querySelector('.qaproof-test-type-selector');
  const figmaFields = document.getElementById('qaproof-figma-fields');
  const sourceToggle = document.getElementById('qaproof-source-toggle');
  const sourceSaved = document.getElementById('qaproof-source-saved');
  const sourceUpload = document.getElementById('qaproof-source-upload');
  const figmaFileInput = document.getElementById('qaproof-figma-file');
  const uploadPreview = document.getElementById('qaproof-upload-preview');
  const uploadPreviewImg = document.getElementById('qaproof-upload-preview-img');
  const uploadClearBtn = document.getElementById('qaproof-upload-clear');

  // Connection test (settings page)
  const connectionBtn = document.getElementById('qaproof-test-connection');
  const connectionStatus = document.getElementById('qaproof-connection-status');

  // ============================
  // QAProof seal PNG for PDF reports (pre-rendered, font-independent)
  // ============================
  var cachedSealPng = 'data:image/png;base64,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';

  // ============================
  // Theme Toggle
  // ============================
  (function initThemeToggle() {
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

  // ============================
  // State
  // ============================
  let testType = (qaproof && qaproof.defaultTestType) || 'fidelity';
  let figmaSource = 'saved'; // Default to saved design tab
  let uploadedFileBase64 = null;
  let savedDesignImageBase64 = null; // Cached image from a saved design (avoids Figma API calls)
  let allDifferences = [];
  let activeDiffIndex = null;
  let activeDevice = 'desktop';
  let syncScrollEnabled = true;
  let markersVisible = true;
  let isScrollSyncing = false;
  let globalTooltip = null;

  // ============================
  // Scroll helper — accounts for WP admin bar
  // ============================
  function scrollToElement(el, offset) {
    if (!el) return;
    var adminBarHeight = 32;
    var extraOffset = offset || 16;
    var top = el.getBoundingClientRect().top + window.pageYOffset - adminBarHeight - extraOffset;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }

  // ============================
  // Connection Test (Settings Page)
  // ============================
  if (connectionBtn) {
    connectionBtn.addEventListener('click', function () {
      connectionStatus.textContent = 'Testing...';
      connectionStatus.className = '';

      var data = new FormData();
      data.append('action', 'qaproof_health_check');
      data.append('nonce', qaproof.ajaxNonce);

      fetch(qaproof.ajaxUrl, {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
      })
        .then(safeJson)
        .then(function (resp) {
          if (resp.success) {
            connectionStatus.textContent = 'Connected! API status: ' + (resp.data.status || 'ok');
            connectionStatus.className = 'success';
          } else {
            connectionStatus.textContent = 'Failed: ' + (resp.data && resp.data.message ? resp.data.message : 'Unknown error');
            connectionStatus.className = 'error';
          }
        })
        .catch(function () {
          connectionStatus.textContent = 'Network error — could not reach API.';
          connectionStatus.className = 'error';
        });
    });
  }

  // ============================
  // Network Diagnostics (Settings page)
  // ============================
  var diagnoseBtn = document.getElementById('qaproof-diagnose-btn');
  var diagnoseOutput = document.getElementById('qaproof-diagnose-output');
  if (diagnoseBtn) {
    diagnoseBtn.addEventListener('click', function () {
      diagnoseBtn.disabled = true;
      diagnoseBtn.textContent = 'Running diagnostics...';
      diagnoseOutput.textContent = 'Please wait (up to 60 seconds)...';
      diagnoseOutput.style.display = 'block';

      var data = new FormData();
      data.append('action', 'qaproof_diagnose');
      data.append('nonce', qaproof.ajaxNonce);

      fetch(qaproof.ajaxUrl, {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
      })
        .then(safeJson)
        .then(function (resp) {
          diagnoseBtn.disabled = false;
          diagnoseBtn.textContent = 'Run Diagnostics';
          if (resp.success) {
            var d = resp.data;
            var lines = [];
            lines.push('=== QAProof Network Diagnostics ===');
            lines.push('');

            // Config
            lines.push('--- Config ---');
            lines.push('API Endpoint: ' + d.config.api_endpoint);
            lines.push('API Key: ' + d.config.api_key_prefix);
            lines.push('ENV Override: ' + d.config.env_override);
            lines.push('WP_HTTP_BLOCK_EXTERNAL: ' + d.config.wp_http_block_external);
            lines.push('WP_ACCESSIBLE_HOSTS: ' + d.config.wp_accessible_hosts);
            lines.push('WP_PROXY_HOST: ' + d.config.wp_proxy_host);
            lines.push('PHP: ' + d.config.php_version + ' | cURL: ' + d.config.curl_version + ' | SSL: ' + d.config.openssl_version);
            lines.push('');

            // DNS
            lines.push('--- DNS ---');
            lines.push((d.dns.ok ? 'OK' : 'FAIL') + ': ' + d.dns.host + ' → ' + (d.dns.ips.length ? d.dns.ips.join(', ') : 'no IPs') + ' (' + d.dns.time_ms + 'ms)');
            lines.push('');

            // Health
            lines.push('--- GET /api/health (sslverify=true) ---');
            if (d.health.ok) {
              lines.push('OK: HTTP ' + d.health.http_code + ' in ' + d.health.time_ms + 'ms');
              lines.push('Body: ' + d.health.body);
            } else {
              lines.push('FAIL: ' + d.health.error + ' (' + d.health.time_ms + 'ms)');
            }
            lines.push('');

            // Compare
            lines.push('--- POST /api/compare (auth test) ---');
            if (d.compare.error) {
              lines.push('FAIL: ' + d.compare.error + ' (' + d.compare.time_ms + 'ms)');
            } else {
              lines.push((d.compare.ok ? 'OK' : 'HTTP ' + d.compare.http_code) + ' in ' + d.compare.time_ms + 'ms');
              lines.push('Body: ' + d.compare.body);
            }
            lines.push('');

            // Health no SSL
            lines.push('--- GET /api/health (sslverify=false) ---');
            if (d.health_nossl.ok) {
              lines.push('OK: HTTP ' + d.health_nossl.http_code + ' in ' + d.health_nossl.time_ms + 'ms');
            } else {
              lines.push('FAIL: ' + d.health_nossl.error + ' (' + d.health_nossl.time_ms + 'ms)');
            }
            lines.push('');

            // Control
            lines.push('--- Control (api.wordpress.org) ---');
            if (d.control.ok) {
              lines.push('OK: HTTP ' + d.control.http_code + ' in ' + d.control.time_ms + 'ms');
            } else {
              lines.push('FAIL: ' + d.control.error + ' (' + d.control.time_ms + 'ms)');
            }

            diagnoseOutput.textContent = lines.join('\n');
          } else {
            diagnoseOutput.textContent = 'Error: ' + ((resp.data && resp.data.message) || 'Unknown');
          }
        })
        .catch(function (err) {
          diagnoseBtn.disabled = false;
          diagnoseBtn.textContent = 'Run Diagnostics';
          diagnoseOutput.textContent = 'Request failed: ' + err.message;
        });
    });
  }

  // ============================
  // API Key — Eye Toggle + Validation
  // ============================
  (function () {
    var keyInput = document.getElementById('qaproof_api_key');
    if (!keyInput) return;

    var wrapper = keyInput.closest('.qaproof-api-key-wrapper');
    if (!wrapper) return;

    var eyeBtn    = wrapper.querySelector('.qaproof-eye-toggle');
    var eyeOff    = wrapper.querySelector('.qaproof-eye-off');
    var eyeOn     = wrapper.querySelector('.qaproof-eye-on');
    var errorEl   = wrapper.parentNode.querySelector('.qaproof-api-key-error');
    var keyRegex  = /^qap_[0-9a-f]{64}$/i;

    // Fade gradient — sync color to input background
    var fadeEl = wrapper.querySelector('.qaproof-key-fade');
    function syncFade() {
      if (!fadeEl) return;
      var bg = getComputedStyle(keyInput).backgroundColor;
      fadeEl.style.background = 'linear-gradient(to right, transparent, ' + bg + ' 70%)';
    }
    syncFade();
    keyInput.addEventListener('focus', function () { setTimeout(syncFade, 50); });
    keyInput.addEventListener('blur', function () { setTimeout(syncFade, 50); });
    // Re-sync on theme toggle
    var themeBtn = document.getElementById('qaproof-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () { setTimeout(syncFade, 100); });
    }

    // Eye toggle
    if (eyeBtn) {
      eyeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var isPassword = keyInput.type === 'password';
        keyInput.type = isPassword ? 'text' : 'password';
        if (eyeOff && eyeOn) {
          eyeOff.style.display = isPassword ? 'none' : 'block';
          eyeOn.style.display  = isPassword ? 'block' : 'none';
        }
      });
    }

    // Client-side validation
    function validateKey() {
      var val = keyInput.value.trim();

      // Empty — neutral state
      if (!val) {
        keyInput.classList.remove('qaproof-key-valid', 'qaproof-key-invalid');
        if (errorEl) errorEl.style.display = 'none';
        return;
      }

      if (keyRegex.test(val)) {
        keyInput.classList.add('qaproof-key-valid');
        keyInput.classList.remove('qaproof-key-invalid');
        if (errorEl) errorEl.style.display = 'none';
      } else {
        keyInput.classList.add('qaproof-key-invalid');
        keyInput.classList.remove('qaproof-key-valid');
        if (errorEl) {
          if (val.indexOf('qap_') !== 0) {
            errorEl.textContent = 'API key must start with "qap_"';
          } else {
            var hex = val.substring(4);
            if (hex.length !== 64) {
              errorEl.textContent = 'Key is ' + (4 + hex.length) + ' characters — expected 68 (qap_ + 64 hex chars)';
            } else {
              errorEl.textContent = 'Key contains invalid characters — only 0-9 and a-f are allowed after "qap_"';
            }
          }
          errorEl.style.display = 'block';
        }
      }
    }

    keyInput.addEventListener('input', validateKey);
    keyInput.addEventListener('paste', function () { setTimeout(validateKey, 0); });

    // Validate on load if there's already a value
    if (keyInput.value) validateKey();
  })();

  // ============================
  // Saved Designs Repeater (Settings page)
  // ============================
  var designsList   = document.getElementById('qaproof-saved-designs-list');
  var addDesignBtn  = document.getElementById('qaproof-add-design');
  var designsJson   = document.getElementById('qaproof-saved-designs-json');

  function generateId() {
    var arr = new Uint8Array(4);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function syncDesignsToHidden() {
    if (!designsJson || !designsList) return;
    var rows = designsList.querySelectorAll('.qaproof-design-row');
    var designs = [];
    rows.forEach(function (row) {
      var d = {};
      row.querySelectorAll('[data-field]').forEach(function (input) {
        d[input.dataset.field] = input.value;
      });
      if (d.name) designs.push(d);
    });
    designsJson.value = JSON.stringify(designs);
    // Hide/show "no designs" message
    var noMsg = designsList.querySelector('.qaproof-no-designs');
    if (noMsg) noMsg.style.display = rows.length > 0 ? 'none' : '';
  }

  function createDesignRow(data) {
    var row = document.createElement('div');
    row.className = 'qaproof-design-row';
    row.innerHTML =
      '<div class="qaproof-design-row-fields">' +
        '<input type="text" placeholder="Design Name" value="' + (data.name || '') + '" data-field="name" class="regular-text" />' +
        '<input type="url" placeholder="Page URL" value="' + (data.pageUrl || '') + '" data-field="pageUrl" class="regular-text" />' +
        '<input type="password" placeholder="figd_..." value="' + (data.figmaToken || '') + '" data-field="figmaToken" class="regular-text" autocomplete="off" />' +
        '<input type="url" placeholder="Figma URL" value="' + (data.figmaUrl || '') + '" data-field="figmaUrl" class="regular-text" />' +
        '<input type="hidden" value="' + (data.id || generateId()) + '" data-field="id" />' +
      '</div>' +
      '<button type="button" class="button qaproof-design-remove" title="Remove">' +
        '<span class="dashicons dashicons-trash"></span>' +
      '</button>';
    // Sync on any input change
    row.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('input', syncDesignsToHidden);
    });
    // Remove button
    row.querySelector('.qaproof-design-remove').addEventListener('click', function () {
      row.remove();
      syncDesignsToHidden();
    });
    return row;
  }

  if (addDesignBtn && designsList) {
    addDesignBtn.addEventListener('click', function () {
      var row = createDesignRow({});
      designsList.appendChild(row);
      syncDesignsToHidden();
      row.querySelector('input').focus();
    });

    // Wire up existing rows' remove buttons and input sync
    designsList.querySelectorAll('.qaproof-design-row').forEach(function (row) {
      row.querySelectorAll('input').forEach(function (inp) {
        inp.addEventListener('input', syncDesignsToHidden);
      });
      var removeBtn = row.querySelector('.qaproof-design-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', function () {
          row.remove();
          syncDesignsToHidden();
        });
      }
    });
  }

  // ============================
  // Monitors Page
  // ============================
  var monitorsListEl = document.getElementById('qaproof-monitors-list');
  var monitorsLoading = document.getElementById('qaproof-monitors-loading');
  var monitorDetail = document.getElementById('qaproof-monitor-detail');
  var monitorFormWrap = document.getElementById('qaproof-monitor-form-wrap');
  var monitorForm = document.getElementById('qaproof-monitor-form');
  var addMonitorBtn = document.getElementById('qaproof-add-monitor');
  var monitorCancelBtn = document.getElementById('qaproof-monitor-cancel');

  if (monitorsListEl) {
    initMonitorsPage();
  }

  function initMonitorsPage() {
    loadMonitors();

    if (addMonitorBtn) {
      addMonitorBtn.addEventListener('click', function () {
        showMonitorForm();
      });
    }

    if (monitorCancelBtn) {
      monitorCancelBtn.addEventListener('click', function () {
        hideMonitorForm();
      });
    }

    if (monitorForm) {
      monitorForm.addEventListener('submit', function (e) {
        e.preventDefault();
        saveMonitor();
      });
    }

    // Check if URL has monitor_id param to show detail
    var urlParams = new URLSearchParams(window.location.search);
    var monitorId = urlParams.get('monitor_id');
    if (monitorId) {
      showMonitorDetail(parseInt(monitorId, 10));
    }
  }

  function apiCall(method, path, body) {
    var opts = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': qaproof.nonce,
      },
      credentials: 'same-origin',
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(qaproof.restBase + path, opts).then(safeJson);
  }

  function loadMonitors() {
    if (monitorsLoading) monitorsLoading.classList.remove('hidden');
    if (monitorsListEl) monitorsListEl.innerHTML = '';

    apiCall('GET', '/monitors').then(function (resp) {
      if (monitorsLoading) monitorsLoading.classList.add('hidden');
      if (!resp.success) return;
      renderMonitorsList(resp.data);
    }).catch(function () {
      if (monitorsLoading) monitorsLoading.classList.add('hidden');
      if (monitorsListEl) monitorsListEl.innerHTML = '<p class="qaproof-monitors-empty">Failed to load monitors.</p>';
    });
  }

  function renderMonitorsList(monitors) {
    if (!monitorsListEl) return;

    if (!monitors || monitors.length === 0) {
      monitorsListEl.innerHTML = '<p class="qaproof-monitors-empty">No monitors yet. Click "Add Monitor" to get started.</p>';
      return;
    }

    var html = '<table class="qaproof-monitors-table widefat striped">';
    html += '<thead><tr>';
    html += '<th>' + escapeHtml('URL') + '</th>';
    html += '<th>' + escapeHtml('Schedule') + '</th>';
    html += '<th>' + escapeHtml('Last Score') + '</th>';
    html += '<th>' + escapeHtml('Last Run') + '</th>';
    html += '<th>' + escapeHtml('Status') + '</th>';
    html += '<th>' + escapeHtml('Actions') + '</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < monitors.length; i++) {
      var m = monitors[i];
      var scoreClass = m.last_score != null ? getScoreClass(parseInt(m.last_score, 10)) : '';
      var scoreText = m.last_score != null ? m.last_score : '—';
      var lastRun = m.last_run_at ? formatDate(m.last_run_at) : 'Never';
      var statusClass = parseInt(m.is_enabled, 10) ? 'qaproof-status-active' : 'qaproof-status-paused';
      var statusText = parseInt(m.is_enabled, 10) ? 'Active' : 'Paused';
      var baselineText = parseInt(m.has_baseline, 10) ? '' : ' (no baseline)';

      html += '<tr data-id="' + m.id + '" class="qaproof-monitor-row-clickable">';
      html += '<td class="qaproof-monitor-url"><a href="#" class="qaproof-monitor-detail-link" data-id="' + m.id + '">' + escapeHtml(truncateUrl(m.page_url, 60)) + '</a> <span class="qaproof-monitor-view-hint">View Results &rsaquo;</span></td>';
      html += '<td>' + escapeHtml(capitalize(m.schedule)) + '</td>';
      html += '<td><span class="qaproof-monitor-score ' + scoreClass + '">' + scoreText + '</span></td>';
      html += '<td>' + escapeHtml(lastRun) + '</td>';
      html += '<td><span class="' + statusClass + '">' + escapeHtml(statusText + baselineText) + '</span></td>';
      html += '<td class="qaproof-monitor-actions">';
      html += '  <button type="button" class="button button-small qaproof-run-monitor" data-id="' + m.id + '" title="Run Now">Run</button>';
      html += '  <button type="button" class="button button-small qaproof-toggle-monitor" data-id="' + m.id + '" data-enabled="' + m.is_enabled + '">' + (parseInt(m.is_enabled, 10) ? 'Pause' : 'Enable') + '</button>';
      html += '  <button type="button" class="button button-small qaproof-edit-monitor" data-id="' + m.id + '">Edit</button>';
      html += '  <button type="button" class="button button-small button-link-delete qaproof-delete-monitor" data-id="' + m.id + '">Delete</button>';
      html += '</td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    monitorsListEl.innerHTML = html;

    // Bind events
    monitorsListEl.querySelectorAll('.qaproof-monitor-detail-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        showMonitorDetail(parseInt(this.dataset.id, 10));
      });
    });

    // Make entire row clickable (except action buttons)
    monitorsListEl.querySelectorAll('.qaproof-monitor-row-clickable').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('.qaproof-monitor-actions') || e.target.closest('a')) return;
        var id = parseInt(row.dataset.id, 10);
        if (id) showMonitorDetail(id);
      });
    });

    monitorsListEl.querySelectorAll('.qaproof-run-monitor').forEach(function (btn) {
      btn.addEventListener('click', function () {
        runMonitor(parseInt(this.dataset.id, 10), this);
      });
    });

    monitorsListEl.querySelectorAll('.qaproof-toggle-monitor').forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggleMonitor(parseInt(this.dataset.id, 10), parseInt(this.dataset.enabled, 10));
      });
    });

    monitorsListEl.querySelectorAll('.qaproof-edit-monitor').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editMonitor(parseInt(this.dataset.id, 10));
      });
    });

    monitorsListEl.querySelectorAll('.qaproof-delete-monitor').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteMonitor(parseInt(this.dataset.id, 10));
      });
    });
  }

  function showMonitorForm(monitor) {
    if (!monitorFormWrap) return;
    var titleEl = document.getElementById('qaproof-monitor-form-title');
    var editIdEl = document.getElementById('qaproof-monitor-edit-id');
    var urlInput = document.getElementById('qaproof-monitor-url');
    var scheduleSelect = document.getElementById('qaproof-monitor-schedule');
    var thresholdInput = document.getElementById('qaproof-monitor-threshold');
    var notifyEmailCb = document.getElementById('qaproof-monitor-notify-email');
    var notifyAdminCb = document.getElementById('qaproof-monitor-notify-admin');

    if (monitor) {
      if (titleEl) titleEl.textContent = 'Edit Monitor';
      if (editIdEl) editIdEl.value = monitor.id;
      if (urlInput) urlInput.value = monitor.page_url;
      if (scheduleSelect) scheduleSelect.value = monitor.schedule;
      if (thresholdInput) thresholdInput.value = monitor.threshold_score;
      if (notifyEmailCb) notifyEmailCb.checked = parseInt(monitor.notify_email, 10) === 1;
      if (notifyAdminCb) notifyAdminCb.checked = parseInt(monitor.notify_admin, 10) === 1;
    } else {
      if (titleEl) titleEl.textContent = 'Add Monitor';
      if (editIdEl) editIdEl.value = '';
      if (urlInput) urlInput.value = qaproof.siteUrl;
      if (scheduleSelect) scheduleSelect.value = 'daily';
      if (thresholdInput) thresholdInput.value = qaproof.defaultThreshold || 90;
      if (notifyEmailCb) notifyEmailCb.checked = true;
      if (notifyAdminCb) notifyAdminCb.checked = true;
    }

    monitorFormWrap.classList.remove('hidden');
    if (urlInput) urlInput.focus();
  }

  function hideMonitorForm() {
    if (monitorFormWrap) monitorFormWrap.classList.add('hidden');
  }

  function saveMonitor() {
    var editId = document.getElementById('qaproof-monitor-edit-id').value;
    var data = {
      page_url: document.getElementById('qaproof-monitor-url').value.trim(),
      schedule: document.getElementById('qaproof-monitor-schedule').value,
      threshold_score: parseInt(document.getElementById('qaproof-monitor-threshold').value, 10),
      notify_email: document.getElementById('qaproof-monitor-notify-email').checked ? 1 : 0,
      notify_admin: document.getElementById('qaproof-monitor-notify-admin').checked ? 1 : 0,
    };

    if (!data.page_url) return;

    var method = editId ? 'PUT' : 'POST';
    var path = editId ? '/monitors/' + editId : '/monitors';

    apiCall(method, path, data).then(function (resp) {
      if (resp.success) {
        hideMonitorForm();
        loadMonitors();
      } else {
        alert((resp.error && resp.error.message) || 'Failed to save monitor.');
      }
    });
  }

  function editMonitor(id) {
    apiCall('GET', '/monitors/' + id).then(function (resp) {
      if (resp.success) {
        showMonitorForm(resp.data);
      }
    });
  }

  function deleteMonitor(id) {
    if (!confirm('Delete this monitor and all its results?')) return;
    apiCall('DELETE', '/monitors/' + id).then(function (resp) {
      if (resp.success) loadMonitors();
    });
  }

  function toggleMonitor(id, currentEnabled) {
    apiCall('PUT', '/monitors/' + id, { is_enabled: currentEnabled ? 0 : 1 }).then(function (resp) {
      if (resp.success) loadMonitors();
    });
  }

  // Track active monitor polling
  var monitorPollTimer = null;
  var monitorPollCount = 0;
  var monitorPollMaxAttempts = 60; // 5 minutes (every 5s)

  function stopMonitorPoll() {
    if (monitorPollTimer) {
      clearTimeout(monitorPollTimer);
      monitorPollTimer = null;
    }
    monitorPollCount = 0;
  }

  function pollForMonitorResult(monitorId, expectedResultCount) {
    monitorPollCount++;
    if (monitorPollCount > monitorPollMaxAttempts) {
      stopMonitorPoll();
      // Update UI to show timeout
      var loadingText = document.getElementById('qaproof-monitors-loading-text');
      if (loadingText) loadingText.textContent = 'Test timed out. Check back later.';
      var runBtn = document.getElementById('qaproof-detail-run');
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run Now'; }
      // Hide loading after a moment
      setTimeout(function () {
        if (monitorsLoading) monitorsLoading.classList.add('hidden');
      }, 3000);
      return;
    }

    apiCall('GET', '/monitors/' + monitorId + '/results?limit=1').then(function (resp) {
      if (resp.success && resp.data && resp.data.length > 0) {
        var latestResult = resp.data[0];
        var newTotal = resp.total || 0;
        // Check if we got a NEW result (total increased)
        if (newTotal > expectedResultCount) {
          stopMonitorPoll();
          // Refresh detail view with new results
          showMonitorDetail(monitorId);
          return;
        }
      }
      // Keep polling
      monitorPollTimer = setTimeout(function () {
        pollForMonitorResult(monitorId, expectedResultCount);
      }, 5000);
    }).catch(function () {
      // Retry on error
      monitorPollTimer = setTimeout(function () {
        pollForMonitorResult(monitorId, expectedResultCount);
      }, 5000);
    });
  }

  function runMonitor(id, btn) {
    // Add running animation to the row
    var row = btn ? btn.closest('tr[data-id]') : null;
    if (row) row.classList.add('qaproof-monitor-running');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="dashicons dashicons-update qaproof-spin"></span>';
    }

    apiCall('POST', '/monitors/' + id + '/run').then(function (resp) {
      if (row) row.classList.remove('qaproof-monitor-running');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Run';
      }
      if (resp.success) {
        loadMonitors();
        // Always open detail view to show the new result
        showMonitorDetail(id);
      } else {
        alert((resp.error && resp.error.message) || 'Failed to run monitor.');
      }
    }).catch(function () {
      if (row) row.classList.remove('qaproof-monitor-running');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Run';
      }
    });
  }

  function showMonitorDetail(id) {
    if (!monitorDetail) return;

    // Stop any active polling
    stopMonitorPoll();
    // Hide loading bar
    if (monitorsLoading) monitorsLoading.classList.add('hidden');

    // Hide list, show detail
    if (monitorsListEl) monitorsListEl.classList.add('hidden');
    if (addMonitorBtn) addMonitorBtn.classList.add('hidden');
    monitorDetail.classList.remove('hidden');
    monitorDetail.innerHTML = '<div id="qaproof-monitors-loading" style="margin-top:16px;"><div class="qaproof-loading-inner"><div class="qaproof-loading-left"><div class="qaproof-loading-spinner"></div><div class="qaproof-loading-info"><strong id="qaproof-monitors-loading-text">Loading monitor...</strong></div></div></div></div>';

    Promise.all([
      apiCall('GET', '/monitors/' + id),
      apiCall('GET', '/monitors/' + id + '/results'),
    ]).then(function (results) {
      var monitorResp = results[0];
      var resultsResp = results[1];

      if (!monitorResp.success) {
        monitorDetail.innerHTML = '<p>Monitor not found.</p>';
        return;
      }

      var totalResults = resultsResp.total || (resultsResp.data ? resultsResp.data.length : 0);
      renderMonitorDetail(monitorResp.data, resultsResp.success ? resultsResp.data : [], totalResults);
    });
  }

  function renderMonitorDetail(monitor, monitorResults, totalResultCount) {
    if (!monitorDetail) return;

    var html = '';
    html += '<div class="qaproof-detail-header">';
    html += '  <button type="button" id="qaproof-back-to-list" class="button">&larr; Back to Monitors</button>';
    html += '  <h2>' + escapeHtml(monitor.page_url) + '</h2>';
    html += '  <div class="qaproof-detail-meta">';
    html += '    <span>Schedule: <strong>' + escapeHtml(capitalize(monitor.schedule)) + '</strong></span>';
    html += '    <span>Threshold: <strong>' + monitor.threshold_score + '</strong></span>';
    html += '    <span>Last Score: <strong class="' + getScoreClass(parseInt(monitor.last_score, 10)) + '">' + (monitor.last_score != null ? monitor.last_score : '—') + '</strong></span>';
    html += '  </div>';
    html += '  <button type="button" id="qaproof-detail-run" class="button button-primary" data-id="' + monitor.id + '">Run Now</button>';
    html += '</div>';

    // Results timeline
    html += '<h3>Results History</h3>';
    if (!monitorResults || monitorResults.length === 0) {
      html += '<p class="qaproof-monitors-empty">No results yet. Click "Run Now" to run the first check.</p>';
    } else {
      html += '<div class="qaproof-results-timeline">';
      for (var i = 0; i < monitorResults.length; i++) {
        var r = monitorResults[i];
        var scoreClass = r.score != null ? getScoreClass(parseInt(r.score, 10)) : '';
        var statusBadge = '';
        if (r.status === 'failed') statusBadge = '<span class="qaproof-badge qaproof-badge-high">Failed</span>';
        else if (r.status === 'approved') statusBadge = '<span class="qaproof-badge qaproof-badge-approved">Approved</span>';

        html += '<div class="qaproof-result-row" data-result-id="' + r.id + '">';
        html += '  <span class="qaproof-result-date">' + escapeHtml(formatDate(r.run_date)) + '</span>';
        html += '  <span class="qaproof-result-score ' + scoreClass + '">' + (r.score != null ? r.score : '—') + '</span>';
        html += '  ' + statusBadge;
        html += '  <span class="qaproof-result-summary">' + escapeHtml(truncate(r.summary || (r.error_message || ''), 80)) + '</span>';

        if (r.status === 'completed' && parseInt(r.has_changes, 10)) {
          html += '  <button type="button" class="button button-small qaproof-approve-result" data-id="' + r.id + '">Approve Changes</button>';
        }
        html += '  <button type="button" class="button button-small qaproof-view-result" data-id="' + r.id + '">View</button>';
        html += '</div>';
      }
      html += '</div>';
    }

    // Result detail area
    html += '<div id="qaproof-result-detail"></div>';

    monitorDetail.innerHTML = html;

    // Bind events
    document.getElementById('qaproof-back-to-list').addEventListener('click', function () {
      stopMonitorPoll();
      monitorDetail.classList.add('hidden');
      monitorDetail.innerHTML = '';
      if (monitorsListEl) monitorsListEl.classList.remove('hidden');
      if (addMonitorBtn) addMonitorBtn.classList.remove('hidden');
      if (monitorsLoading) monitorsLoading.classList.add('hidden');
      loadMonitors();
    });

    var runBtn = document.getElementById('qaproof-detail-run');
    if (runBtn) {
      runBtn.addEventListener('click', function () {
        stopMonitorPoll();
        runBtn.disabled = true;
        runBtn.textContent = 'Running...';

        // Show loading bar below button
        if (monitorsLoading) {
          monitorsLoading.classList.remove('hidden');
          var loadingText = document.getElementById('qaproof-monitors-loading-text');
          if (loadingText) loadingText.textContent = 'Running regression test...';
        }

        apiCall('POST', '/monitors/' + monitor.id + '/run').then(function (resp) {
          if (resp.success) {
            // Update loading text
            var loadingText = document.getElementById('qaproof-monitors-loading-text');
            if (loadingText) loadingText.textContent = 'Test started. Waiting for results...';
            // Start polling for new results
            pollForMonitorResult(monitor.id, totalResultCount || 0);
          } else {
            runBtn.disabled = false;
            runBtn.textContent = 'Run Now';
            if (monitorsLoading) monitorsLoading.classList.add('hidden');
            alert((resp.error && resp.error.message) || 'Failed to run monitor.');
          }
        }).catch(function () {
          runBtn.disabled = false;
          runBtn.textContent = 'Run Now';
          if (monitorsLoading) monitorsLoading.classList.add('hidden');
        });
      });
    }

    monitorDetail.querySelectorAll('.qaproof-approve-result').forEach(function (btn) {
      btn.addEventListener('click', function () {
        approveResult(parseInt(this.dataset.id, 10), monitor.id, this);
      });
    });

    monitorDetail.querySelectorAll('.qaproof-view-result').forEach(function (btn) {
      btn.addEventListener('click', function () {
        viewResult(parseInt(this.dataset.id, 10));
      });
    });
  }

  function approveResult(resultId, monitorId, btn) {
    if (!confirm('Approve these changes? This will update the baseline to the current page state.')) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Approving...';
    }

    apiCall('POST', '/results/' + resultId + '/approve').then(function (resp) {
      if (resp.success) {
        showMonitorDetail(monitorId);
      } else {
        alert((resp.error && resp.error.message) || 'Failed to approve.');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Approve Changes';
        }
      }
    });
  }

  function viewResult(resultId) {
    var detailArea = document.getElementById('qaproof-result-detail');
    if (!detailArea) return;
    detailArea.innerHTML = '<span class="spinner is-active" style="float:none;"></span> Loading result...';

    // Results are stored in the DB, fetch via a custom approach
    // Since get single result isn't a route, we use the results list and find it
    // Actually we have the data already in the timeline — let's read from the rendered data
    // Better: make a quick call to get the specific result's monitor results and find it
    // For now, read all results and find the one we need
    var row = monitorDetail.querySelector('.qaproof-result-row[data-result-id="' + resultId + '"]');
    if (!row) return;

    // We need to get the full result data. Let's find the monitor ID from the detail header run button
    var runBtn = document.getElementById('qaproof-detail-run');
    var monitorId = runBtn ? runBtn.dataset.id : null;
    if (!monitorId) return;

    apiCall('GET', '/monitors/' + monitorId + '/results').then(function (resp) {
      if (!resp.success) return;

      var result = null;
      for (var i = 0; i < resp.data.length; i++) {
        if (parseInt(resp.data[i].id, 10) === resultId) {
          result = resp.data[i];
          break;
        }
      }

      if (!result) {
        detailArea.innerHTML = '<p>Result not found.</p>';
        return;
      }

      renderResultDetail(result, detailArea);
    });
  }

  function renderResultDetail(result, container) {
    if (result.status === 'failed') {
      container.innerHTML = '<div class="qaproof-card"><h3>Run Failed</h3><p>' + escapeHtml(result.error_message || 'Unknown error') + '</p></div>';
      return;
    }

    var categories = result.categories_json ? JSON.parse(result.categories_json) : {};
    var differences = result.differences_json ? JSON.parse(result.differences_json) : [];
    var recommendations = result.recommendations_json ? JSON.parse(result.recommendations_json) : [];
    var screenshots = result.screenshots_json ? JSON.parse(result.screenshots_json) : {};

    allDifferences = differences;
    activeDiffIndex = null;
    syncScrollEnabled = true;
    markersVisible = true;

    var score = result.score != null ? parseInt(result.score, 10) : null;
    var scoreClass = getScoreClass(score);

    var html = '<hr />';
    html += '<div class="qaproof-report-hero">';
    html += '  <div class="qaproof-report-hero-top">';
    html += '    <div class="qaproof-report-hero-score">';
    html += buildScoreRingHtml(score, 'Regression Score', scoreClass);
    html += '      <div class="qaproof-score-label">Regression Score</div>';
    html += '    </div>';
    html += '    <div class="qaproof-report-hero-info">';
    html += '      <div class="qaproof-summary">' + escapeHtml(result.summary || '') + '</div>';
    html += '      <div class="qaproof-report-hero-actions">';
    html += '        <button type="button" id="qaproof-pdf-btn" class="qaproof-btn qaproof-pdf-btn"><span class="dashicons dashicons-pdf"></span> Download PDF Report</button>';
    html += '        <button type="button" id="qaproof-email-btn" class="qaproof-btn qaproof-email-btn"><span class="dashicons dashicons-email-alt"></span> Send to Email</button>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Categories
    html += '<h3>Categories</h3>';
    html += '<div class="qaproof-categories" id="qaproof-reg-categories"></div>';

    // Comparison Viewport
    if (screenshots.baseline && screenshots.current) {
      html += '<div class="qaproof-screenshot-section">';
      html += '  <div class="qaproof-screenshot-chrome">';
      html += '    <div class="qaproof-chrome-bar">';
      html += '      <div class="qaproof-chrome-dots"><span></span><span></span><span></span></div>';
      html += '      <div class="qaproof-chrome-title">Visual Comparison</div>';
      html += '      <div class="qaproof-chrome-actions">';
      html += '        <button type="button" id="qaproof-toggle-markers" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg> Markers</button>';
      html += '        <button type="button" id="qaproof-toggle-sync" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2v4h4M12 14v-4H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4L8.5 7.5M4 12l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Sync Scroll</button>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="qaproof-comparison-viewport">';
      html += '      <div class="qaproof-screenshot-col">';
      html += '        <div class="qaproof-screenshot-label">Baseline</div>';
      html += '        <div class="qaproof-screenshot-wrapper" id="qaproof-wrapper-figma">';
      html += '          <div class="qaproof-screenshot-inner">';
      html += '            <img id="qaproof-screenshot-figma" src="' + escapeAttr(screenshots.baseline) + '" alt="Baseline" />';
      html += '            <div class="qaproof-markers-layer" id="qaproof-markers-figma"></div>';
      html += '          </div>';
      html += '        </div>';
      html += '      </div>';
      html += '      <div class="qaproof-screenshot-col">';
      html += '        <div class="qaproof-screenshot-label">Current</div>';
      html += '        <div class="qaproof-screenshot-wrapper" id="qaproof-wrapper-live">';
      html += '          <div class="qaproof-screenshot-inner">';
      html += '            <img id="qaproof-screenshot-live" src="' + escapeAttr(screenshots.current) + '" alt="Current" />';
      html += '            <div class="qaproof-markers-layer" id="qaproof-markers-live"></div>';
      html += '          </div>';
      html += '        </div>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    }

    // Differences
    html += '<h3>Differences <span class="qaproof-diff-count" id="qaproof-diff-count">' + differences.length + '</span></h3>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-severity-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-severity="all">All</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="high">High</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="medium">Medium</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="low">Low</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div id="qaproof-differences"></div>';
    html += '</div>';

    // Recommendations
    html += '<h3>Recommendations</h3>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-recommendations" id="qaproof-recommendations"></div>';
    html += '</div>';

    container.innerHTML = html;

    // Render dynamic sections
    renderCategoriesInto('qaproof-reg-categories', categories, {
      layout: 'Layout & Structure',
      styling: 'Styling & Colors',
      typography: 'Typography & Content',
      images: 'Images & Media',
      components: 'Components & UI',
    });

    renderDifferencesInto('qaproof-differences', 'qaproof-diff-count', differences, false);
    renderRecommendationsInto('qaproof-recommendations', recommendations);

    // Markers after images load
    if (screenshots.baseline && screenshots.current) {
      var baselineImg = document.getElementById('qaproof-screenshot-figma');
      var currentImg = document.getElementById('qaproof-screenshot-live');
      Promise.all([waitForImage(baselineImg), waitForImage(currentImg)]).then(function () {
        renderMarkers(differences);
      });

      setupSyncScroll();
      setupToolbar();
    }

    setupFilterFor('qaproof-severity-filter', 'severity');

    // PDF download button
    var pdfBtn = document.getElementById('qaproof-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        var resultData = {
          testType: 'regression',
          score: score,
          summary: result.summary,
          categories: categories,
          differences: differences,
          recommendations: recommendations,
          pageUrl: result.page_url || ''
        };
        generatePdfReport(resultData);
      });
    }

    scrollToElement(container);
  }

  function truncateUrl(url, maxLen) {
    if (!url || url.length <= maxLen) return url || '';
    try {
      var u = new URL(url);
      var display = u.hostname + u.pathname;
      if (display.length > maxLen) display = display.substring(0, maxLen - 3) + '...';
      return display;
    } catch (e) {
      return url.substring(0, maxLen - 3) + '...';
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ============================
  // Test Type Selector
  // ============================
  if (testTypeSelector) {
    // Create sliding indicator
    var ttSlider = document.createElement('div');
    ttSlider.className = 'qaproof-test-type-slider';
    testTypeSelector.appendChild(ttSlider);

    function moveTestTypeSlider(btn) {
      var navRect = testTypeSelector.getBoundingClientRect();
      var btnRect = btn.getBoundingClientRect();
      ttSlider.style.width = btnRect.width + 'px';
      ttSlider.style.height = btnRect.height + 'px';
      ttSlider.style.transform = 'translateX(' + (btnRect.left - navRect.left - testTypeSelector.clientLeft) + 'px) translateY(' + (btnRect.top - navRect.top - testTypeSelector.clientTop) + 'px)';
    }

    // Initial position without transition
    requestAnimationFrame(function () {
      var activeBtn = testTypeSelector.querySelector('.qaproof-test-type-btn.active');
      if (activeBtn) {
        ttSlider.style.transition = 'none';
        moveTestTypeSlider(activeBtn);
        requestAnimationFrame(function () {
          ttSlider.style.transition = '';
        });
      }
    });

    testTypeSelector.addEventListener('click', function (e) {
      var btn = e.target.closest('.qaproof-test-type-btn');
      if (!btn || btn.classList.contains('active')) return;

      testTypeSelector.querySelectorAll('.qaproof-test-type-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      moveTestTypeSlider(btn);

      testType = btn.dataset.type;

      if (figmaFields) {
        figmaFields.classList.toggle('hidden', testType !== 'fidelity');
      }
      updateFigmaPreviewVisibility();
      updateSavedDesignVisibility();
      // Show/hide figma upload for non-fidelity test types
      var figmaUpload = document.getElementById('qaproof-figma-upload');
      if (figmaUpload) {
        figmaUpload.classList.toggle('hidden', testType !== 'fidelity');
      }

      if (submitBtn) {
        var btnLabels = {
          fidelity: 'Analyze Design Fidelity',
          responsive: 'Test Responsive',
          accessibility: 'Run Accessibility Audit',
          'design-audit': 'Run Design Audit',
        };
        submitBtn.textContent = btnLabels[testType] || 'Run Test';
      }
    });
  }

  // Apply default test type from settings
  if (testTypeSelector && testType !== 'fidelity') {
    var defaultBtn = testTypeSelector.querySelector('[data-type="' + testType + '"]');
    if (defaultBtn) {
      testTypeSelector.querySelectorAll('.qaproof-test-type-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      defaultBtn.classList.add('active');
      if (figmaFields) figmaFields.classList.toggle('hidden', testType !== 'fidelity');
      if (submitBtn) {
        var initLabels = { fidelity: 'Analyze Design Fidelity', responsive: 'Test Responsive', accessibility: 'Run Accessibility Audit' };
        submitBtn.textContent = initLabels[testType] || 'Run Test';
      }
      // Move slider to default tab
      requestAnimationFrame(function () {
        if (typeof moveTestTypeSlider === 'function') moveTestTypeSlider(defaultBtn);
      });
    }
  }

  // ============================
  // Saved Design Selector (Tests page)
  // ============================
  var savedDesignSelect = document.getElementById('qaproof-saved-design');
  var savedDesignWrap   = document.getElementById('qaproof-figma-fields'); // Design source block (contains saved design dropdown)

  function populateSavedDesigns() {
    if (!savedDesignSelect || !qaproof.savedDesigns) return;
    var designs = qaproof.savedDesigns;
    // Clear existing options except the first "Manual Entry"
    while (savedDesignSelect.options.length > 1) {
      savedDesignSelect.remove(1);
    }
    designs.forEach(function (d) {
      var opt = document.createElement('option');
      opt.value = d.id;
      var badges = (d.hasImage ? ' \u2713' : '') + (d.hasElements ? ' \u25A0' : '');
      opt.textContent = d.name + badges;
      savedDesignSelect.appendChild(opt);
    });
  }
  populateSavedDesigns();

  // Show/hide saved design selector based on test type
  function updateSavedDesignVisibility() {
    if (!savedDesignWrap) return;
    savedDesignWrap.style.display = testType === 'fidelity' ? '' : 'none';
  }
  updateSavedDesignVisibility();

  if (savedDesignSelect) {
    savedDesignSelect.addEventListener('change', function () {
      var designId = savedDesignSelect.value;
      if (!designId) {
        savedDesignImageBase64 = null; // Clear saved image for manual entry
        return;
      }

      var designs = qaproof.savedDesigns || [];
      var found = null;
      for (var i = 0; i < designs.length; i++) {
        if (designs[i].id === designId) { found = designs[i]; break; }
      }
      if (!found) return;

      // Auto-fill form fields
      var pageUrlEl    = document.getElementById('qaproof-page-url');
      var figmaTokenEl = document.getElementById('qaproof-figma-token');
      var figmaUrlEl   = document.getElementById('qaproof-figma-url');

      if (pageUrlEl && found.pageUrl)    pageUrlEl.value = found.pageUrl;
      if (figmaTokenEl && found.figmaToken) figmaTokenEl.value = found.figmaToken;
      if (figmaUrlEl && found.figmaUrl)  figmaUrlEl.value = found.figmaUrl;

      // If this design has a saved image, load it from WP (zero Figma API calls)
      if (found.hasImage) {
        updateFigmaPreviewVisibility();

        // Lazy-load saved image from WP REST
        setPreviewState('loading');
        fetch(qaproof.restBase + '/saved-design-image/' + found.id, {
          headers: { 'X-WP-Nonce': qaproof.nonce },
        })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json.success && json.imageBase64) {
            savedDesignImageBase64 = json.imageBase64;
            showPreviewResult({
              imageBase64: json.imageBase64,
              fileKey: 'Saved',
              nodeId: found.name || found.id,
              sizeKB: Math.round(json.imageBase64.length * 0.75 / 1024),
            });
            if (previewMeta) {
              previewMeta.textContent = 'Saved image \u00B7 No Figma API call';
            }
          } else {
            // Image missing — fall back to Figma preview
            savedDesignImageBase64 = null;
            triggerFigmaPreview(true);
          }
        })
        .catch(function () {
          savedDesignImageBase64 = null;
          triggerFigmaPreview(true);
        });
        return; // Don't trigger Figma preview — we're loading from WP
      }

      savedDesignImageBase64 = null; // No saved image for this design

      // If design has Figma URL, silently fetch preview
      if (found.figmaUrl) {
        updateFigmaPreviewVisibility();
        clearTimeout(figmaPreviewTimeout);
        figmaPreviewTimeout = setTimeout(function () { triggerFigmaPreview(true); }, 300);
      }
    });
  }

  // ============================
  // Design Source Toggle (Saved Design / Upload Image)
  // ============================
  if (sourceToggle) {
    sourceToggle.addEventListener('click', function (e) {
      var btn = e.target.closest('.qaproof-source-btn');
      if (!btn) return;

      sourceToggle.querySelectorAll('.qaproof-source-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      var source = btn.dataset.source;
      if (sourceSaved) sourceSaved.classList.toggle('hidden', source !== 'saved');
      if (sourceUpload) sourceUpload.classList.toggle('hidden', source !== 'upload');

      // Update preview based on source
      if (source === 'saved') {
        // Show saved design preview if one is selected
        var designSel = document.getElementById('qaproof-saved-design');
        if (designSel && designSel.value) {
          designSel.dispatchEvent(new Event('change'));
        } else {
          setPreviewState('empty');
        }
      } else if (source === 'upload') {
        savedDesignImageBase64 = null;
        if (uploadedFileBase64) {
          showUploadedImagePreview(uploadedFileBase64, '', 0);
          if (previewMeta) previewMeta.textContent = 'Uploaded image';
        } else {
          setPreviewState('empty');
        }
      }
    });
  }

  // ============================
  // Figma Design Preview
  // ============================
  var figmaPreviewWrap    = document.getElementById('qaproof-figma-preview-wrap');
  var previewEmpty        = document.getElementById('qaproof-preview-empty');
  var previewLoading      = document.getElementById('qaproof-preview-loading');
  var previewError        = document.getElementById('qaproof-preview-error');
  var previewErrorMsg     = document.getElementById('qaproof-preview-error-msg');
  var previewSuccess      = document.getElementById('qaproof-preview-success');
  var previewImage        = document.getElementById('qaproof-preview-image');
  var previewMeta         = document.getElementById('qaproof-preview-meta');
  var figmaPreviewCache   = {};
  var figmaPreviewTimeout = null;
  var figmaRateLimitUntil = 0; // Timestamp: block auto-preview until this time

  function updateFigmaPreviewVisibility() {
    if (!figmaPreviewWrap) return;
    // Show preview panel for fidelity in both url and upload modes
    var show = testType === 'fidelity';
    figmaPreviewWrap.style.display = show ? '' : 'none';

    // Update empty state text
    if (previewEmpty) {
      var emptyText = previewEmpty.querySelector('p');
      if (emptyText) {
        emptyText.textContent = 'Select a saved design or upload an image to preview.';
      }
    }
  }
  updateFigmaPreviewVisibility();

  function setPreviewState(state, errorText, showRetry) {
    if (!previewEmpty) return;
    previewEmpty.classList.toggle('hidden', state !== 'empty');
    previewLoading.classList.toggle('hidden', state !== 'loading');
    previewError.classList.toggle('hidden', state !== 'error');
    previewSuccess.classList.toggle('hidden', state !== 'success');
    if (state === 'error' && previewErrorMsg) {
      previewErrorMsg.textContent = errorText || 'Could not load preview.';
      // Add or remove retry button
      var existingRetry = previewError.querySelector('.qaproof-preview-retry');
      if (existingRetry) existingRetry.remove();
      if (showRetry) {
        var retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'qaproof-preview-retry';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', function () {
          triggerFigmaPreview(true);
        });
        previewError.appendChild(retryBtn);
      }
    }
  }

  function mapFigmaErrorMessage(code, fallback) {
    var map = {
      'FIGMA_AUTH_FAILED':          'Invalid or expired Figma token.',
      'FIGMA_FILE_NOT_FOUND':       'File not found. Check the URL.',
      'FIGMA_RATE_LIMITED':         'Figma rate limit exceeded. This is often caused by Starter plan restrictions (very low API limits). Ensure your Figma file is in a Professional or higher workspace, or use "Upload Image" instead. Wait 1-2 minutes, then try again.',
      'FIGMA_RENDER_TIMEOUT':       'Design too complex to preview.',
      'FIGMA_EXPORT_FAILED':        'Figma could not export this design.',
      'FIGMA_NODE_NOT_RENDERABLE':  'This node cannot be rendered. Try a different frame.',
      'FIGMA_NO_FRAMES_FOUND':      'No frames found. Add a node-id to the URL.',
    };
    return map[code] || fallback || 'Could not load preview.';
  }

  function isRetryableError(code) {
    return code === 'FIGMA_RATE_LIMITED' || code === 'FIGMA_RENDER_TIMEOUT';
  }

  function triggerFigmaPreview(manual) {
    // Get Figma credentials from selected saved design
    var token = '';
    var url   = '';
    var designSelect = document.getElementById('qaproof-saved-design');
    if (designSelect && designSelect.value) {
      var designs = qaproof.savedDesigns || [];
      for (var i = 0; i < designs.length; i++) {
        if (designs[i].id === designSelect.value) {
          token = designs[i].figmaToken || '';
          url   = designs[i].figmaUrl || '';
          break;
        }
      }
    }

    if (!token || !url) {
      setPreviewState('empty');
      return;
    }

    // Validate URL looks like a Figma URL before making request
    if (!/figma\.com\/(design|file|proto|board)\//.test(url)) {
      return; // Don't fire on incomplete URLs
    }

    // Rate-limit cooldown: block auto-triggers for 60s after a 429
    if (!manual && Date.now() < figmaRateLimitUntil) {
      return;
    }

    // Check client-side cache (30 min TTL)
    var cacheKey = url + '|' + token;
    var cached   = figmaPreviewCache[cacheKey];
    if (cached && (Date.now() - cached.ts < 30 * 60 * 1000)) {
      showPreviewResult(cached.data);
      return;
    }

    setPreviewState('loading');

    fetch(qaproof.restBase + '/figma-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce':   qaproof.nonce,
      },
      body: JSON.stringify({ figmaUrl: url, figmaToken: token }),
    })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.success && json.data) {
        figmaPreviewCache[cacheKey] = { data: json.data, ts: Date.now() };
        figmaRateLimitUntil = 0; // Clear cooldown on success
        showPreviewResult(json.data);
      } else {
        var code = json.error && json.error.code ? json.error.code : '';
        var msg  = json.error && json.error.message ? json.error.message : '';
        if (code === 'FIGMA_RATE_LIMITED') {
          figmaRateLimitUntil = Date.now() + 60000; // 60s cooldown
        }
        setPreviewState('error', mapFigmaErrorMessage(code, msg), isRetryableError(code));
      }
    })
    .catch(function () {
      setPreviewState('error', 'Could not load preview.', true);
    });
  }

  function showPreviewResult(data) {
    // Clear element overlays when preview changes
    if (typeof clearElementOverlays === 'function') clearElementOverlays();
    if (previewImage) previewImage.src = data.imageBase64 || '';
    if (previewMeta) {
      var parts = [];
      if (data.fileKey) parts.push('File: ' + data.fileKey);
      if (data.nodeId)  parts.push('Node: ' + data.nodeId);
      if (data.sizeKB)  parts.push(data.sizeKB + ' KB');
      previewMeta.textContent = parts.join(' · ');
    }
    setPreviewState('success');
  }

  // Debounced input listeners (800ms)
  function attachPreviewListeners() {
    var tokenEl = document.getElementById('qaproof-figma-token');
    var urlEl   = document.getElementById('qaproof-figma-url');
    if (!tokenEl || !urlEl) return;

    function onInput() {
      clearTimeout(figmaPreviewTimeout);
      figmaPreviewTimeout = setTimeout(triggerFigmaPreview, 1200);
    }
    tokenEl.addEventListener('input', onInput);
    urlEl.addEventListener('input', onInput);

    // Also trigger if token was pre-filled and user pastes URL
    urlEl.addEventListener('paste', function () {
      clearTimeout(figmaPreviewTimeout);
      figmaPreviewTimeout = setTimeout(triggerFigmaPreview, 500);
    });
  }
  attachPreviewListeners();

  // ============================
  // Refresh from Figma Button (bypass cache)
  // ============================
  var refreshFigmaBtn = document.getElementById('qaproof-refresh-figma-btn');

  function updateRefreshBtnVisibility() {
    if (!refreshFigmaBtn) return;
    // Show when a saved design with Figma URL is selected and preview is loaded
    var designSel = document.getElementById('qaproof-saved-design');
    var hasFigma = false;
    if (designSel && designSel.value) {
      var ds = qaproof.savedDesigns || [];
      for (var i = 0; i < ds.length; i++) {
        if (ds[i].id === designSel.value && ds[i].figmaUrl) { hasFigma = true; break; }
      }
    }
    var show = hasFigma && previewSuccess && !previewSuccess.classList.contains('hidden');
    refreshFigmaBtn.style.display = show ? '' : 'none';
  }

  // Hook into setPreviewState to update refresh button visibility
  var _originalSetPreviewState = setPreviewState;
  setPreviewState = function (state, errorText, showRetry) {
    _originalSetPreviewState(state, errorText, showRetry);
    updateRefreshBtnVisibility();
  };

  if (refreshFigmaBtn) {
    refreshFigmaBtn.addEventListener('click', function () {
      // Get Figma credentials from selected saved design
      var designSel = document.getElementById('qaproof-saved-design');
      var token = '', url = '';
      if (designSel && designSel.value) {
        var ds = qaproof.savedDesigns || [];
        for (var i = 0; i < ds.length; i++) {
          if (ds[i].id === designSel.value) {
            token = ds[i].figmaToken || '';
            url = ds[i].figmaUrl || '';
            break;
          }
        }
      }
      if (!token || !url) return;

      // Clear client-side cache for this design
      var cacheKey = url + '|' + token;
      delete figmaPreviewCache[cacheKey];

      // Trigger preview with forceRefresh flag
      setPreviewState('loading');
      refreshFigmaBtn.classList.add('spinning');

      fetch(qaproof.restBase + '/figma-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce':   qaproof.nonce,
        },
        body: JSON.stringify({ figmaUrl: url, figmaToken: token, forceRefresh: true }),
      })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        refreshFigmaBtn.classList.remove('spinning');
        if (json.success && json.data) {
          figmaPreviewCache[cacheKey] = { data: json.data, ts: Date.now() };
          figmaRateLimitUntil = 0;
          showPreviewResult(json.data);

          // Auto-save the refreshed image to the saved design if one is selected
          var designId = savedDesignSelect ? savedDesignSelect.value : '';
          if (designId && json.data.imageBase64) {
            savedDesignImageBase64 = json.data.imageBase64;
            // Save to WP in background
            fetch(qaproof.restBase + '/save-design-image', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce':   qaproof.nonce,
              },
              body: JSON.stringify({ designId: designId, imageBase64: json.data.imageBase64 }),
            })
            .then(safeJson)
            .then(function (saveJson) {
              if (saveJson.success) {
                // Update in-memory data
                var designs = qaproof.savedDesigns || [];
                for (var i = 0; i < designs.length; i++) {
                  if (designs[i].id === designId) {
                    designs[i].imageBase64 = json.data.imageBase64;
                    break;
                  }
                }
                if (previewMeta) previewMeta.textContent = 'Refreshed & saved \u00B7 No API call needed next time';
              }
            })
            .catch(function () { /* silent — refresh itself succeeded */ });
          }
        } else {
          var code = json.error && json.error.code ? json.error.code : '';
          var msg  = json.error && json.error.message ? json.error.message : '';
          if (code === 'FIGMA_RATE_LIMITED') {
            figmaRateLimitUntil = Date.now() + 60000;
          }
          setPreviewState('error', mapFigmaErrorMessage(code, msg), isRetryableError(code));
        }
      })
      .catch(function () {
        refreshFigmaBtn.classList.remove('spinning');
        setPreviewState('error', 'Could not refresh preview.', true);
      });
    });
  }

  // ============================
  // Save Design Image Button
  // ============================
  var saveDesignBtn = document.getElementById('qaproof-save-design-btn');
  var saveDesignLabel = saveDesignBtn ? saveDesignBtn.querySelector('.qaproof-save-design-label') : null;

  function updateSaveDesignBtnVisibility() {
    if (!saveDesignBtn) return;
    // Show when a saved design is selected and preview is loaded
    var hasSelectedDesign = savedDesignSelect && savedDesignSelect.value;
    var previewLoaded = previewSuccess && !previewSuccess.classList.contains('hidden');
    saveDesignBtn.style.display = (hasSelectedDesign && previewLoaded) ? '' : 'none';
  }

  // Patch setPreviewState again to also update save button
  var _prevSetPreviewState = setPreviewState;
  setPreviewState = function (state, errorText, showRetry) {
    _prevSetPreviewState(state, errorText, showRetry);
    updateSaveDesignBtnVisibility();
  };

  if (saveDesignBtn) {
    saveDesignBtn.addEventListener('click', function () {
      if (!savedDesignSelect || !savedDesignSelect.value) return;
      var designId = savedDesignSelect.value;

      // Get the current preview image
      var imageData = previewImage ? previewImage.src : null;
      if (!imageData || !imageData.startsWith('data:image')) return;

      // Save to WP via REST
      if (saveDesignLabel) saveDesignLabel.textContent = 'Saving...';
      saveDesignBtn.disabled = true;

      // Helper: save elements to WP for this design
      function saveElementsToDesign(elDesignId, els, source) {
        return fetch(qaproof.restBase + '/save-design-elements', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce':   qaproof.nonce,
          },
          body: JSON.stringify({ designId: elDesignId, elements: els, source: source }),
        })
        .then(function (res) { return res.json(); })
        .then(function (saveJson) {
          if (saveJson.success) {
            var designs = qaproof.savedDesigns || [];
            for (var i = 0; i < designs.length; i++) {
              if (designs[i].id === elDesignId) {
                designs[i].hasElements = true;
                designs[i].elementsSource = source;
                break;
              }
            }
          }
          return saveJson;
        });
      }

      // Helper: run background detection and save results
      function bgDetectAndSave(bgDesignId) {
        // Look up saved design for Figma credentials
        var bgSd = null;
        var dsList = qaproof.savedDesigns || [];
        for (var di = 0; di < dsList.length; di++) {
          if (dsList[di].id === bgDesignId) { bgSd = dsList[di]; break; }
        }

        var bgRequestBody;
        if (bgSd && bgSd.figmaUrl && bgSd.figmaToken) {
          bgRequestBody = { figmaUrl: bgSd.figmaUrl, figmaToken: bgSd.figmaToken };
        } else if (imageData && imageData.startsWith('data:image')) {
          var bgParts = imageData.split(',');
          if (bgParts.length < 2 || !bgParts[1]) return;
          bgRequestBody = { figmaImageBase64: bgParts[1] };
        } else {
          return;
        }

        if (previewMeta) {
          previewMeta.textContent = 'Saved image \u00B7 Detecting elements...';
        }

        fetch(qaproof.restBase + '/detect-elements', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce':   qaproof.nonce,
          },
          body: JSON.stringify(bgRequestBody),
        })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json.success && json.data && json.data.elements && json.data.elements.length > 0) {
            var bgSource = json.data.source || '';
            console.log('[QAProof] Background detection done:', bgSource, '(' + json.data.elements.length + ' elements)');

            // Render overlays so user sees them immediately
            detectedElementsSource = bgSource;
            elementsDetectedForCache = 'saved-elements|' + bgDesignId;
            renderElementOverlays(json.data.elements);
            if (elementControlsDiv) elementControlsDiv.style.display = '';

            // Save to WP
            saveElementsToDesign(bgDesignId, json.data.elements, bgSource)
            .then(function () {
              if (previewMeta) {
                previewMeta.textContent = 'Saved image + elements \u00B7 No API call needed';
              }
            });
          } else {
            console.log('[QAProof] Background detection returned no elements');
            if (previewMeta) {
              previewMeta.textContent = 'Saved image \u00B7 No API call needed';
            }
          }
        })
        .catch(function () {
          console.warn('[QAProof] Background element detection failed');
          if (previewMeta) {
            previewMeta.textContent = 'Saved image \u00B7 No API call needed';
          }
        });
      }

      // Step 1: Save image (+ existing elements if any)
      var savePromises = [];
      savePromises.push(
        fetch(qaproof.restBase + '/save-design-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce':   qaproof.nonce,
          },
          body: JSON.stringify({ designId: designId, imageBase64: imageData }),
        }).then(function (res) { return res.json(); })
      );

      var hasExistingElements = detectedElements && detectedElements.length > 0;
      if (hasExistingElements) {
        var elSource = detectedElementsSource || 'ai-vision';
        savePromises.push(saveElementsToDesign(designId, detectedElements, elSource));
      }

      Promise.all(savePromises)
      .then(function (results) {
        var json = results[0]; // image save result
        saveDesignBtn.disabled = false;
        if (json.success) {
          if (saveDesignLabel) saveDesignLabel.textContent = 'Saved!';
          // Update the in-memory savedDesigns array
          var designs = qaproof.savedDesigns || [];
          for (var i = 0; i < designs.length; i++) {
            if (designs[i].id === designId) {
              designs[i].imageBase64 = imageData;
              break;
            }
          }
          savedDesignImageBase64 = imageData;

          if (hasExistingElements && results[1] && results[1].success) {
            // Elements were already detected and saved
            if (previewMeta) {
              previewMeta.textContent = 'Saved image + elements \u00B7 No API call needed';
            }
          } else if (!hasExistingElements) {
            // No elements yet — trigger background detection
            bgDetectAndSave(designId);
          } else {
            if (previewMeta) {
              previewMeta.textContent = 'Saved image \u00B7 No API call needed';
            }
          }

          setTimeout(function () {
            if (saveDesignLabel) saveDesignLabel.textContent = 'Save';
          }, 2000);
        } else {
          if (saveDesignLabel) saveDesignLabel.textContent = 'Error';
          setTimeout(function () {
            if (saveDesignLabel) saveDesignLabel.textContent = 'Save';
          }, 2000);
        }
      })
      .catch(function () {
        saveDesignBtn.disabled = false;
        if (saveDesignLabel) saveDesignLabel.textContent = 'Error';
        setTimeout(function () {
          if (saveDesignLabel) saveDesignLabel.textContent = 'Save';
        }, 2000);
      });
    });
  }

  // ============================
  // Element Detection & Selection
  // ============================
  var detectedElements = [];
  var detectedElementsSource = ''; // 'figma-api' or 'ai-vision'
  var selectedElement = null;
  var elementsDetectedForCache = ''; // track which preview we detected for
  var activeDepthFilter = 'all';     // 'all', '0', '1', '2'

  var detectBtn = document.getElementById('qaproof-detect-elements-btn');
  var fullPageBtn = document.getElementById('qaproof-fullpage-btn');
  var overlaysContainer = document.getElementById('qaproof-element-overlays');
  var detectingDiv = document.getElementById('qaproof-element-detecting');
  var selectedElementDiv = document.getElementById('qaproof-selected-element');
  var selectedElementLabel = document.getElementById('qaproof-selected-element-label');
  var clearSelectionBtn = document.getElementById('qaproof-clear-selection');
  var elementControlsDiv = document.getElementById('qaproof-element-controls');

  // Type → color map for element list dots (matches CSS --overlay-color)
  var typeColorMap = {
    navigation: '99,102,241', header: '99,102,241', breadcrumb: '99,102,241',
    tab: '99,102,241', dropdown: '99,102,241', search: '99,102,241',
    hero: '236,72,153', banner: '236,72,153', cta: '236,72,153',
    button: '245,158,11', toggle: '245,158,11',
    card: '16,185,129', component: '16,185,129', testimonial: '16,185,129',
    pricing: '16,185,129', feature: '16,185,129', stats: '16,185,129',
    section: '0,173,181', 'text-block': '0,173,181', list: '0,173,181', sidebar: '0,173,181',
    form: '168,85,247', input: '168,85,247',
    image: '59,130,246', media: '59,130,246', icon: '59,130,246', logo: '59,130,246',
    footer: '107,114,128', divider: '107,114,128', 'link-group': '107,114,128',
    social: '107,114,128', modal: '107,114,128',
  };

  // Type → icon emoji map
  var typeIconMap = {
    navigation: '\u2630', header: '\u2630', hero: '\u2B50', banner: '\u2B50',
    button: '\u25CF', cta: '\u25B6', card: '\u25A1', component: '\u2699',
    form: '\u270E', input: '\u2587', image: '\u25A3', media: '\u25B7',
    logo: '\u25C8', icon: '\u25C6', footer: '\u2501', divider: '\u2500',
    section: '\u25A0', 'text-block': '\u2261', list: '\u2022', sidebar: '\u258C',
    social: '\u260E', testimonial: '\u275D', pricing: '\u0024', feature: '\u2713',
    stats: '\u2191', 'link-group': '\u21C4', search: '\u26B2', breadcrumb: '\u203A',
    tab: '\u25AB', dropdown: '\u25BE', toggle: '\u21C6', modal: '\u25A2',
  };

  function clearElementOverlays() {
    if (overlaysContainer) {
      overlaysContainer.innerHTML = '';
      overlaysContainer.classList.remove('has-selection');
    }
    detectedElements = [];
    detectedElementsSource = '';
    selectedElement = null;
    elementsDetectedForCache = '';
    activeDepthFilter = 'all';
    if (selectedElementDiv) selectedElementDiv.classList.add('hidden');
    if (fullPageBtn) fullPageBtn.classList.add('active');
    // Clear element list and depth filters
    var elList = document.getElementById('qaproof-element-list');
    if (elList) elList.innerHTML = '';
    var depthFilters = document.getElementById('qaproof-depth-filters');
    if (depthFilters) depthFilters.classList.add('hidden');
    // Clear detect error
    var detectError = document.getElementById('qaproof-detect-error');
    if (detectError) detectError.classList.add('hidden');
    // Reset count badge
    var countBadge = document.getElementById('qaproof-element-count');
    if (countBadge) { countBadge.textContent = ''; countBadge.classList.add('hidden'); }
  }

  function selectElement(element) {
    selectedElement = element;
    // Highlight selected overlay
    var overlays = overlaysContainer.querySelectorAll('.qaproof-element-overlay');
    for (var i = 0; i < overlays.length; i++) {
      overlays[i].classList.toggle('selected', overlays[i].dataset.elementId === element.id);
    }
    if (overlaysContainer) overlaysContainer.classList.add('has-selection');
    // Highlight list item
    var listItems = document.querySelectorAll('.qaproof-element-list-item');
    for (var j = 0; j < listItems.length; j++) {
      listItems[j].classList.toggle('active', listItems[j].dataset.elementId === element.id);
    }
    // Show selected badge
    if (selectedElementDiv) {
      selectedElementDiv.classList.remove('hidden');
      selectedElementLabel.textContent = 'Testing: ' + element.label;
    }
    // Update buttons
    if (fullPageBtn) fullPageBtn.classList.remove('active');
    // Update submit button text
    if (submitBtn) submitBtn.textContent = 'Analyze Element Fidelity';
  }

  function clearSelection() {
    selectedElement = null;
    var overlays = overlaysContainer ? overlaysContainer.querySelectorAll('.qaproof-element-overlay') : [];
    for (var i = 0; i < overlays.length; i++) {
      overlays[i].classList.remove('selected');
    }
    if (overlaysContainer) overlaysContainer.classList.remove('has-selection');
    var listItems = document.querySelectorAll('.qaproof-element-list-item');
    for (var j = 0; j < listItems.length; j++) {
      listItems[j].classList.remove('active');
    }
    if (selectedElementDiv) selectedElementDiv.classList.add('hidden');
    if (fullPageBtn) fullPageBtn.classList.add('active');
    if (submitBtn) submitBtn.textContent = 'Analyze Design Fidelity';
  }

  function applyDepthFilter(depth) {
    activeDepthFilter = depth;
    // Update depth filter buttons
    var depthBtns = document.querySelectorAll('.qaproof-depth-btn');
    for (var i = 0; i < depthBtns.length; i++) {
      depthBtns[i].classList.toggle('active', depthBtns[i].dataset.depth === depth);
    }
    // Show/hide overlays
    var overlays = overlaysContainer ? overlaysContainer.querySelectorAll('.qaproof-element-overlay') : [];
    for (var j = 0; j < overlays.length; j++) {
      var elDepth = overlays[j].dataset.depth || '0';
      var show = (depth === 'all') || (elDepth === depth);
      overlays[j].style.display = show ? '' : 'none';
    }
    // Show/hide list items
    var listItems = document.querySelectorAll('.qaproof-element-list-item');
    for (var k = 0; k < listItems.length; k++) {
      var itemDepth = listItems[k].dataset.depth || '0';
      var showItem = (depth === 'all') || (itemDepth === depth);
      listItems[k].style.display = showItem ? '' : 'none';
    }
  }

  /**
   * Sanitize and post-process element coordinates from AI detection.
   * - Validates that each element has a proper region with numeric values
   * - Clamps all coordinates to 0–100 range
   * - Ensures width/height don't extend past image bounds
   * - Filters out elements that are too small to be meaningful
   * - Adjusts child elements to fit within parent bounds
   */
  function sanitizeElementCoordinates(elements) {
    if (!elements || !Array.isArray(elements)) return [];

    var result = [];

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el || !el.region) continue;

      var r = el.region;

      // Ensure all values are numbers
      var top = parseFloat(r.top);
      var left = parseFloat(r.left);
      var width = parseFloat(r.width);
      var height = parseFloat(r.height);

      if (isNaN(top) || isNaN(left) || isNaN(width) || isNaN(height)) continue;

      // Clamp origin to 0–100
      top = Math.max(0, Math.min(100, top));
      left = Math.max(0, Math.min(100, left));

      // Clamp dimensions to be positive and not exceed image bounds
      width = Math.max(0.5, Math.min(width, 100 - left));
      height = Math.max(0.5, Math.min(height, 100 - top));

      // Skip elements that are too tiny (< 0.5% in either dimension)
      if (width < 0.5 || height < 0.5) continue;

      // Skip elements that would be off-screen
      if (left >= 99.5 || top >= 99.5) continue;

      result.push({
        id: el.id || ('el-' + i),
        label: el.label || 'Element',
        type: el.type || 'section',
        depth: el.depth || 0,
        parent: el.parent || null,
        region: {
          top: Math.round(top * 10) / 10,
          left: Math.round(left * 10) / 10,
          width: Math.round(width * 10) / 10,
          height: Math.round(height * 10) / 10,
        },
      });
    }

    // Second pass: adjust children to fit within parent bounds
    var byId = {};
    for (var j = 0; j < result.length; j++) {
      byId[result[j].id] = result[j];
    }
    for (var k = 0; k < result.length; k++) {
      var child = result[k];
      if (child.parent && byId[child.parent]) {
        var parent = byId[child.parent];
        var pr = parent.region;
        var cr = child.region;

        // Ensure child left/top are at least within parent bounds
        if (cr.left < pr.left) cr.left = pr.left;
        if (cr.top < pr.top) cr.top = pr.top;

        // Ensure child doesn't extend past parent
        var parentRight = pr.left + pr.width;
        var parentBottom = pr.top + pr.height;
        if (cr.left + cr.width > parentRight) {
          cr.width = Math.max(0.5, parentRight - cr.left);
        }
        if (cr.top + cr.height > parentBottom) {
          cr.height = Math.max(0.5, parentBottom - cr.top);
        }
      }
    }

    return result;
  }

  function renderElementOverlays(elements) {
    if (!overlaysContainer) return;
    overlaysContainer.innerHTML = '';
    overlaysContainer.classList.remove('has-selection');
    detectedElements = elements;

    // Compute max depth for filter buttons
    var maxDepth = 0;
    elements.forEach(function (el) {
      var d = el.depth || 0;
      if (d > maxDepth) maxDepth = d;
    });

    // Validate, clamp, and post-process coordinates
    var validElements = sanitizeElementCoordinates(elements);
    console.log('[QAProof] Detected elements after validation:', validElements.length, validElements);

    // Render overlays with staggered animation
    validElements.forEach(function (el, idx) {
      var overlay = document.createElement('div');
      overlay.className = 'qaproof-element-overlay detected';
      overlay.dataset.elementId = el.id;
      overlay.dataset.type = el.type || 'section';
      overlay.dataset.depth = String(el.depth || 0);
      overlay.style.top = el.region.top + '%';
      overlay.style.left = el.region.left + '%';
      overlay.style.width = el.region.width + '%';
      overlay.style.height = el.region.height + '%';
      overlay.style.animationDelay = (idx * 30) + 'ms';

      // If element is near top of image, show label inside (not above)
      if (el.region.top < 2.5) {
        overlay.classList.add('label-inside');
      }

      var label = document.createElement('span');
      label.className = 'qaproof-element-overlay-label';
      var icon = typeIconMap[el.type] || '\u25A0';
      label.innerHTML = '<span class="type-icon">' + icon + '</span>' + escapeHtml(el.label);
      overlay.appendChild(label);

      overlay.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        selectElement(el);
      });

      // Hover sync with list — use .highlight class for programmatic hover
      overlay.addEventListener('mouseenter', function () {
        var listItem = document.querySelector('.qaproof-element-list-item[data-element-id="' + el.id + '"]');
        if (listItem) listItem.classList.add('hover');
      });
      overlay.addEventListener('mouseleave', function () {
        var listItem = document.querySelector('.qaproof-element-list-item[data-element-id="' + el.id + '"]');
        if (listItem) listItem.classList.remove('hover');
      });

      overlaysContainer.appendChild(overlay);
    });

    // Update count badge
    var countBadge = document.getElementById('qaproof-element-count');
    if (countBadge) {
      countBadge.textContent = validElements.length;
      countBadge.classList.remove('hidden');
    }

    // Show depth filter buttons if we have hierarchy
    var depthFilters = document.getElementById('qaproof-depth-filters');
    if (depthFilters && maxDepth > 0) {
      depthFilters.classList.remove('hidden');
      depthFilters.innerHTML = '';
      var allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'qaproof-depth-btn active';
      allBtn.dataset.depth = 'all';
      allBtn.textContent = 'All';
      allBtn.addEventListener('click', function () { applyDepthFilter('all'); });
      depthFilters.appendChild(allBtn);

      var depthLabels = ['Sections', 'Components', 'Sub-components'];
      for (var d = 0; d <= maxDepth; d++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qaproof-depth-btn';
        btn.dataset.depth = String(d);
        btn.textContent = depthLabels[d] || ('Depth ' + d);
        (function (depth) {
          btn.addEventListener('click', function () { applyDepthFilter(String(depth)); });
        })(d);
        depthFilters.appendChild(btn);
      }
    }

    // Render element list panel
    renderElementList(validElements);
  }

  function renderElementList(elements) {
    var elList = document.getElementById('qaproof-element-list');
    if (!elList) return;
    elList.innerHTML = '';

    // Sort: depth 0 first, then by top position
    var sorted = elements.slice().sort(function (a, b) {
      var da = a.depth || 0, db = b.depth || 0;
      if (da !== db) return da - db;
      return (a.region.top || 0) - (b.region.top || 0);
    });

    // Group by parent for tree ordering
    var tree = buildElementTree(sorted);

    tree.forEach(function (el) {
      elList.appendChild(createListItem(el));
    });
  }

  function buildElementTree(elements) {
    // Build parent-children map
    var childMap = {};
    var roots = [];
    elements.forEach(function (el) {
      if (!el.parent) {
        roots.push(el);
      } else {
        if (!childMap[el.parent]) childMap[el.parent] = [];
        childMap[el.parent].push(el);
      }
    });
    // Flatten tree: root, then its children, then their children
    var result = [];
    function addWithChildren(el) {
      result.push(el);
      var children = childMap[el.id] || [];
      children.sort(function (a, b) { return (a.region.top || 0) - (b.region.top || 0); });
      children.forEach(addWithChildren);
    }
    roots.sort(function (a, b) { return (a.region.top || 0) - (b.region.top || 0); });
    roots.forEach(addWithChildren);
    // Add orphans (children with no matching parent)
    var inResult = {};
    result.forEach(function (el) { inResult[el.id] = true; });
    elements.forEach(function (el) {
      if (!inResult[el.id]) result.push(el);
    });
    return result;
  }

  function createListItem(el) {
    var item = document.createElement('div');
    item.className = 'qaproof-element-list-item';
    item.dataset.elementId = el.id;
    item.dataset.depth = String(el.depth || 0);

    var colorRgb = typeColorMap[el.type] || '0,173,181';
    var dot = document.createElement('span');
    dot.className = 'el-color-dot';
    dot.style.background = 'rgb(' + colorRgb + ')';
    item.appendChild(dot);

    var info = document.createElement('span');
    info.className = 'el-info';
    var name = document.createElement('span');
    name.className = 'el-name';
    name.textContent = el.label;
    var typeSpan = document.createElement('span');
    typeSpan.className = 'el-type';
    typeSpan.textContent = el.type;
    info.appendChild(name);
    info.appendChild(typeSpan);
    item.appendChild(info);

    // Click to select
    item.addEventListener('click', function () {
      selectElement(el);
    });
    // Hover sync with overlay — add/remove .highlight class (CSS handles the visual)
    item.addEventListener('mouseenter', function () {
      var overlay = overlaysContainer.querySelector('.qaproof-element-overlay[data-element-id="' + el.id + '"]');
      if (overlay) overlay.classList.add('highlight');
    });
    item.addEventListener('mouseleave', function () {
      var overlay = overlaysContainer.querySelector('.qaproof-element-overlay[data-element-id="' + el.id + '"]');
      if (overlay) overlay.classList.remove('highlight');
    });

    return item;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function triggerDetectElements() {
    var requestBody;
    var cacheKey;
    var detectError = document.getElementById('qaproof-detect-error');

    // Clear previous error
    if (detectError) detectError.classList.add('hidden');

    // Look up the selected saved design (if any) for Figma credentials
    var designSel = document.getElementById('qaproof-saved-design');
    var sd = null;
    if (designSel && designSel.value) {
      var dsList = qaproof.savedDesigns || [];
      for (var di = 0; di < dsList.length; di++) {
        if (dsList[di].id === designSel.value) { sd = dsList[di]; break; }
      }
    }

    // Saved design with cached elements → use them instantly (no API call)
    if (sd && sd.hasElements) {
      cacheKey = 'saved-elements|' + sd.id;
      // If already rendered from this cache, skip
      if (elementsDetectedForCache === cacheKey && detectedElements.length > 0) {
        renderElementOverlays(detectedElements);
        return;
      }
      // Fetch cached elements from WP
      if (detectingDiv) detectingDiv.classList.remove('hidden');
      if (elementControlsDiv) elementControlsDiv.style.display = 'none';
      fetch(qaproof.restBase + '/saved-design-elements/' + sd.id, {
        method: 'GET',
        headers: { 'X-WP-Nonce': qaproof.nonce },
      })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (detectingDiv) detectingDiv.classList.add('hidden');
        if (elementControlsDiv) elementControlsDiv.style.display = '';
        if (json.success && json.elements && json.elements.length > 0) {
          elementsDetectedForCache = cacheKey;
          detectedElementsSource = json.source || '';
          console.log('[QAProof] Loaded cached elements:', json.source, '(' + json.elements.length + ' elements)');
          renderElementOverlays(json.elements);
        } else {
          // Cache was empty or invalid — fall through to live detection
          console.log('[QAProof] Cached elements empty, triggering live detection');
          sd.hasElements = false;
          triggerDetectElements();
        }
      })
      .catch(function () {
        if (detectingDiv) detectingDiv.classList.add('hidden');
        if (elementControlsDiv) elementControlsDiv.style.display = '';
        // Fallback to live detection
        sd.hasElements = false;
        triggerDetectElements();
      });
      return;
    }

    // Saved design with Figma URL → pixel-perfect via Figma API (preferred)
    if (sd && sd.figmaUrl && sd.figmaToken) {
      cacheKey = sd.figmaUrl + '|' + sd.figmaToken;
      requestBody = { figmaUrl: sd.figmaUrl, figmaToken: sd.figmaToken };
    } else if (uploadedFileBase64) {
      // Uploaded image → AI vision (approximate)
      var base64Parts = uploadedFileBase64.split(',');
      if (base64Parts.length < 2 || !base64Parts[1]) return;
      cacheKey = 'upload|' + uploadedFileBase64.length;
      requestBody = { figmaImageBase64: base64Parts[1] };
    } else if (savedDesignImageBase64) {
      // Saved design image without Figma credentials → AI vision fallback
      var savedParts = savedDesignImageBase64.split(',');
      if (savedParts.length < 2 || !savedParts[1]) return;
      cacheKey = 'saved|' + savedDesignImageBase64.length;
      requestBody = { figmaImageBase64: savedParts[1] };
    } else {
      return;
    }

    // Already detected — just refresh overlays
    if (elementsDetectedForCache === cacheKey && detectedElements.length > 0) {
      renderElementOverlays(detectedElements);
      return;
    }

    if (detectingDiv) detectingDiv.classList.remove('hidden');
    if (elementControlsDiv) elementControlsDiv.style.display = 'none';

    fetch(qaproof.restBase + '/detect-elements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce':   qaproof.nonce,
      },
      body: JSON.stringify(requestBody),
    })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (detectingDiv) detectingDiv.classList.add('hidden');
      if (elementControlsDiv) elementControlsDiv.style.display = '';

      if (json.success && json.data && json.data.elements && json.data.elements.length > 0) {
        elementsDetectedForCache = cacheKey;
        var detectionSource = json.data.source || '';
        detectedElementsSource = detectionSource;
        // Log detection source for debugging
        if (detectionSource) {
          console.log('[QAProof] Detection source:', detectionSource, '(' + json.data.elements.length + ' elements)');
        }
        // If we requested Figma API but got AI vision fallback, warn user
        if (requestBody.figmaUrl && detectionSource === 'ai-vision') {
          console.warn('[QAProof] Figma API detection failed, fell back to AI vision. Possibly rate-limited.');
          if (detectError) {
            detectError.textContent = 'Figma API rate-limited \u2014 showing approximate detection. Try again later for pixel-perfect results.';
            detectError.classList.remove('hidden');
          }
        }
        renderElementOverlays(json.data.elements);

        // Auto-save detected elements to WP if a saved design is selected
        var autoSaveDesignId = savedDesignSelect ? savedDesignSelect.value : '';
        if (autoSaveDesignId && json.data.elements.length > 0) {
          fetch(qaproof.restBase + '/save-design-elements', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-WP-Nonce':   qaproof.nonce,
            },
            body: JSON.stringify({
              designId: autoSaveDesignId,
              elements: json.data.elements,
              source:   detectionSource,
            }),
          })
          .then(safeJson)
          .then(function (saveJson) {
            if (saveJson.success) {
              console.log('[QAProof] Elements saved to design', autoSaveDesignId);
              // Update in-memory flag
              var designs = qaproof.savedDesigns || [];
              for (var i = 0; i < designs.length; i++) {
                if (designs[i].id === autoSaveDesignId) {
                  designs[i].hasElements = true;
                  designs[i].elementsSource = detectionSource;
                  break;
                }
              }
            }
          })
          .catch(function () { /* silent */ });
        }
      } else {
        // Show error
        var msg = (json.error && json.error.message) ? json.error.message : 'No elements detected. Try a different design image.';
        if (detectError) {
          detectError.textContent = msg;
          detectError.classList.remove('hidden');
        }
      }
    })
    .catch(function (err) {
      if (detectingDiv) detectingDiv.classList.add('hidden');
      if (elementControlsDiv) elementControlsDiv.style.display = '';
      if (detectError) {
        detectError.textContent = 'Detection failed. Check your connection and try again.';
        detectError.classList.remove('hidden');
      }
    });
  }

  if (detectBtn) {
    detectBtn.addEventListener('click', function () {
      triggerDetectElements();
    });
  }

  if (fullPageBtn) {
    fullPageBtn.addEventListener('click', function () {
      clearSelection();
    });
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', function () {
      clearSelection();
    });
  }

  // ============================
  // Expand / Collapse Inspector
  // ============================
  var expandBtn = document.getElementById('qaproof-inspector-expand');
  var previewPanel = document.querySelector('.qaproof-preview-panel');

  // Create backdrop overlay for expanded inspector — append to #qaproof-app
  var inspectorBackdrop = document.createElement('div');
  inspectorBackdrop.className = 'qaproof-inspector-backdrop';
  var qaproofApp = document.getElementById('qaproof-app');
  if (qaproofApp) {
    qaproofApp.appendChild(inspectorBackdrop);
  }

  if (expandBtn && previewPanel) {
    expandBtn.addEventListener('click', function () {
      var isExpanded = previewPanel.classList.toggle('inspector-expanded');
      // Toggle body scroll lock + backdrop
      document.body.classList.toggle('qaproof-inspector-open', isExpanded);
      inspectorBackdrop.classList.toggle('active', isExpanded);
      // Update button label
      var label = expandBtn.querySelector('.dashicons');
      if (label) {
        label.className = isExpanded
          ? 'dashicons dashicons-editor-contract'
          : 'dashicons dashicons-editor-expand';
      }
      expandBtn.querySelector('span:last-child') ||
        (expandBtn.childNodes.length > 1 && expandBtn.childNodes[1]);
      // Update text
      var textNode = expandBtn.lastChild;
      if (textNode && textNode.nodeType === 3) {
        textNode.textContent = isExpanded ? ' Collapse' : ' Expand';
      }
    });

    // ESC to close expanded inspector
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && previewPanel.classList.contains('inspector-expanded')) {
        expandBtn.click();
      }
    });

    // Click backdrop to close expanded inspector
    inspectorBackdrop.addEventListener('click', function () {
      if (previewPanel.classList.contains('inspector-expanded')) {
        expandBtn.click();
      }
    });
  }

  // ============================
  // File Upload
  // ============================
  if (figmaFileInput) {
    figmaFileInput.addEventListener('change', function (e) {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });
  }

  if (uploadClearBtn) {
    uploadClearBtn.addEventListener('click', function () {
      uploadedFileBase64 = null;
      if (figmaFileInput) figmaFileInput.value = '';
      if (uploadPreview) uploadPreview.classList.add('hidden');
      // Reset Design Preview panel to empty state
      if (typeof clearElementOverlays === 'function') clearElementOverlays();
      setPreviewState('empty');
    });
  }

  function handleFile(file) {
    var MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (!file.type.startsWith('image/')) {
      showError('Please upload an image file (PNG, JPEG, WebP).');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showError('File too large (' + (file.size / 1024 / 1024).toFixed(1) + 'MB). Maximum size: 5MB.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      uploadedFileBase64 = e.target.result;
      if (uploadPreviewImg) uploadPreviewImg.src = uploadedFileBase64;
      if (uploadPreview) uploadPreview.classList.remove('hidden');

      // Also show in Design Preview panel
      showUploadedImagePreview(uploadedFileBase64, file.name, file.size);
    };
    reader.readAsDataURL(file);
  }

  /**
   * Show an uploaded image in the Design Preview panel (same panel used for Figma).
   */
  function showUploadedImagePreview(base64DataUrl, fileName, fileSize) {
    // Clear element overlays when preview changes
    if (typeof clearElementOverlays === 'function') clearElementOverlays();
    if (previewImage) previewImage.src = base64DataUrl;
    if (previewMeta) {
      var parts = [];
      if (fileName) parts.push(fileName);
      if (fileSize) parts.push((fileSize / 1024).toFixed(0) + ' KB');
      previewMeta.textContent = parts.join(' · ');
    }
    setPreviewState('success');
  }

  // ============================
  // Form Submit
  // ============================
  // Track whether a test is currently running on this page
  var testsPageBusy = false;

  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (testsPageBusy) {
      showError('A test is already running. Please wait for it to finish.');
      return;
    }

    if (!qaproof.hasApiKey) {
      showErrorHtml('API key not configured. <a href="' + escapeAttr(qaproof.settingsUrl) + '">Go to Settings</a> to add your key.');
      return;
    }

    testsPageBusy = true;

    // Reset UI
    resultsContainer.classList.add('hidden');
    resultsContainer.innerHTML = '';
    errorDiv.classList.add('hidden');
    loading.classList.remove('hidden');
    submitBtn.disabled = true;

    // Loading text
    if (testType === 'responsive') {
      loadingText.textContent = 'Capturing 3 viewport sizes and analyzing responsive behavior...';
      loadingSubtext.textContent = 'This may take 1-2 minutes (3 screenshots + AI analysis)';
    } else if (testType === 'accessibility') {
      loadingText.textContent = 'Capturing page and running accessibility audit...';
      var wcagLvl = (typeof qaproof !== 'undefined' && qaproof.wcagLevel) ? qaproof.wcagLevel : 'AA';
      loadingSubtext.textContent = 'Analyzing WCAG 2.1 Level ' + wcagLvl + ' compliance (30-60 seconds)';
    } else if (testType === 'design-audit') {
      loadingText.textContent = 'Scanning page and extracting design tokens...';
      loadingSubtext.textContent = 'Analyzing design system consistency (1-2 minutes)';
    } else if (selectedElement) {
      loadingText.textContent = 'Analyzing element: ' + selectedElement.label + '...';
      loadingSubtext.textContent = 'Cropping design region, finding match on live page, comparing (30-60 seconds)';
    } else {
      loadingText.textContent = 'Capturing screenshots and analyzing design...';
      loadingSubtext.textContent = 'This may take 15-30 seconds';
    }

    var pageUrl = document.getElementById('qaproof-page-url').value.trim();

    // Validate
    if (testType === 'fidelity') {
      // Need either: saved design image, uploaded image, or a saved design with Figma URL
      if (!savedDesignImageBase64 && !uploadedFileBase64) {
        var designSel = document.getElementById('qaproof-saved-design');
        var hasFigmaUrl = false;
        if (designSel && designSel.value) {
          var ds = qaproof.savedDesigns || [];
          for (var vi = 0; vi < ds.length; vi++) {
            if (ds[vi].id === designSel.value && ds[vi].figmaUrl) { hasFigmaUrl = true; break; }
          }
        }
        if (!hasFigmaUrl) {
          showError('Please upload a design image or select a saved design.');
          loading.classList.add('hidden');
          submitBtn.disabled = false;
          testsPageBusy = false;
          return;
        }
      }
    }

    // Build body
    var body = { pageUrl: pageUrl, testType: testType };

    // Include WCAG level for accessibility tests
    if (testType === 'accessibility' && typeof qaproof !== 'undefined' && qaproof.wcagLevel) {
      body.wcagLevel = qaproof.wcagLevel;
    }

    if (testType === 'fidelity') {
      // Pass ignoreText setting
      if (typeof qaproof !== 'undefined') {
        body.ignoreText = qaproof.fidelityIgnoreText !== false;
      }
      // Get Figma credentials from selected saved design if available
      var designSelect = document.getElementById('qaproof-saved-design');
      var selectedDesign = null;
      if (designSelect && designSelect.value) {
        var allDesigns = qaproof.savedDesigns || [];
        for (var di = 0; di < allDesigns.length; di++) {
          if (allDesigns[di].id === designSelect.value) { selectedDesign = allDesigns[di]; break; }
        }
      }
      if (selectedDesign && selectedDesign.figmaToken) {
        body.figmaToken = selectedDesign.figmaToken;
      }

      // Priority: saved design image > uploaded image > Figma URL (from saved design)
      if (savedDesignImageBase64) {
        // Use saved design image — zero Figma API calls
        var savedParts = savedDesignImageBase64.split(',');
        if (savedParts.length >= 2 && savedParts[1]) {
          body.figmaImageBase64 = savedParts[1];
        }
      } else if (uploadedFileBase64) {
        var parts = uploadedFileBase64.split(',');
        if (parts.length < 2 || !parts[1]) {
          showError('Invalid image data. Please re-upload the design file.');
          loading.classList.add('hidden');
          submitBtn.disabled = false;
          return;
        }
        body.figmaImageBase64 = parts[1];
      } else if (selectedDesign && selectedDesign.figmaUrl) {
        body.figmaUrl = selectedDesign.figmaUrl;
      }

      // Element-level fidelity: send selected region
      if (selectedElement && selectedElement.region) {
        body.elementRegion = selectedElement.region;
      }
    }

    // Step-based loading status
    var checkSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var loadingSteps = testType === 'design-audit' ? [
      { time: 0, text: 'Capturing page screenshot' },
      { time: 8000, text: 'Extracting design tokens from DOM' },
      { time: 18000, text: 'Analyzing color palette & typography' },
      { time: 35000, text: 'AI auditing design consistency' },
      { time: 70000, text: 'Building design debt report' },
    ] : [
      { time: 0, text: 'Capturing page screenshot' },
      { time: 8000, text: 'Processing images' },
      { time: 20000, text: 'Running AI analysis' },
      { time: 50000, text: 'Generating report' },
      { time: 90000, text: 'Finalizing results' },
    ];

    var stepsContainer = document.getElementById('qaproof-loading-steps');
    if (stepsContainer) {
      stepsContainer.innerHTML = '';
      for (var si = 0; si < loadingSteps.length; si++) {
        if (si > 0) {
          var connector = document.createElement('div');
          connector.className = 'qaproof-step-connector';
          connector.id = 'qaproof-connector-' + si;
          stepsContainer.appendChild(connector);
        }
        var stepEl = document.createElement('div');
        stepEl.className = 'qaproof-loading-step' + (si === 0 ? ' active' : '');
        stepEl.id = 'qaproof-lstep-' + si;
        stepEl.innerHTML =
          '<span class="qaproof-step-indicator">' + (si + 1) + '</span>';
        stepsContainer.appendChild(stepEl);
      }
    }

    var loadingTimers = loadingSteps.map(function (step, idx) {
      return setTimeout(function () {
        for (var j = 0; j < idx; j++) {
          var prev = document.getElementById('qaproof-lstep-' + j);
          if (prev) {
            prev.classList.remove('active');
            prev.classList.add('completed');
            var ind = prev.querySelector('.qaproof-step-indicator');
            if (ind) ind.innerHTML = checkSvg;
          }
          var conn = document.getElementById('qaproof-connector-' + (j + 1));
          if (conn) conn.classList.add('completed');
        }
        var curr = document.getElementById('qaproof-lstep-' + idx);
        if (curr) {
          curr.classList.add('active');
          curr.classList.remove('completed');
        }
        loadingText.textContent = step.text + '...';
        loadingSubtext.textContent = idx < loadingSteps.length - 1 ? 'This may take 1-3 minutes' : 'Almost done';
      }, step.time);
    });

    // Save to localStorage BEFORE the API call so reload during submission can recover.
    // Carry forward retry count from recovery flow (window.__qaproofPendingRetries).
    var _pendingRetries = window.__qaproofPendingRetries || 0;
    window.__qaproofPendingRetries = 0;
    saveActiveJob(null, body.testType, body.pageUrl, 'tests', 'submitting', _pendingRetries);

    // Submit test via WP proxy → get jobId → poll for results
    fetch(qaproof.restUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': qaproof.nonce,
      },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    })
      .then(safeJson)
      .then(function (data) {
        if (!data.success || !data.data || !data.data.jobId) {
          throw new Error((data.error && data.error.message) || 'Failed to create test job.');
        }

        var jobId = data.data.jobId;
        console.log('[QAProof] Job created:', jobId);
        // Upgrade localStorage entry with real jobId and polling phase
        saveActiveJob(jobId, body.testType, body.pageUrl, 'tests', 'polling');

        startJobPolling(jobId, {
          page: 'tests',
          onPoll: function (status, elapsed) {
            console.log('[QAProof] Poll:', status, elapsed);
          },
          onDone: function (resultData) {
            loadingTimers.forEach(clearTimeout);

            if (resultData.testType === 'responsive') {
              renderResponsiveResults(resultData);
            } else if (resultData.testType === 'accessibility') {
              renderAccessibilityResults(resultData);
            } else if (resultData.testType === 'design-audit') {
              renderDesignAuditResults(resultData);
            } else {
              renderFidelityResults(resultData);
            }

            loading.classList.add('hidden');
            submitBtn.disabled = false;
            testsPageBusy = false;
          },
          onScreenshotsDone: function (resultData) {
            // Save result to WP history AFTER screenshots are fetched.
            // Strip base64 screenshots from payload to avoid exceeding PHP post_max_size.
            // History stores metadata only; screenshots are re-fetched when viewing.
            var historyData = Object.assign({}, resultData);
            delete historyData.screenshots;
            var saveData = new FormData();
            saveData.append('action', 'qaproof_save_history');
            saveData.append('nonce', qaproof.ajaxNonce);
            saveData.append('testType', body.testType);
            saveData.append('pageUrl', body.pageUrl);
            saveData.append('result', JSON.stringify(historyData));
            fetch(qaproof.ajaxUrl, {
              method: 'POST',
              body: saveData,
              credentials: 'same-origin',
            })
            .then(safeJson)
            .then(function (saveResp) {
              console.log('[QAProof] History saved (with screenshots):', saveResp);
              if (testsHistoryMgr) testsHistoryMgr.load(true);
            })
            .catch(function (err) {
              console.error('[QAProof] Failed to save history:', err.message);
              if (testsHistoryMgr) testsHistoryMgr.load(true);
            });
          },
          onFailed: function (errorMsg) {
            loadingTimers.forEach(clearTimeout);
            showError(escapeHtml(errorMsg));
            loading.classList.add('hidden');
            submitBtn.disabled = false;
            testsPageBusy = false;
          },
        });
      })
      .catch(function (err) {
        loadingTimers.forEach(clearTimeout);
        // Keep localStorage entry (phase='submitting') so page reload can re-submit.
        // Only clear if the error is a client-side validation issue, not a server/network error.
        if (err.message === 'Failed to fetch') {
          showError('Could not reach the server. Check your connection. Reload the page to retry.');
        } else if (err.message && err.message.indexOf('Rate limit') !== -1) {
          clearActiveJob('tests');
          showError(escapeHtml(err.message));
        } else {
          showError(escapeHtml(err.message) + ' Reload the page to retry.');
        }
        loading.classList.add('hidden');
        submitBtn.disabled = false;
        testsPageBusy = false;
      });
  });

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

  // Category description map — explains what each category evaluates
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
      if (highCount > 0) parts.push('<span class="qaproof-stat-high">' + highCount + ' High</span>');
      if (medCount > 0) parts.push('<span class="qaproof-stat-med">' + medCount + ' Med</span>');
      if (lowCount > 0) parts.push('<span class="qaproof-stat-low">' + lowCount + ' Low</span>');
      html += parts.join(' · ');
      html += '  </div>';
    }
    html += '</div>';

    // Pass rate card
    html += '<div class="qaproof-stat-card">';
    html += '  <div class="qaproof-stat-value ' + getScoreClass(passRate * 1) + '">' + passRate + '%</div>';
    html += '  <div class="qaproof-stat-label">Pass Rate</div>';
    html += '  <div class="qaproof-stat-detail">' + passCount + ' of ' + catEntries.length + ' categories</div>';
    html += '</div>';

    // Best category card
    html += '<div class="qaproof-stat-card">';
    html += '  <div class="qaproof-stat-value ' + getScoreClass(highestCat.score) + '">' + highestCat.score + '</div>';
    html += '  <div class="qaproof-stat-label">Best Category</div>';
    html += '  <div class="qaproof-stat-detail">' + escapeHtml(highestCat.name) + '</div>';
    html += '</div>';

    // Worst category card
    html += '<div class="qaproof-stat-card">';
    html += '  <div class="qaproof-stat-value ' + getScoreClass(lowestCat.score) + '">' + lowestCat.score + '</div>';
    html += '  <div class="qaproof-stat-label">Needs Attention</div>';
    html += '  <div class="qaproof-stat-detail">' + escapeHtml(lowestCat.name) + '</div>';
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

  /**
   * Build inline stats cards (no charts) for the combined hero block.
   */
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
      // Store feedback locally for now (will be sent via email later)
      var feedback = {
        rating: selectedRating,
        comment: comment,
        testType: id.replace('qaproof-', '').replace('qaproof', 'fidelity'),
        timestamp: new Date().toISOString()
      };
      var stored = JSON.parse(localStorage.getItem('qaproof_feedback') || '[]');
      stored.push(feedback);
      localStorage.setItem('qaproof_feedback', JSON.stringify(stored));

      // Show success state
      if (innerEl) innerEl.classList.add('hidden');
      if (successEl) successEl.classList.remove('hidden');
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
      if (highCount > 0) parts.push('<span class="qaproof-stat-high">' + highCount + ' High</span>');
      if (medCount > 0) parts.push('<span class="qaproof-stat-med">' + medCount + ' Med</span>');
      if (lowCount > 0) parts.push('<span class="qaproof-stat-low">' + lowCount + ' Low</span>');
      html += parts.join(' · ') + '</div>';
    }
    html += '</div>';
    html += '<div class="qaproof-stat-card"><div class="qaproof-stat-value ' + getScoreClass(passRate) + '">' + passRate + '%</div><div class="qaproof-stat-label">Pass Rate</div><div class="qaproof-stat-detail">' + passCount + ' of ' + catEntries.length + ' categories</div></div>';
    html += '<div class="qaproof-stat-card"><div class="qaproof-stat-value ' + getScoreClass(highestCat.score) + '">' + highestCat.score + '</div><div class="qaproof-stat-label">Best</div><div class="qaproof-stat-detail">' + escapeHtml(highestCat.name) + '</div></div>';
    html += '<div class="qaproof-stat-card"><div class="qaproof-stat-value ' + getScoreClass(lowestCat.score) + '">' + lowestCat.score + '</div><div class="qaproof-stat-label">Weakest</div><div class="qaproof-stat-detail">' + escapeHtml(lowestCat.name) + '</div></div>';
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
      if (highCount > 0) { donutLabels.push('High'); donutData.push(highCount); donutColors.push('#EF4444'); donutHoverColors.push('#DC2626'); }
      if (medCount > 0) { donutLabels.push('Medium'); donutData.push(medCount); donutColors.push('#F59E0B'); donutHoverColors.push('#D97706'); }
      if (lowCount > 0) { donutLabels.push('Low'); donutData.push(lowCount); donutColors.push('#00ADB5'); donutHoverColors.push('#009CA3'); }

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
    activeDiffIndex = null;
    syncScrollEnabled = true;
    markersVisible = true;
    isScrollSyncing = false;
    allDifferences = data.differences || [];
    activeDevice = 'desktop';

    var score = data.score;
    var scoreClass = getScoreClass(score);

    var html = buildBackButtonHtml();

    // Combined score + stats header
    html += '<div class="qaproof-report-hero">';
    html += '  <div class="qaproof-report-hero-top">';
    html += '    <div class="qaproof-report-hero-score">';
    html += buildScoreRingHtml(score, 'Design Fidelity Score', scoreClass);
    html += '      <div class="qaproof-score-label">Design Fidelity Score</div>';
    html += '    </div>';
    html += '    <div class="qaproof-report-hero-info">';
    html += '      <div class="qaproof-summary">' + escapeHtml(data.summary || '') + '</div>';
    html += '      <div class="qaproof-report-hero-actions">';
    html += '        <button type="button" id="qaproof-pdf-btn" class="qaproof-btn qaproof-pdf-btn"><span class="dashicons dashicons-pdf"></span> Download PDF Report</button>';
    html += '        <button type="button" id="qaproof-email-btn" class="qaproof-btn qaproof-email-btn"><span class="dashicons dashicons-email-alt"></span> Send to Email</button>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

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
      html += '        <button type="button" id="qaproof-toggle-markers" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg> Markers</button>';
      html += '        <button type="button" id="qaproof-toggle-sync" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2v4h4M12 14v-4H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4L8.5 7.5M4 12l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Sync Scroll</button>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="qaproof-comparison-viewport">';
      html += '      <div class="qaproof-screenshot-col">';
      html += '        <div class="qaproof-screenshot-label">Design (Figma)</div>';
      html += '        <div class="qaproof-screenshot-wrapper" id="qaproof-wrapper-figma">';
      html += '          <div class="qaproof-screenshot-inner">';
      html += '            <img id="qaproof-screenshot-figma" src="' + escapeAttr(data.screenshots.figma || '') + '" alt="Figma" />';
      html += '            <div class="qaproof-markers-layer" id="qaproof-markers-figma"></div>';
      html += '          </div>';
      html += '        </div>';
      html += '      </div>';
      html += '      <div class="qaproof-screenshot-col">';
      html += '        <div class="qaproof-screenshot-label">Live Page</div>';
      html += '        <div class="qaproof-screenshot-wrapper" id="qaproof-wrapper-live">';
      html += '          <div class="qaproof-screenshot-inner">';
      html += '            <img id="qaproof-screenshot-live" src="' + escapeAttr(data.screenshots.live || '') + '" alt="Live" />';
      html += '            <div class="qaproof-markers-layer" id="qaproof-markers-live"></div>';
      html += '          </div>';
      html += '        </div>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    }

    // Differences
    html += '<h2>Differences <span class="qaproof-diff-count" id="qaproof-diff-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-severity-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-severity="all">All</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="high">High</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="medium">Medium</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="low">Low</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div id="qaproof-differences"></div>';
    html += '</div>';

    // Recommendations
    html += '<h2>Recommendations</h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-recommendations" id="qaproof-recommendations"></div>';
    html += '</div>';

    // Feedback
    html += buildFeedbackSectionHtml('qaproof');

    resultsContainer.innerHTML = html;
    resultsContainer.classList.remove('hidden');

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

    renderDifferencesInto('qaproof-differences', 'qaproof-diff-count', allDifferences, false);
    renderRecommendationsInto('qaproof-recommendations', data.recommendations);

    // Markers after images load
    if (data.screenshots) {
      var figmaImg = document.getElementById('qaproof-screenshot-figma');
      var liveImg = document.getElementById('qaproof-screenshot-live');
      Promise.all([waitForImage(figmaImg), waitForImage(liveImg)]).then(function () {
        renderMarkers(allDifferences);
      });

      setupSyncScroll();
      setupToolbar();
    }

    setupFilterFor('qaproof-severity-filter', 'severity');

    // PDF download button
    var pdfBtn = document.getElementById('qaproof-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        generatePdfReport(data);
      });
    }

    scrollToElement(resultsContainer);
  }

  // ============================
  // Render Responsive Results
  // ============================
  function renderResponsiveResults(data) {
    activeDiffIndex = null;
    allDifferences = data.differences || [];
    activeDevice = 'desktop';

    var score = data.score;
    var scoreClass = getScoreClass(score);
    var html = buildBackButtonHtml();

    // Combined score + stats header
    html += '<div class="qaproof-report-hero">';
    html += '  <div class="qaproof-report-hero-top">';
    html += '    <div class="qaproof-report-hero-score">';
    html += buildScoreRingHtml(score, 'Responsive Score', scoreClass);
    html += '      <div class="qaproof-score-label">Responsive Score</div>';
    html += '    </div>';
    html += '    <div class="qaproof-report-hero-info">';
    html += '      <div class="qaproof-summary">' + escapeHtml(data.summary || '') + '</div>';
    html += '      <div class="qaproof-report-hero-actions">';
    html += '        <button type="button" id="qaproof-pdf-btn" class="qaproof-btn qaproof-pdf-btn"><span class="dashicons dashicons-pdf"></span> Download PDF Report</button>';
    html += '        <button type="button" id="qaproof-email-btn" class="qaproof-btn qaproof-email-btn"><span class="dashicons dashicons-email-alt"></span> Send to Email</button>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

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
        html += '        <img id="qaproof-screenshot-' + device + '" src="' + escapeAttr(src) + '" alt="' + deviceLabels[device] + '" style="display:block;width:100%;height:auto;" />';
        html += '        <div class="qaproof-markers-layer" id="qaproof-markers-' + device + '"></div>';
        html += '      </div>';
        html += '    </div>';
        html += '  </div>';
      }
      html += '  </div>';
      html += '</div>';
    }

    // Differences
    html += '<h2>Differences <span class="qaproof-diff-count" id="qaproof-resp-diff-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-resp-severity-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-severity="all">All</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="high">High</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="medium">Medium</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="low">Low</button>';
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

    // Recommendations
    html += '<h2>Recommendations</h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-recommendations" id="qaproof-resp-recommendations"></div>';
    html += '</div>';

    // Feedback
    html += buildFeedbackSectionHtml('qaproof-resp');

    resultsContainer.innerHTML = html;
    resultsContainer.classList.remove('hidden');

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

    renderDifferencesInto('qaproof-resp-differences', 'qaproof-resp-diff-count', allDifferences, true);
    renderRecommendationsInto('qaproof-resp-recommendations', data.recommendations);

    // Device tabs
    setupDeviceTabs();

    // Markers after images load
    if (data.screenshots) {
      var imgPromises = [];
      ['desktop', 'tablet', 'tablet_landscape', 'mobile', 'mobile_landscape'].forEach(function (d) {
        var img = document.getElementById('qaproof-screenshot-' + d);
        if (img && img.src) imgPromises.push(waitForImage(img));
      });
      Promise.all(imgPromises).then(function () {
        renderMarkersForDevice('desktop', allDifferences);
      });
    }

    setupFilterFor('qaproof-resp-severity-filter', 'severity');
    setupFilterFor('qaproof-device-filter', 'device');

    // PDF download button
    var pdfBtn = document.getElementById('qaproof-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        generatePdfReport(data);
      });
    }

    scrollToElement(resultsContainer);
  }

  // ============================
  // Render Accessibility Results
  // ============================
  function renderAccessibilityResults(data) {
    activeDiffIndex = null;
    allDifferences = data.differences || [];
    markersVisible = true;

    var score = data.score;
    var scoreClass = getScoreClass(score);

    var html = buildBackButtonHtml();

    // Combined score + stats header
    html += '<div class="qaproof-report-hero">';
    html += '  <div class="qaproof-report-hero-top">';
    html += '    <div class="qaproof-report-hero-score">';
    html += buildScoreRingHtml(score, 'Accessibility Score', scoreClass);
    html += '      <div class="qaproof-score-label">Accessibility Score</div>';
    html += '    </div>';
    html += '    <div class="qaproof-report-hero-info">';
    html += '      <div class="qaproof-summary">' + escapeHtml(data.summary || '') + '</div>';
    html += '      <div class="qaproof-report-hero-actions">';
    html += '        <button type="button" id="qaproof-pdf-btn" class="qaproof-btn qaproof-pdf-btn"><span class="dashicons dashicons-pdf"></span> Download PDF Report</button>';
    html += '        <button type="button" id="qaproof-email-btn" class="qaproof-btn qaproof-email-btn"><span class="dashicons dashicons-email-alt"></span> Send to Email</button>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

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
      html += '        <button type="button" id="qaproof-toggle-markers" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg> Markers</button>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="qaproof-screenshot-viewport">';
      html += '      <div class="qaproof-screenshot-inner">';
      if (a11ySrc) {
        html += '        <img id="qaproof-screenshot-a11y" src="' + escapeAttr(a11ySrc) + '" alt="Page Screenshot" style="display:block;width:100%;height:auto;" />';
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

    // Differences (issues)
    html += '<h2>Issues <span class="qaproof-diff-count" id="qaproof-a11y-diff-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-a11y-severity-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-severity="all">All</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="high">High</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="medium">Medium</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="low">Low</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div id="qaproof-a11y-differences"></div>';
    html += '</div>';

    // Recommendations
    html += '<h2>Recommendations</h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-recommendations" id="qaproof-a11y-recommendations"></div>';
    html += '</div>';

    // Feedback
    html += buildFeedbackSectionHtml('qaproof-a11y');

    resultsContainer.innerHTML = html;
    resultsContainer.classList.remove('hidden');

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

    renderDifferencesInto('qaproof-a11y-differences', 'qaproof-a11y-diff-count', allDifferences, false);
    renderRecommendationsInto('qaproof-a11y-recommendations', data.recommendations);

    // Markers after image loads
    if (data.screenshots && data.screenshots.desktop) {
      var a11yImg = document.getElementById('qaproof-screenshot-a11y');
      waitForImage(a11yImg).then(function () {
        renderAccessibilityMarkers(allDifferences);
      });

      // Toggle markers button
      var toggleMarkersBtn = document.getElementById('qaproof-toggle-markers');
      if (toggleMarkersBtn) {
        toggleMarkersBtn.addEventListener('click', function () {
          markersVisible = !markersVisible;
          toggleMarkersBtn.classList.toggle('active', markersVisible);
          var layer = document.getElementById('qaproof-markers-a11y');
          if (layer) layer.style.display = markersVisible ? '' : 'none';
        });
      }
    }

    setupFilterFor('qaproof-a11y-severity-filter', 'severity');

    // PDF download button
    var pdfBtn = document.getElementById('qaproof-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        generatePdfReport(data);
      });
    }

    scrollToElement(resultsContainer);
  }

  // ============================
  // Render Design Audit Results
  // ============================
  function renderDesignAuditResults(data) {
    activeDiffIndex = null;
    allDifferences = data.differences || [];
    markersVisible = true;

    // Safe defaults for missing data
    var score = typeof data.score === 'number' ? data.score : 0;
    var debtScore = typeof data.designDebtScore === 'number' ? data.designDebtScore : (100 - score);
    var scoreClass = getScoreClass(score);
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
    html += '      <div class="qaproof-summary">' + escapeHtml(data.summary || '') + '</div>';
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
          html += '  <div class="qaproof-swatch-circle" style="background:' + escapeAttr(c.value) + ';"></div>';
          html += '  <div class="qaproof-swatch-hex">' + escapeHtml(c.value) + '</div>';
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
            html += '  <div class="qaproof-swatch-circle" style="background:' + escapeAttr(c.value) + ';"></div>';
            html += '  <div class="qaproof-swatch-hex">' + escapeHtml(c.value) + '</div>';
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
          html += '  <div class="qaproof-font-name" style="font-family:' + escapeAttr(f.name) + ',sans-serif;">' + escapeHtml(f.name) + '</div>';
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
            html += '    <span class="qaproof-type-val">' + escapeHtml(s.value) + '</span>';
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
            html += '<span class="qaproof-token-pill"><strong style="font-weight:' + escapeAttr(w.value) + ';">' + escapeHtml(label) + '</strong> <small>(' + w.count + ')</small></span>';
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
            html += '<span class="qaproof-token-pill qaproof-token-outlier">' + escapeHtml(o.value) + ' <small>(' + o.count + 'x)</small></span>';
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
          html += '  <div class="qaproof-radius-val">' + escapeHtml(r.value) + '</div>';
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
          html += '  <code class="qaproof-cssvar-name">' + escapeHtml(prop) + '</code>';
          html += '  <span class="qaproof-cssvar-val">';
          if (isColor) {
            html += '<span class="qaproof-cssvar-swatch" style="background:' + escapeAttr(val.trim()) + ';"></span>';
          }
          html += escapeHtml(val) + '</span>';
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
      html += '        <button type="button" id="qaproof-toggle-markers" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg> Markers</button>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="qaproof-screenshot-viewport">';
      html += '      <div class="qaproof-screenshot-inner">';
      if (daSrc) {
        html += '        <img id="qaproof-screenshot-da" src="' + escapeAttr(daSrc) + '" alt="Page Screenshot" style="display:block;width:100%;height:auto;" />';
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

    // Differences
    html += '<h2>Design Debt Issues <span class="qaproof-diff-count" id="qaproof-da-diff-count">0</span></h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-filter-row">';
    html += '    <div class="qaproof-severity-filter" id="qaproof-da-severity-filter">';
    html += '      <button type="button" class="qaproof-filter-btn active" data-severity="all">All</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="high">High</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="medium">Medium</button>';
    html += '      <button type="button" class="qaproof-filter-btn" data-severity="low">Low</button>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div id="qaproof-da-differences"></div>';
    html += '</div>';

    // Recommendations
    html += '<h2>Recommendations</h2>';
    html += '<div class="qaproof-card">';
    html += '  <div class="qaproof-recommendations" id="qaproof-da-recommendations"></div>';
    html += '</div>';

    // Feedback
    html += buildFeedbackSectionHtml('qaproof-da');

    resultsContainer.innerHTML = html;
    resultsContainer.classList.remove('hidden');

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

    renderDifferencesInto('qaproof-da-differences', 'qaproof-da-diff-count', allDifferences, false);
    renderRecommendationsInto('qaproof-da-recommendations', data.recommendations);

    // Markers after image loads
    if (data.screenshots && data.screenshots.desktop) {
      var daImg = document.getElementById('qaproof-screenshot-da');
      if (daImg) {
        waitForImage(daImg).then(function () {
          var markersLayer = document.getElementById('qaproof-markers-da');
          renderMarkersIntoLayer(markersLayer, allDifferences);
        });
      }

      var toggleMarkersBtn = document.getElementById('qaproof-toggle-markers');
      if (toggleMarkersBtn) {
        toggleMarkersBtn.addEventListener('click', function () {
          markersVisible = !markersVisible;
          toggleMarkersBtn.classList.toggle('active', markersVisible);
          var layer = document.getElementById('qaproof-markers-da');
          if (layer) layer.style.display = markersVisible ? '' : 'none';
        });
      }
    }

    setupFilterFor('qaproof-da-severity-filter', 'severity');

    // Token tabs interaction
    var tokenTabs = document.querySelectorAll('.qaproof-token-tab');
    tokenTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var panel = tab.dataset.panel;
        tokenTabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        document.querySelectorAll('.qaproof-token-panel').forEach(function (p) {
          p.classList.toggle('active', p.dataset.panel === panel);
        });
      });
    });

    // PDF download button
    var pdfBtn = document.getElementById('qaproof-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        generatePdfReport(data);
      });
    }

    scrollToElement(resultsContainer);
  }

  // Severity color map for pie markers
  var sevColorMap = { high: '#EF4444', medium: '#F0B429', low: '#3B82F6' };

  /**
   * Group differences by proximity so overlapping markers merge into one.
   * Returns array of groups: [{ diffs: [{idx, diff}...], top, left }]
   */
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
          groups[g].diffs.push({ idx: i, diff: diff });
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
        groups.push({ diffs: [{ idx: i, diff: diff }], top: t, left: l });
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
   *
   * Two modes:
   * - Accessibility diffs (wcag_criterion): require real DOM element bounds
   *   (width/height) for a pin. AI-only accessibility diffs lack bounds and
   *   would show a pin that highlights nothing on hover — confusing.
   * - Responsive / fidelity / regression diffs: AI provides approximate
   *   locations on the screenshot. Pins are appropriate here — they point to
   *   the visual area even though there are no DOM bounds to highlight.
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
    var number = idx + 1;
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

    // Pin head (circle with number)
    var head = document.createElement('div');
    head.className = 'marker-head';
    head.textContent = number;
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
      description: truncate(diff.description, 180)
    };

    marker.addEventListener('mouseenter', function () {
      showTooltip(this, tooltipData);
      showElementHighlight(this, diff);
    });
    marker.addEventListener('mouseleave', function () {
      hideTooltip();
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
      tooltipLines.push(truncate(diffs[i].diff.description, 80));
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
          description: truncate(d.diff.description, 100)
        };
      })
    };

    marker.addEventListener('mouseenter', function () {
      showTooltip(this, tooltipData);
      // For pie markers, compute the bounding box that covers ALL grouped
      // elements (union of all rects). This way, if 3 issues point to the
      // same button, the highlight wraps that button. If issues span very
      // different areas, the union will be large — we still show it but
      // cap at a reasonable size to avoid wrapping half the page.
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
      hideTooltip();
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
  // Shared Rendering
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
      var scoreClass = getScoreClass(cat.score);
      var description = categoryDescriptions[name] || '';
      var offset = circumference - (cat.score / 100) * circumference;
      var displayName = labels[name] || capitalize(name.replace(/_/g, ' '));

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
        '<span class="qaproof-cat-tab-label">' + escapeHtml(displayName) + '</span>';
      nav.appendChild(tab);

      // Tab panel
      var panel = document.createElement('div');
      panel.className = 'qaproof-cat-tab-panel' + (i === 0 ? ' active' : '');
      panel.setAttribute('data-panel', name);
      panel.innerHTML =
        '<div class="qaproof-cat-panel-header">' +
        '  <h3>' + escapeHtml(displayName) + '</h3>' +
        (description ? '  <div class="qaproof-cat-evaluates">' + escapeHtml(description) + '</div>' : '') +
        '</div>' +
        '<p>' + escapeHtml(cat.notes || '') + '</p>';
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

    // Tab click handler
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.qaproof-cat-tab');
      if (!btn || btn.classList.contains('active')) return;
      var key = btn.getAttribute('data-tab');

      nav.querySelectorAll('.qaproof-cat-tab').forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      moveSlider(btn);

      panels.querySelectorAll('.qaproof-cat-tab-panel').forEach(function (p) { p.classList.remove('active'); });
      var target = panels.querySelector('[data-panel="' + key + '"]');
      if (target) target.classList.add('active');
    });
  }

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
    if (highCount > 0) barHtml += '<span class="qaproof-diff-sev-chip qaproof-diff-sev-chip-high">' + severityIcon('high') + ' ' + highCount + ' High</span>';
    if (medCount > 0) barHtml += '<span class="qaproof-diff-sev-chip qaproof-diff-sev-chip-medium">' + severityIcon('medium') + ' ' + medCount + ' Medium</span>';
    if (lowCount > 0) barHtml += '<span class="qaproof-diff-sev-chip qaproof-diff-sev-chip-low">' + severityIcon('low') + ' ' + lowCount + ' Low</span>';
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
        '  <span class="qaproof-diff-group-title">' + escapeHtml(catLabel) + '</span>' +
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
        var severity = diff.severity || 'low';

        var deviceLabelMap = { desktop: 'Desktop', tablet: 'Tablet', tablet_landscape: 'Tablet Landscape', mobile: 'Mobile', mobile_landscape: 'Mobile Landscape' };
        var deviceBadge = showDevice && diff.device
          ? '<span class="qaproof-badge qaproof-badge-device">' + escapeHtml(deviceLabelMap[diff.device] || diff.device) + '</span>'
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
          '    <span class="qaproof-severity-tag qaproof-severity-tag-' + severity + '">' + severityIcon(severity) + ' ' + escapeHtml(capitalize(severity)) + '</span>' +
          '    ' + deviceBadge +
          '  </div>' +
          '  <div class="qaproof-diff-description">' + escapeHtml(diff.description || '') + '</div>' +
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

  function renderRecommendationsInto(containerId, recommendations) {
    var list = document.getElementById(containerId);
    if (!list) return;
    list.innerHTML = '';

    if (!recommendations || recommendations.length === 0) {
      list.innerHTML = '<div class="qaproof-rec-empty">No recommendations at this time.</div>';
      return;
    }

    function formatRecText(text) {
      var formatted = escapeHtml(text)
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

    // Priority summary
    var summaryEl = document.createElement('div');
    summaryEl.className = 'qaproof-rec-summary';
    summaryEl.innerHTML =
      '<span class="qaproof-rec-summary-total">' + recommendations.length + ' recommendations</span>' +
      (codeRecs.length > 0 ? '<span class="qaproof-rec-chip qaproof-rec-chip-code">' + codeRecs.length + ' Code Fixes</span>' : '') +
      (quickRecs.length > 0 ? '<span class="qaproof-rec-chip qaproof-rec-chip-quick">' + quickRecs.length + ' Quick Wins</span>' : '') +
      (structuralRecs.length > 0 ? '<span class="qaproof-rec-chip qaproof-rec-chip-structural">' + structuralRecs.length + ' Structural</span>' : '');
    list.appendChild(summaryEl);

    function renderRecGroup(label, icon, items, groupClass) {
      if (items.length === 0) return;
      var groupEl = document.createElement('div');
      groupEl.className = 'qaproof-rec-group ' + groupClass;

      var headerEl = document.createElement('div');
      headerEl.className = 'qaproof-rec-group-header';
      headerEl.innerHTML = '<span class="qaproof-rec-group-icon">' + icon + '</span><span class="qaproof-rec-group-label">' + label + '</span><span class="qaproof-rec-group-badge">' + items.length + '</span>';
      groupEl.appendChild(headerEl);

      var gridEl = document.createElement('div');
      gridEl.className = 'qaproof-rec-grid';

      for (var j = 0; j < items.length; j++) {
        var rec = items[j];
        var item = document.createElement('div');
        item.className = 'qaproof-rec-item';
        item.style.animationDelay = (j * 0.04) + 's';
        item.innerHTML =
          '<div class="qaproof-rec-indicator">' +
          '  <span class="qaproof-rec-num">' + rec.num + '</span>' +
          '</div>' +
          '<div class="qaproof-rec-body">' +
          '  <div class="qaproof-rec-text">' + formatRecText(rec.text) + '</div>' +
          '</div>';
        gridEl.appendChild(item);
      }

      groupEl.appendChild(gridEl);
      list.appendChild(groupEl);
    }

    renderRecGroup('Code Fixes', '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5.5 4L2 8l3.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 4L14 8l-3.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>', codeRecs, 'qaproof-rec-group-code');
    renderRecGroup('Quick Wins', '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v6l4 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/></svg>', quickRecs, 'qaproof-rec-group-quick');
    renderRecGroup('Structural Changes', '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>', structuralRecs, 'qaproof-rec-group-structural');
  }

  // ============================
  // Markers
  // ============================
  function ensureGlobalTooltip() {
    if (!globalTooltip) {
      globalTooltip = document.createElement('div');
      globalTooltip.className = 'qaproof-marker-tooltip';
      document.getElementById('qaproof-app').appendChild(globalTooltip);
    }
    return globalTooltip;
  }

  function buildTooltipHTML(data) {
    // data can be:
    //   { severity, category, description } — single issue
    //   { severity: 'multi', items: [{ severity, description }...] } — pie/grouped
    var html = '';
    var sevLabels = { high: 'High Severity', medium: 'Medium', low: 'Low Severity', multi: 'Multiple Issues' };

    if (data.items) {
      // Multi-issue tooltip
      html += '<div class="tooltip-header sev-multi"><span class="sev-dot"></span>' + data.items.length + ' Issues Found</div>';
      html += '<div class="tooltip-body">';
      for (var i = 0; i < data.items.length; i++) {
        var item = data.items[i];
        html += '<div class="tooltip-item">';
        html += '<div class="sev-indicator ind-' + escapeHtml(item.severity) + '"></div>';
        html += '<div>' + escapeHtml(item.description) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    } else {
      // Single issue tooltip
      var sev = data.severity || 'low';
      html += '<div class="tooltip-header sev-' + escapeHtml(sev) + '"><span class="sev-dot"></span>' + escapeHtml(sevLabels[sev] || sev) + '</div>';
      html += '<div class="tooltip-body">';
      if (data.category) {
        html += '<span class="tooltip-category">' + escapeHtml(data.category) + '</span>';
      }
      html += '<div>' + escapeHtml(data.description) + '</div>';
      html += '</div>';
    }
    return html;
  }

  function showTooltip(marker, data) {
    var tooltip = ensureGlobalTooltip();

    // Support legacy plain string calls (backwards compat)
    if (typeof data === 'string') {
      tooltip.innerHTML = '<div class="tooltip-body">' + escapeHtml(data) + '</div>';
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
    if (globalTooltip) {
      globalTooltip.classList.remove('visible');
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
      return !diff.device || diff.device === device;
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
    activeDiffIndex = index;

    // Highlight the clicked difference in the list
    var diffEl = resultsContainer.querySelector('.qaproof-difference[data-index="' + index + '"]');
    if (diffEl) {
      diffEl.classList.add('active');
    }

    // Highlight markers on screenshots (including pie markers that contain this index)
    resultsContainer.querySelectorAll('.qaproof-marker').forEach(function (marker) {
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
        var group = diffEl.closest('.qaproof-category-group');
        if (group && !group.classList.contains('expanded')) {
          var groupHeader = group.querySelector('.qaproof-category-group-header');
          if (groupHeader) groupHeader.click();
        }
        setTimeout(function () {
          diffEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      }
    } else {
      // Clicked from the issues list → scroll UP to the screenshot and
      // scroll within the screenshot wrapper to the marker position.
      var comparisonSection = resultsContainer.querySelector('.qaproof-comparison-viewport') ||
                              resultsContainer.querySelector('.qaproof-device-screenshot-wrapper');
      if (comparisonSection) {
        scrollToElement(comparisonSection);
      }

      setTimeout(function () {
        if (testType === 'fidelity') {
          scrollScreenshotsToMarker(index);
        } else if (testType === 'accessibility') {
          scrollAccessibilityScreenshotToMarker(index);
        } else {
          var diff = allDifferences[index];
          if (diff && diff.device && diff.device !== activeDevice) {
            switchDeviceTab(diff.device);
          }
          scrollDeviceScreenshotToMarker(index);
        }
      }, 400);
    }
  }

  function deselectAll() {
    resultsContainer.querySelectorAll('.qaproof-difference.active').forEach(function (el) {
      el.classList.remove('active');
    });
    resultsContainer.querySelectorAll('.qaproof-marker.active').forEach(function (el) {
      el.classList.remove('active');
    });
    activeDiffIndex = null;
  }

  function scrollScreenshotsToMarker(index) {
    var diff = allDifferences[index];
    if (!diff || !diff.location) return;

    var wrapperFigma = document.getElementById('qaproof-wrapper-figma');
    var wrapperLive = document.getElementById('qaproof-wrapper-live');
    if (!wrapperFigma || !wrapperLive) return;

    isScrollSyncing = true;

    var innerFigma = wrapperFigma.querySelector('.qaproof-screenshot-inner');
    var figmaTargetTop = (diff.location.top / 100) * innerFigma.offsetHeight - wrapperFigma.clientHeight / 2;
    wrapperFigma.scrollTo({ top: Math.max(0, figmaTargetTop), behavior: 'smooth' });

    var innerLive = wrapperLive.querySelector('.qaproof-screenshot-inner');
    var liveTargetTop = (diff.location.top / 100) * innerLive.offsetHeight - wrapperLive.clientHeight / 2;
    wrapperLive.scrollTo({ top: Math.max(0, liveTargetTop), behavior: 'smooth' });

    setTimeout(function () { isScrollSyncing = false; }, 600);
  }

  function scrollDeviceScreenshotToMarker(index) {
    var diff = allDifferences[index];
    if (!diff || !diff.location) return;

    var device = diff.device || activeDevice;
    var panel = document.getElementById('qaproof-panel-' + device);
    if (!panel) return;

    var wrapper = panel.querySelector('.qaproof-device-screenshot-wrapper');
    var inner = panel.querySelector('.qaproof-screenshot-inner');
    if (!wrapper || !inner) return;

    var targetTop = (diff.location.top / 100) * inner.offsetHeight - wrapper.clientHeight / 2;
    wrapper.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }

  function scrollAccessibilityScreenshotToMarker(index) {
    var diff = allDifferences[index];
    if (!diff || !diff.location) return;

    var wrapper = resultsContainer.querySelector('.qaproof-device-screenshot-wrapper');
    var inner = resultsContainer.querySelector('.qaproof-screenshot-inner');
    if (!wrapper || !inner) return;

    var targetTop = (diff.location.top / 100) * inner.offsetHeight - wrapper.clientHeight / 2;
    wrapper.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }

  // ============================
  // Device Tabs (Responsive)
  // ============================
  function setupDeviceTabs() {
    resultsContainer.querySelectorAll('.qaproof-device-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchDeviceTab(tab.dataset.device);
      });
    });
  }

  function switchDeviceTab(device) {
    activeDevice = device;

    resultsContainer.querySelectorAll('.qaproof-device-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.device === device);
    });
    resultsContainer.querySelectorAll('.qaproof-device-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'qaproof-panel-' + device);
    });

    renderMarkersForDevice(device, allDifferences);
  }

  // ============================
  // Synchronized Scrolling (Fidelity)
  // ============================
  function setupSyncScroll() {
    var wrapperFigma = document.getElementById('qaproof-wrapper-figma');
    var wrapperLive = document.getElementById('qaproof-wrapper-live');
    if (!wrapperFigma || !wrapperLive) return;

    function syncScroll(source, target) {
      if (!syncScrollEnabled || isScrollSyncing) return;
      isScrollSyncing = true;

      var maxScroll = source.scrollHeight - source.clientHeight;
      var scrollPercent = maxScroll > 0 ? source.scrollTop / maxScroll : 0;
      var targetMax = target.scrollHeight - target.clientHeight;
      target.scrollTop = scrollPercent * targetMax;

      requestAnimationFrame(function () { isScrollSyncing = false; });
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
      markersVisible = !markersVisible;
      toggleMarkersBtn.classList.toggle('active', markersVisible);
      resultsContainer.querySelectorAll('.qaproof-markers-layer').forEach(function (layer) {
        layer.style.display = markersVisible ? '' : 'none';
      });
    });

    toggleSyncBtn.addEventListener('click', function () {
      syncScrollEnabled = !syncScrollEnabled;
      toggleSyncBtn.classList.toggle('active', syncScrollEnabled);
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
          markersContainer = document.getElementById('qaproof-markers-' + activeDevice);
        } else {
          markersContainer = resultsContainer;
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
              var diff = allDifferences[indices[m]];
              if (diff && diff[filterKey] === filterValue) { anyMatch = true; break; }
            }
            marker.style.display = anyMatch ? '' : 'none';
          });
        }
      }
    });
  }

  // ============================
  // Keyboard Navigation
  // ============================
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (allDifferences.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      var next = activeDiffIndex === null ? 0 : Math.min(activeDiffIndex + 1, allDifferences.length - 1);
      selectDifference(next);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      var prev = activeDiffIndex === null ? 0 : Math.max(activeDiffIndex - 1, 0);
      selectDifference(prev);
    } else if (e.key === 'Escape') {
      deselectAll();
    }
  });

  // ============================
  // Email Report — Inline Confirmation
  // ============================
  function toggleEmailConfirmation(emailBtn) {
    // If already expanded, collapse back
    if (emailBtn.classList.contains('qaproof-email-expanded')) {
      collapseEmailBtn(emailBtn);
      return;
    }

    var userEmail = typeof qaproofAdmin !== 'undefined' && qaproofAdmin.adminEmail ? qaproofAdmin.adminEmail : 'your account email';

    // Save original content
    emailBtn._originalHtml = emailBtn.innerHTML;
    emailBtn.classList.add('qaproof-email-expanded');

    emailBtn.innerHTML = '' +
      '<span class="qaproof-email-confirm-text">Send to <strong>' + escapeHtml(userEmail) + '</strong>?</span>' +
      '<span class="qaproof-email-confirm-actions">' +
      '  <button type="button" class="qaproof-email-confirm-cancel">Cancel</button>' +
      '  <button type="button" class="qaproof-email-confirm-send"><span class="dashicons dashicons-yes"></span> Confirm</button>' +
      '</span>';

    // Cancel
    emailBtn.querySelector('.qaproof-email-confirm-cancel').addEventListener('click', function(ev) {
      ev.stopPropagation();
      collapseEmailBtn(emailBtn);
    });

    // Send
    emailBtn.querySelector('.qaproof-email-confirm-send').addEventListener('click', function(ev) {
      ev.stopPropagation();
      var sendBtn = this;
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="dashicons dashicons-update qaproof-spin"></span> Sending...';

      // Simulate sending (frontend-only for now)
      setTimeout(function() {
        sendBtn.innerHTML = '<span class="dashicons dashicons-yes"></span> Sent!';
        sendBtn.classList.add('qaproof-email-sent');
        setTimeout(function() {
          collapseEmailBtn(emailBtn);
        }, 1200);
      }, 1500);
    });
  }

  function collapseEmailBtn(emailBtn) {
    emailBtn.classList.remove('qaproof-email-expanded');
    if (emailBtn._originalHtml) {
      emailBtn.innerHTML = emailBtn._originalHtml;
    }
  }

  // Hook up email buttons (delegated)
  document.addEventListener('click', function(e) {
    // Don't re-trigger if clicking inside expanded confirmation
    if (e.target.closest('.qaproof-email-confirm-actions') || e.target.closest('.qaproof-email-confirm-text')) return;
    var btn = e.target.closest('#qaproof-email-btn');
    if (btn) {
      e.preventDefault();
      toggleEmailConfirmation(btn);
    }
  });

  // ============================
  // PDF Report Generation
  // ============================
  function generatePdfReport(data) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF library failed to load. Please refresh the page and try again.');
      return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF('p', 'mm', 'a4');
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 18; // margin
    var CW = W - M * 2; // content width
    var y = 0;

    // ── Brand palette ──
    var C = {
      teal: [0, 173, 181], tealDark: [0, 140, 147],
      dark: [34, 40, 49], darkAlt: [42, 47, 56],
      gray: [122, 130, 144], grayLight: [160, 168, 180],
      body: [57, 62, 70], bodyLight: [90, 96, 108],
      bg: [248, 249, 250], bgAlt: [241, 243, 245],
      white: [255, 255, 255],
      red: [239, 68, 68], amber: [245, 158, 11], blue: [59, 130, 246],
      green: [16, 185, 129]
    };

    var currentTestType = data.testType || testType;
    var labels = {
      fidelity: 'Design Fidelity Analysis',
      responsive: 'Responsive Testing Report',
      accessibility: 'Accessibility Audit Report',
      regression: 'Visual Regression Report',
      'design-audit': 'Design System Audit Report'
    };
    var descs = {
      fidelity: 'Pixel-level comparison of design mockup against live implementation',
      responsive: 'Cross-viewport layout and usability analysis across breakpoints',
      accessibility: 'WCAG 2.1 Level AA compliance evaluation and remediation guidance',
      regression: 'Visual change detection against previously established baseline',
      'design-audit': 'Automated design system discovery, consistency audit, and design debt analysis'
    };
    var reportLabel = labels[currentTestType] || 'QA Analysis Report';
    var reportDesc = descs[currentTestType] || '';
    var urlText = data.pageUrl || (document.getElementById('qaproof-page-url') ? document.getElementById('qaproof-page-url').value : '') || (document.getElementById('qaproof-a11y-url') ? document.getElementById('qaproof-a11y-url').value : '');
    var score = data.score;
    var scoreColor = score >= 90 ? C.teal : score >= 70 ? C.amber : C.red;
    var scoreGrade = score >= 95 ? 'A+' : score >= 90 ? 'A' : score >= 85 ? 'B+' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
    var scoreVerdict = score >= 90 ? 'PASS' : score >= 70 ? 'NEEDS WORK' : 'FAIL';
    var now = new Date();
    var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    var reportId = 'QP-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '-' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    var differences = data.differences || [];
    var recommendations = data.recommendations || [];
    var categories = data.categories || {};
    var catKeys = Object.keys(categories);

    // Count severities
    var sevCounts = { high: 0, medium: 0, low: 0 };
    differences.forEach(function (d) {
      var s = (d.severity || 'low').toLowerCase();
      if (sevCounts[s] !== undefined) sevCounts[s]++;
    });

    // ── HELPERS ──
    function setC(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function setF(c) { doc.setFillColor(c[0], c[1], c[2]); }
    function setD(c) { doc.setDrawColor(c[0], c[1], c[2]); }

    // Sanitize text for jsPDF — replace Unicode chars that Helvetica can't render
    function pdfSafe(text) {
      if (!text) return '';
      return String(text)
        .replace(/[\u2192\u2794\u279C\u27A1]/g, '->')  // → arrows
        .replace(/[\u2190]/g, '<-')                     // ← left arrow
        .replace(/[\u2194]/g, '<->')                    // ↔ bidirectional
        .replace(/[\u2013]/g, '-')                      // – en dash
        .replace(/[\u2014]/g, ' - ')                    // — em dash
        .replace(/[\u2018\u2019\u201A]/g, "'")          // smart single quotes
        .replace(/[\u201C\u201D\u201E]/g, '"')          // smart double quotes
        .replace(/[\u2026]/g, '...')                    // … ellipsis
        .replace(/[\u2022\u2023\u25CF\u25CB]/g, '*')    // bullet points
        .replace(/[\u2713\u2714]/g, '[ok]')             // ✓ checkmarks
        .replace(/[\u2717\u2718]/g, '[x]')              // ✗ cross marks
        .replace(/[\u00A0]/g, ' ')                      // non-breaking space
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')    // zero-width chars
        .replace(/[\u2264]/g, '<=')                     // ≤
        .replace(/[\u2265]/g, '>=')                     // ≥
        .replace(/[\u2260]/g, '!=')                     // ≠
        .replace(/[\u00D7]/g, 'x')                      // × multiplication
        .replace(/[\u00F7]/g, '/')                      // ÷ division
        .replace(/[^\x00-\xFF]/g, '');                  // strip any remaining non-Latin1
    }

    function checkPage(needed) {
      if (y + needed > H - 28) { doc.addPage(); y = 22; return true; }
      return false;
    }

    function drawScoreArc(cx, cy, r, pct, color, lineW) {
      // Background circle
      setD([230, 232, 236]);
      doc.setLineWidth(lineW || 2.5);
      doc.circle(cx, cy, r);
      // Score arc — approximate with small line segments
      setD(color);
      doc.setLineWidth(lineW || 2.5);
      var startA = -90;
      var endA = startA + (pct / 100) * 360;
      var step = 3;
      for (var a = startA; a < endA - step; a += step) {
        var a1 = (a * Math.PI) / 180;
        var a2 = (Math.min(a + step, endA) * Math.PI) / 180;
        doc.line(
          cx + r * Math.cos(a1), cy + r * Math.sin(a1),
          cx + r * Math.cos(a2), cy + r * Math.sin(a2)
        );
      }
      doc.setLineWidth(0.2);
    }

    function sectionHeading(title, subtitle) {
      checkPage(20);
      // Teal accent bar
      setF(C.teal);
      doc.rect(M, y, 3.5, 8, 'F');
      // Title
      doc.setFontSize(14);
      setC(C.dark);
      doc.text(title, M + 8, y + 6);
      if (subtitle) {
        doc.setFontSize(8);
        setC(C.gray);
        doc.text(subtitle, M + 8 + doc.getTextWidth(title) + 4, y + 6);
      }
      y += 14;
    }

    function addFooter() {
      var pn = doc.internal.getCurrentPageInfo().pageNumber;
      var tp = doc.internal.getNumberOfPages();
      // Top line
      setD([224, 226, 230]);
      doc.setLineWidth(0.3);
      doc.line(M, H - 16, W - M, H - 16);
      // Teal accent dash
      setF(C.teal);
      doc.rect(M, H - 16, 20, 0.8, 'F');
      // Left text
      doc.setFontSize(7);
      setC(C.gray);
      doc.text('QAProof  |  Automated Web Quality Assurance  |  qaproof.io', M, H - 11);
      doc.setFontSize(6.5);
      setC(C.grayLight);
      doc.text('Report ID: ' + reportId + '  |  Generated: ' + dateStr + ' ' + timeStr, M, H - 7.5);
      // Right: page number
      doc.setFontSize(8);
      setC(C.dark);
      doc.text(String(pn), W - M, H - 10, { align: 'right' });
      doc.setFontSize(6.5);
      setC(C.grayLight);
      doc.text('of ' + tp, W - M, H - 6.5, { align: 'right' });
    }

    // ══════════════════════════════════════════════
    // COVER HEADER
    // ══════════════════════════════════════════════

    // Full-width dark header
    setF(C.dark);
    doc.rect(0, 0, W, 65, 'F');

    // Subtle diagonal accent strip
    setF(C.darkAlt);
    doc.triangle(W - 80, 0, W, 0, W, 65, 'F');

    // Teal bottom edge
    setF(C.teal);
    doc.rect(0, 65, W, 1.2, 'F');

    // Brand
    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.text('QAProof', M, 20);

    // Tagline
    doc.setFontSize(8);
    doc.setTextColor(160, 168, 180);
    doc.text('AUTOMATED WEB QUALITY ASSURANCE', M, 27);

    // Report title
    doc.setFontSize(16);
    setC(C.teal);
    doc.text(reportLabel, M, 42);

    // Description
    doc.setFontSize(8.5);
    doc.setTextColor(140, 148, 162);
    doc.text(reportDesc, M, 49);

    // Date block (right side)
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(dateStr, W - M, 20, { align: 'right' });
    doc.setFontSize(7.5);
    doc.setTextColor(140, 148, 162);
    doc.text(timeStr + '  |  ' + reportId, W - M, 27, { align: 'right' });

    // Score circle in header (right side)
    var circR = 13;
    var circX = W - M - circR;
    var circY = 46;
    // Outer ring (score color)
    doc.setLineWidth(1.8);
    setD(scoreColor);
    doc.setFillColor(42, 47, 56);
    doc.circle(circX, circY, circR, 'FD');
    // Score number
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text(String(score != null ? score : '--'), circX, circY + 2, { align: 'center' });
    // /100 below
    doc.setFontSize(6);
    doc.setTextColor(140, 148, 162);
    doc.text('/100', circX, circY + 7.5, { align: 'center' });

    y = 74;

    // ── Meta info cards ──
    var metaH = 22;
    // URL card
    setF(C.bg);
    doc.roundedRect(M, y, CW * 0.65 - 3, metaH, 2, 2, 'F');
    doc.setFontSize(6.5);
    setC(C.gray);
    doc.text('TARGET URL', M + 6, y + 6);
    doc.setFontSize(9.5);
    setC(C.dark);
    var urlDisp = (urlText || 'N/A').length > 55 ? urlText.substring(0, 52) + '...' : (urlText || 'N/A');
    doc.text(urlDisp, M + 6, y + 14);
    doc.setFontSize(7);
    setC(C.grayLight);
    doc.text(dateStr, M + 6, y + 19);

    // Score summary card
    var scX = M + CW * 0.65 + 3;
    var scW = CW * 0.35 - 3;
    setF(C.bg);
    doc.roundedRect(scX, y, scW, metaH, 2, 2, 'F');
    doc.setFontSize(6.5);
    setC(C.gray);
    doc.text('OVERALL SCORE', scX + 6, y + 6);
    doc.setFontSize(9.5);
    setC(C.dark);
    doc.text('Grade: ' + scoreGrade + '  |  ' + scoreVerdict, scX + 6, y + 14);
    doc.setFontSize(7);
    setC(C.grayLight);
    doc.text(catKeys.length + ' categories  |  ' + differences.length + ' issues', scX + 6, y + 19);

    y += metaH + 8;

    // ── Executive Summary ──
    if (data.summary) {
      sectionHeading('Executive Summary');
      doc.setFontSize(9);
      setC(C.body);
      var sumLines = doc.splitTextToSize(pdfSafe(data.summary), CW);
      doc.text(sumLines, M, y);
      y += sumLines.length * 4.2 + 8;
    }

    // ══════════════════════════════════════════════
    // SCORE OVERVIEW — visual score card
    // ══════════════════════════════════════════════
    sectionHeading('Score Overview');

    var cardH = 32;
    // Card background
    setF(C.white);
    setD([230, 232, 236]);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, cardH, 3, 3, 'FD');

    // Score arc
    var arcCx = M + 22;
    var arcCy = y + cardH / 2;
    drawScoreArc(arcCx, arcCy, 11, score || 0, scoreColor, 3);

    // Score number inside arc — baseline offset ≈ 1/3 of font size in mm
    doc.setFontSize(14);
    setC(scoreColor);
    doc.text(String(score != null ? score : '--'), arcCx, arcCy + 1.8, { align: 'center' });

    // Grade + verdict
    var textX = M + 42;
    doc.setFontSize(22);
    setC(C.dark);
    doc.text(scoreGrade, textX, y + 14);
    var gradeW = doc.getTextWidth(scoreGrade);

    // Verdict badge
    setF(scoreColor);
    doc.roundedRect(textX + gradeW + 4, y + 6.5, 28, 8, 2, 2, 'F');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(scoreVerdict, textX + gradeW + 18, y + 12, { align: 'center' });

    // Quick stats in the card
    var statsX = M + CW * 0.45;
    var statsItems = [
      { label: 'Categories', value: String(catKeys.length) },
      { label: 'Issues', value: String(differences.length) },
      { label: 'High', value: String(sevCounts.high), color: C.red },
      { label: 'Medium', value: String(sevCounts.medium), color: C.amber },
      { label: 'Low', value: String(sevCounts.low), color: C.blue }
    ];
    var statGap = CW * 0.55 / statsItems.length;
    for (var si = 0; si < statsItems.length; si++) {
      var stX = statsX + si * statGap;
      doc.setFontSize(14);
      setC(statsItems[si].color || C.dark);
      doc.text(statsItems[si].value, stX + statGap / 2, y + 14, { align: 'center' });
      doc.setFontSize(6.5);
      setC(C.gray);
      doc.text(statsItems[si].label, stX + statGap / 2, y + 20, { align: 'center' });
    }

    y += cardH + 10;

    // ══════════════════════════════════════════════
    // CATEGORIES
    // ══════════════════════════════════════════════
    if (catKeys.length > 0) {
      sectionHeading('Category Breakdown', catKeys.length + ' categories');

      // Category table with visual score bars
      var catRows = [];
      catKeys.forEach(function (key) {
        var cat = categories[key];
        var cs = cat.score;
        var status = cs >= 90 ? 'Pass' : cs >= 70 ? 'Warning' : 'Fail';
        catRows.push([
          key.replace(/_/g, ' ').replace(/\b\w/g, function (l) { return l.toUpperCase(); }),
          String(cs),
          status,
          pdfSafe(cat.notes || '')
        ]);
      });

      doc.autoTable({
        startY: y,
        head: [['Category', 'Score', 'Status', 'Notes']],
        body: catRows,
        margin: { left: M, right: M },
        styles: { cellPadding: { top: 3, right: 3, bottom: 5, left: 3 }, fontSize: 8.5, lineColor: [235, 237, 240], lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: {
          fillColor: C.dark,
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 4
        },
        bodyStyles: { textColor: C.body },
        alternateRowStyles: { fillColor: C.bg },
        columnStyles: {
          0: { cellWidth: 40, fontStyle: 'bold', valign: 'middle' },
          1: { cellWidth: 18, halign: 'center', valign: 'middle', fontStyle: 'bold' },
          2: { cellWidth: 22, halign: 'center', valign: 'middle' },
          3: { cellWidth: 'auto' }
        },
        didParseCell: function (cellData) {
          if (cellData.section === 'body' && cellData.column.index === 1) {
            var s = parseInt(cellData.cell.raw, 10);
            cellData.cell.styles.textColor = s >= 90 ? C.teal : s >= 70 ? C.amber : C.red;
          }
          if (cellData.section === 'body' && cellData.column.index === 2) {
            var val = cellData.cell.raw;
            cellData.cell.styles.textColor = val === 'Pass' ? C.teal : val === 'Warning' ? C.amber : C.red;
            cellData.cell.styles.fontStyle = 'bold';
          }
        },
        didDrawCell: function (cellData) {
          // Draw mini score bar in the Score column, just below centered text
          if (cellData.section === 'body' && cellData.column.index === 1) {
            var cs = parseInt(cellData.cell.raw, 10);
            var barW = cellData.cell.width - 4;
            var barH = 1.5;
            var barX = cellData.cell.x + 2;
            var barY = cellData.cell.y + cellData.cell.height / 2 + 4;
            // Background
            doc.setFillColor(230, 232, 236);
            doc.rect(barX, barY, barW, barH, 'F');
            // Fill
            var barColor = cs >= 90 ? C.teal : cs >= 70 ? C.amber : C.red;
            doc.setFillColor(barColor[0], barColor[1], barColor[2]);
            doc.rect(barX, barY, barW * (cs / 100), barH, 'F');
          }
        }
      });

      y = doc.lastAutoTable.finalY + 12;
    }

    // ══════════════════════════════════════════════
    // ISSUES
    // ══════════════════════════════════════════════
    if (differences.length > 0) {
      sectionHeading('Issues Found', differences.length + ' total');

      // Severity summary strip
      checkPage(14);
      setF(C.bg);
      doc.roundedRect(M, y, CW, 11, 2, 2, 'F');
      var sx = M + 6;
      var sevItems = [
        { count: sevCounts.high, label: 'Critical / High', color: C.red },
        { count: sevCounts.medium, label: 'Medium', color: C.amber },
        { count: sevCounts.low, label: 'Low', color: C.blue }
      ];
      for (var sv = 0; sv < sevItems.length; sv++) {
        if (sevItems[sv].count > 0) {
          setF(sevItems[sv].color);
          doc.roundedRect(sx, y + 2.5, 14, 6, 1.5, 1.5, 'F');
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
          doc.text(String(sevItems[sv].count), sx + 7, y + 6.5, { align: 'center' });
          doc.setFontSize(7.5);
          setC(sevItems[sv].color);
          doc.text(sevItems[sv].label, sx + 17, y + 6.8);
          sx += 17 + doc.getTextWidth(sevItems[sv].label) + 10;
        }
      }
      y += 16;

      // Issues table
      var issueRows = [];
      for (var ii = 0; ii < differences.length; ii++) {
        var diff = differences[ii];
        var sev = (diff.severity || 'low');
        var desc = diff.description || '';
        if (diff.wcag_criterion) desc += '  [WCAG ' + diff.wcag_criterion + ']';
        issueRows.push([
          String(ii + 1),
          sev.charAt(0).toUpperCase() + sev.slice(1),
          diff.category ? diff.category.replace(/_/g, ' ').replace(/\b\w/g, function (l) { return l.toUpperCase(); }) : '',
          pdfSafe(desc)
        ]);
      }

      doc.autoTable({
        startY: y,
        head: [['#', 'Severity', 'Category', 'Description']],
        body: issueRows,
        margin: { left: M, right: M },
        styles: { cellPadding: { top: 3, right: 3, bottom: 5, left: 3 }, fontSize: 8, lineColor: [235, 237, 240], lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: { fillColor: C.dark, textColor: 255, fontStyle: 'bold', fontSize: 7.5, cellPadding: 4 },
        bodyStyles: { textColor: C.body },
        alternateRowStyles: { fillColor: C.bg },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center', valign: 'middle', fontStyle: 'bold' },
          1: { cellWidth: 20, halign: 'center', valign: 'middle', fontStyle: 'bold' },
          2: { cellWidth: 30, valign: 'middle' },
          3: { cellWidth: 'auto' }
        },
        didDrawCell: function (cellData) {
          // Color indicator dot below severity text, centered
          if (cellData.section === 'body' && cellData.column.index === 1) {
            var sevText = (cellData.cell.raw || '').toLowerCase();
            var dotColor = sevText === 'high' ? C.red : sevText === 'medium' ? C.amber : C.blue;
            doc.setFillColor(dotColor[0], dotColor[1], dotColor[2]);
            var dotX = cellData.cell.x + cellData.cell.width / 2;
            // Position dot just below the vertically-centered text
            var textY = cellData.cell.y + cellData.cell.height / 2;
            var dotY = textY + 4;
            doc.circle(dotX, dotY, 1.5, 'F');
          }
        },
        didParseCell: function (cellData) {
          if (cellData.section === 'body' && cellData.column.index === 1) {
            var sev = (cellData.cell.raw || '').toLowerCase();
            cellData.cell.styles.textColor = sev === 'high' ? C.red : sev === 'medium' ? C.amber : C.blue;
          }
        }
      });

      y = doc.lastAutoTable.finalY + 12;
    }

    // ══════════════════════════════════════════════
    // RECOMMENDATIONS
    // ══════════════════════════════════════════════
    if (recommendations.length > 0) {
      sectionHeading('Recommendations', recommendations.length + ' items');

      for (var ri = 0; ri < recommendations.length; ri++) {
        checkPage(18);

        // Card-like row
        setF(ri % 2 === 0 ? C.bg : C.white);
        var recLines = doc.splitTextToSize(pdfSafe(recommendations[ri]), CW - 16);
        var recH = recLines.length * 4 + 7;
        doc.roundedRect(M, y, CW, recH, 1.5, 1.5, 'F');

        // Number badge
        setF(C.teal);
        doc.roundedRect(M + 3, y + 3, 8, 6, 1.5, 1.5, 'F');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text(String(ri + 1), M + 7, y + 7, { align: 'center' });

        // Text
        doc.setFontSize(8.5);
        setC(C.body);
        doc.text(recLines, M + 14, y + 7);

        y += recH + 3;
      }
      y += 6;
    }

    // ══════════════════════════════════════════════
    // METHODOLOGY / STANDARDS (accessibility)
    // ══════════════════════════════════════════════
    if (currentTestType === 'accessibility') {
      sectionHeading('Methodology & Standards');
      checkPage(40);

      setF(C.bg);
      doc.roundedRect(M, y, CW, 34, 2, 2, 'F');

      // Left column: Testing methodology
      doc.setFontSize(8);
      setC(C.dark);
      doc.text('Testing Methodology', M + 6, y + 7);
      doc.setFontSize(7.5);
      setC(C.body);
      var methodLines = [
        'Automated screenshot capture of the target URL',
        'AI-powered visual analysis using Claude Vision',
        'Pattern matching against WCAG 2.1 Level AA criteria',
        'Severity classification based on user impact'
      ];
      for (var mi = 0; mi < methodLines.length; mi++) {
        setF(C.teal);
        doc.circle(M + 9, y + 13 + mi * 5, 0.8, 'F');
        doc.setFontSize(7.5);
        setC(C.body);
        doc.text(methodLines[mi], M + 13, y + 14 + mi * 5);
      }

      // Right column: Standards reference
      var refX = M + CW * 0.55;
      doc.setFontSize(8);
      setC(C.dark);
      doc.text('Standards Reference', refX, y + 7);
      var refs = [
        'WCAG 2.1 Level AA  —  w3.org/TR/WCAG21/',
        'Understanding WCAG  —  w3.org/WAI/WCAG21/Understanding/',
        'Quick Reference  —  w3.org/WAI/WCAG21/quickref/',
        'WAI-ARIA 1.1  —  w3.org/TR/wai-aria-1.1/'
      ];
      for (var ri2 = 0; ri2 < refs.length; ri2++) {
        setF(C.teal);
        doc.circle(refX + 3, y + 13 + ri2 * 5, 0.8, 'F');
        doc.setFontSize(7);
        setC(C.bodyLight);
        doc.text(refs[ri2], refX + 7, y + 14 + ri2 * 5);
      }

      y += 40;
    }

    // ══════════════════════════════════════════════
    // DISCLAIMER
    // ══════════════════════════════════════════════
    checkPage(22);
    doc.setFontSize(7);
    setC(C.grayLight);
    var discText = 'This report was generated by QAProof automated testing. Results are based on AI-powered visual analysis and may not capture all issues. ' +
      'Manual testing by accessibility experts is recommended for comprehensive compliance verification. This report does not constitute legal advice regarding ' +
      (currentTestType === 'accessibility' ? 'ADA, Section 508, or EN 301 549 compliance.' : 'regulatory compliance.');
    var discLines = doc.splitTextToSize(discText, CW);
    doc.text(discLines, M, y);
    y += discLines.length * 3.5 + 4;

    // ══════════════════════════════════════════════
    // SEAL + FOOTERS
    // ══════════════════════════════════════════════
    var tp = doc.internal.getNumberOfPages();

    // Draw seal on last page — use pre-rendered QAProof SVG stamp
    doc.setPage(tp);
    var sealSize = 42; // mm — size of seal in PDF
    var sealX = W - M - sealSize / 2 - 2;
    var sealY = H - 28 - sealSize / 2;

    if (cachedSealPng) {
      doc.addImage(cachedSealPng, 'PNG', sealX - sealSize / 2, sealY - sealSize / 2, sealSize, sealSize);
    } else {
      // Fallback: simple text seal if pre-render didn't complete
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      setC(C.teal);
      doc.text('QAPROOF VERIFIED', sealX, sealY, { align: 'center' });
    }

    // ── Score below seal ──
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    setC(C.tealDark);
    doc.text('Score: ' + (score != null ? score + '/100' : 'N/A'), sealX, sealY + sealSize / 2 + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setLineWidth(0.2);

    // Add footers to all pages
    for (var fp = 1; fp <= tp; fp++) {
      doc.setPage(fp);
      addFooter();
    }

    // Download
    var filename = 'qaproof-' + currentTestType + '-report-' + now.toISOString().slice(0, 10) + '.pdf';
    doc.save(filename);
  }

  // ============================
  // Utilities
  // ============================
  function getScoreClass(score) {
    if (score == null) return '';
    if (score >= 90) return 'score-high';
    if (score >= 70) return 'score-medium';
    return 'score-low';
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function truncate(str, maxLen) {
    if (!str || str.length <= maxLen) return str || '';
    return str.substring(0, maxLen) + '...';
  }

  function showError(msg) {
    if (errorMessage) errorMessage.textContent = msg;
    if (errorDiv) errorDiv.classList.remove('hidden');
  }

  function showErrorHtml(msg) {
    if (errorMessage) errorMessage.innerHTML = msg;
    if (errorDiv) errorDiv.classList.remove('hidden');
  }

  function waitForImage(img) {
    return new Promise(function (resolve) {
      if (img.complete && img.naturalHeight > 0) {
        resolve();
      } else {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }
    });
  }

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
        .then(safeJson)
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
      var scoreClass = score != null ? getScoreClass(score) : '';
      var typeBadgeClass = 'qaproof-badge-' + (item.test_type || 'fidelity');
      var typeLabels = { fidelity: 'Fidelity', responsive: 'Responsive', accessibility: 'Accessibility', regression: 'Regression', 'design-audit': 'Design Audit' };
      var dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      var urlDisplay = item.page_url || '';
      if (urlDisplay.length > 50) urlDisplay = urlDisplay.substring(0, 50) + '...';

      row.innerHTML =
        '<div class="qaproof-history-date">' + escapeHtml(dateStr) + '</div>' +
        '<div class="qaproof-history-type"><span class="qaproof-badge ' + typeBadgeClass + '">' + escapeHtml(typeLabels[item.test_type] || item.test_type) + '</span></div>' +
        '<div class="qaproof-history-url" title="' + escapeAttr(item.page_url || '') + '">' + escapeHtml(urlDisplay) + '</div>' +
        '<div class="qaproof-history-score ' + scoreClass + '">' + (score != null ? score : '\u2014') + '</div>' +
        '<div class="qaproof-history-actions">' +
        '  <button type="button" class="button button-small qaproof-history-view" data-id="' + item.id + '" title="View report">' +
        '    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
        '    View' +
        '  </button>' +
        '  <button type="button" class="button button-small qaproof-history-download" data-id="' + item.id + '" title="Download PDF report">' +
        '    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        '  </button>' +
        '  <button type="button" class="button button-small qaproof-history-delete" data-id="' + item.id + '" title="Delete">' +
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
        if (!confirm('Delete this test result?')) return;
        deleteItem(item.id, row);
      });

      return row;
    }

    function parseResultData(item) {
      return {
        testType: item.test_type,
        score: item.score != null ? parseInt(item.score, 10) : null,
        summary: item.summary || '',
        categories: item.categories_json ? (typeof item.categories_json === 'string' ? JSON.parse(item.categories_json) : item.categories_json) : {},
        differences: item.differences_json ? (typeof item.differences_json === 'string' ? JSON.parse(item.differences_json) : item.differences_json) : [],
        recommendations: item.recommendations_json ? (typeof item.recommendations_json === 'string' ? JSON.parse(item.recommendations_json) : item.recommendations_json) : [],
        screenshots: item.screenshots_json ? (typeof item.screenshots_json === 'string' ? JSON.parse(item.screenshots_json) : item.screenshots_json) : {},
        pageUrl: item.page_url
      };
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
      if (rText) rText.textContent = 'Loading test result...';
      if (rContainer) rContainer.classList.add('hidden');

      fetch(qaproof.restBase.replace(/\/+$/, '') + '/test-history/' + id, {
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin'
      })
        .then(safeJson)
        .then(function (resp) {
          if (rLoading) rLoading.classList.add('hidden');
          if (!resp.success || !resp.data) {
            if (cfg.showError) cfg.showError('Could not load test result.');
            return;
          }

          var resultData = parseResultData(resp.data);

          // Use page-specific render callback if provided
          if (cfg.renderResult) {
            cfg.renderResult(resultData);
          } else {
            // Fallback: use global render functions (Tests page)
            if (resultData.testType === 'responsive') {
              renderResponsiveResults(resultData);
            } else if (resultData.testType === 'accessibility') {
              renderAccessibilityResults(resultData);
            } else if (resultData.testType === 'design-audit') {
              renderDesignAuditResults(resultData);
            } else {
              renderFidelityResults(resultData);
            }
          }

          // Scroll to results
          if (rContainer) {
            scrollToElement(rContainer);
          }
        })
        .catch(function () {
          if (rLoading) rLoading.classList.add('hidden');
          if (cfg.showError) cfg.showError('Failed to load test result.');
        });
    }

    function deleteItem(id, rowEl) {
      fetch(qaproof.restBase.replace(/\/+$/, '') + '/test-history/' + id, {
        method: 'DELETE',
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin'
      })
        .then(safeJson)
        .then(function (resp) {
          if (resp.success) {
            rowEl.style.transition = 'opacity 0.3s, transform 0.3s';
            rowEl.style.opacity = '0';
            rowEl.style.transform = 'translateX(20px)';
            setTimeout(function () { rowEl.remove(); }, 300);
            total--;
            offset--;
            if (list.children.length === 0) {
              empty.classList.remove('hidden');
            }
          }
        })
        .catch(function () {});
    }

    function downloadItemPdf(id) {
      fetch(qaproof.restBase.replace(/\/+$/, '') + '/test-history/' + id, {
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin'
      })
        .then(safeJson)
        .then(function (resp) {
          if (resp.success && resp.data) {
            var resultData = parseResultData(resp.data);
            generatePdfReport(resultData);
          }
        })
        .catch(function () {
          alert('Failed to download report.');
        });
    }

    return { init: init, load: load };
  }

  // ---- Tests Page History Instance ----
  var testsHistoryMgr = createHistoryManager({
    sectionId:    'qaproof-history-section',
    contentId:    'qaproof-history-content',
    toggleId:     'qaproof-history-toggle',
    listId:       'qaproof-history-list',
    loadingId:    'qaproof-history-loading',
    emptyId:      'qaproof-history-empty',
    loadMoreId:   'qaproof-history-load-more',
    filtersId:    'qaproof-history-filters',
    defaultType:  '',
    excludeType:  'accessibility',
    perPage:      10,
    resultLoadingEl:     loading,
    resultLoadingTextEl: loadingText,
    resultContainerEl:   resultsContainer,
    renderResult: null, // uses fallback global render functions
    showError:    showError,
    onBeforeView: function () {
      if (typeof testsPageTabs !== 'undefined' && testsPageTabs) testsPageTabs.switchTo('test');
      // Hide the form card so only the report shows
      var formCard = document.querySelector('#qaproof-tab-test > .qaproof-card');
      if (formCard) formCard.style.display = 'none';
      // Mark that we came from history
      var app = document.getElementById('qaproof-app');
      if (app) app.setAttribute('data-back-tab', 'history');
    },
  });
  if (testsHistoryMgr) testsHistoryMgr.init();
  // ============================
  // Accessibility Page Handler
  // ============================
  var a11yForm = document.getElementById('qaproof-a11y-form');
  if (a11yForm) {
    var a11ySubmitBtn = document.getElementById('qaproof-a11y-submit-btn');
    var a11yLoading = document.getElementById('qaproof-a11y-loading');
    var a11yLoadingText = document.getElementById('qaproof-a11y-loading-text');
    var a11yLoadingSubtext = document.getElementById('qaproof-a11y-loading-subtext');
    var a11yErrorDiv = document.getElementById('qaproof-a11y-error');
    var a11yErrorMsg = document.getElementById('qaproof-a11y-error-message');
    var a11yResults = document.getElementById('qaproof-a11y-results');

    a11yForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var pageUrl = document.getElementById('qaproof-a11y-url').value.trim();
      if (!pageUrl) return;

      // Show loading
      a11yLoading.classList.remove('hidden');
      a11yLoading.style.display = '';
      a11yErrorDiv.classList.add('hidden');
      a11yResults.classList.add('hidden');
      a11yResults.innerHTML = '';
      a11ySubmitBtn.disabled = true;

      // Loading steps
      var checkSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var a11yLoadingSteps = [
        { time: 0, text: 'Capturing page screenshot' },
        { time: 8000, text: 'Processing images' },
        { time: 20000, text: 'Running accessibility analysis' },
        { time: 50000, text: 'Evaluating WCAG compliance' },
        { time: 90000, text: 'Generating audit report' },
      ];

      var a11yStepsContainer = document.getElementById('qaproof-a11y-loading-steps');
      if (a11yStepsContainer) {
        a11yStepsContainer.innerHTML = '';
        for (var si = 0; si < a11yLoadingSteps.length; si++) {
          if (si > 0) {
            var connector = document.createElement('div');
            connector.className = 'qaproof-step-connector';
            connector.id = 'qaproof-a11y-connector-' + si;
            a11yStepsContainer.appendChild(connector);
          }
          var stepEl = document.createElement('div');
          stepEl.className = 'qaproof-loading-step' + (si === 0 ? ' active' : '');
          stepEl.id = 'qaproof-a11y-lstep-' + si;
          stepEl.innerHTML = '<span class="qaproof-step-indicator">' + (si + 1) + '</span>';
          a11yStepsContainer.appendChild(stepEl);
        }
      }

      var a11yTimers = a11yLoadingSteps.map(function (step, idx) {
        return setTimeout(function () {
          for (var j = 0; j < idx; j++) {
            var prev = document.getElementById('qaproof-a11y-lstep-' + j);
            if (prev) {
              prev.classList.remove('active');
              prev.classList.add('completed');
              var ind = prev.querySelector('.qaproof-step-indicator');
              if (ind) ind.innerHTML = checkSvg;
            }
            var conn = document.getElementById('qaproof-a11y-connector-' + (j + 1));
            if (conn) conn.classList.add('completed');
          }
          var curr = document.getElementById('qaproof-a11y-lstep-' + idx);
          if (curr) {
            curr.classList.add('active');
            curr.classList.remove('completed');
          }
          a11yLoadingText.textContent = step.text + '...';
          a11yLoadingSubtext.textContent = idx < a11yLoadingSteps.length - 1 ? 'This may take 1-3 minutes' : 'Almost done';
        }, step.time);
      });

      // Submit accessibility test via WP proxy → poll for results
      var a11yBody = {
        pageUrl: pageUrl,
        testType: 'accessibility',
        wcagLevel: qaproof.wcagLevel || 'AA'
      };

      // Save to localStorage BEFORE the API call so reload during submission can recover.
      // Carry forward retry count from recovery flow.
      var _a11yPendingRetries = window.__qaproofPendingRetries || 0;
      window.__qaproofPendingRetries = 0;
      saveActiveJob(null, 'accessibility', pageUrl, 'accessibility', 'submitting', _a11yPendingRetries);

      fetch(qaproof.restUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': qaproof.nonce,
        },
        body: JSON.stringify(a11yBody),
        credentials: 'same-origin',
      })
      .then(safeJson)
      .then(function (data) {
        if (!data.success || !data.data || !data.data.jobId) {
          throw new Error((data.error && data.error.message) || 'Failed to create accessibility test job.');
        }

        var jobId = data.data.jobId;
        console.log('[QAProof] A11y job created:', jobId);
        // Upgrade localStorage entry with real jobId and polling phase
        saveActiveJob(jobId, 'accessibility', pageUrl, 'accessibility', 'polling');

        startJobPolling(jobId, {
          page: 'accessibility',
          onPoll: function (status, elapsed) {
            console.log('[QAProof] A11y poll:', status, elapsed);
          },
          onDone: function (resultData) {
            a11yTimers.forEach(clearTimeout);
            resultsContainer = a11yResults;
            renderAccessibilityResults(resultData);

            a11yLoading.classList.add('hidden');
            a11ySubmitBtn.disabled = false;
          },
          onScreenshotsDone: function (resultData) {
            // Save result to WP history AFTER screenshots are fetched.
            // Strip base64 screenshots to avoid exceeding PHP post_max_size.
            var a11yHistoryData = Object.assign({}, resultData);
            delete a11yHistoryData.screenshots;
            var a11ySaveData = new FormData();
            a11ySaveData.append('action', 'qaproof_save_history');
            a11ySaveData.append('nonce', qaproof.ajaxNonce);
            a11ySaveData.append('testType', 'accessibility');
            a11ySaveData.append('pageUrl', pageUrl);
            a11ySaveData.append('result', JSON.stringify(a11yHistoryData));
            fetch(qaproof.ajaxUrl, {
              method: 'POST',
              body: a11ySaveData,
              credentials: 'same-origin',
            })
            .then(safeJson)
            .then(function (saveResp) {
              console.log('[QAProof] A11y history saved (with screenshots):', saveResp);
              if (a11yHistoryMgr) a11yHistoryMgr.load(true);
            })
            .catch(function (err) {
              console.error('[QAProof] Failed to save a11y history:', err.message);
              if (a11yHistoryMgr) a11yHistoryMgr.load(true);
            });
          },
          onFailed: function (errorMsg) {
            a11yTimers.forEach(clearTimeout);
            a11yErrorMsg.textContent = errorMsg;
            a11yErrorDiv.classList.remove('hidden');
            a11yLoading.classList.add('hidden');
            a11ySubmitBtn.disabled = false;
          },
        });
      })
      .catch(function (err) {
        a11yTimers.forEach(clearTimeout);
        // Keep localStorage entry so page reload can re-submit (unless rate-limited)
        if (err.message && err.message.indexOf('Rate limit') !== -1) {
          clearActiveJob('accessibility');
        }
        a11yErrorMsg.textContent = (err.message || 'Network error.') + ' Reload the page to retry.';
        a11yErrorDiv.classList.remove('hidden');
        a11yLoading.classList.add('hidden');
        a11ySubmitBtn.disabled = false;
      });
    });
  }

  // ---- Accessibility Page History Instance ----
  var a11yHistoryMgr = createHistoryManager({
    sectionId:    'qaproof-a11y-history-section',
    contentId:    'qaproof-a11y-history-content',
    toggleId:     'qaproof-a11y-history-toggle',
    listId:       'qaproof-a11y-history-list',
    loadingId:    'qaproof-a11y-history-loading',
    emptyId:      'qaproof-a11y-history-empty',
    loadMoreId:   'qaproof-a11y-history-load-more',
    filtersId:    null, // no filter tabs — always accessibility
    defaultType:  'accessibility',
    perPage:      10,
    resultLoadingEl:     document.getElementById('qaproof-a11y-loading'),
    resultLoadingTextEl: document.getElementById('qaproof-a11y-loading-text'),
    resultContainerEl:   document.getElementById('qaproof-a11y-results'),
    renderResult: function (resultData) {
      // Point resultsContainer to a11y results div so render functions write there
      resultsContainer = document.getElementById('qaproof-a11y-results');
      renderAccessibilityResults(resultData);
    },
    showError: function (msg) {
      var el = document.getElementById('qaproof-a11y-error-message');
      var wrap = document.getElementById('qaproof-a11y-error');
      if (el) el.textContent = msg;
      if (wrap) wrap.classList.remove('hidden');
    },
    onBeforeView: function () {
      if (typeof a11yPageTabs !== 'undefined' && a11yPageTabs) a11yPageTabs.switchTo('a11y-audit');
      // Hide the form card so only the report shows
      var formCard = document.querySelector('#qaproof-tab-a11y-audit > .qaproof-card');
      if (formCard) formCard.style.display = 'none';
      // Mark that we came from history
      var app = document.getElementById('qaproof-app');
      if (app) app.setAttribute('data-back-tab', 'a11y-history');
    },
  });
  if (a11yHistoryMgr) a11yHistoryMgr.init();

  // ============================
  // Page Tabs (Test | History) — Tests & Accessibility pages
  // ============================
  function initPageTabs(tabsContainerId, historyMgr) {
    var tabsContainer = document.getElementById(tabsContainerId);
    if (!tabsContainer) return null;

    var app = tabsContainer.closest('#qaproof-app');
    if (!app) return null;

    var tabs = tabsContainer.querySelectorAll('.qaproof-page-tab');
    var historyLoaded = false;

    function switchTo(targetTab) {
      tabs.forEach(function (t) {
        if (t.getAttribute('data-tab') === targetTab) {
          t.classList.add('active');
        } else {
          t.classList.remove('active');
        }
      });
      var panels = app.querySelectorAll('.qaproof-tab-panel');
      panels.forEach(function (panel) {
        if (panel.getAttribute('data-tab-panel') === targetTab) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
      if (targetTab.indexOf('history') !== -1 && !historyLoaded && historyMgr) {
        historyMgr.load(true);
        historyLoaded = true;
      }
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchTo(tab.getAttribute('data-tab'));
      });
    });

    return { switchTo: switchTo };
  }

  var testsPageTabs = initPageTabs('qaproof-page-tabs', testsHistoryMgr);
  var a11yPageTabs  = initPageTabs('qaproof-a11y-page-tabs', a11yHistoryMgr);

  // ============================
  // Back Button — return from results to form
  // ============================
  document.addEventListener('click', function (e) {
    var backBtn = e.target.closest('#qaproof-back-to-form');
    if (!backBtn) return;

    var app = backBtn.closest('#qaproof-app');
    if (!app) return;

    // Hide results
    var results = app.querySelectorAll('#qaproof-results, #qaproof-a11y-results');
    results.forEach(function (r) {
      r.classList.add('hidden');
      r.innerHTML = '';
    });

    // Check if we came from a history tab
    var backTab = app.getAttribute('data-back-tab');

    if (backTab) {
      // Restore the form card visibility first
      var testFormCard = app.querySelector('#qaproof-tab-test > .qaproof-card');
      var a11yFormCard = app.querySelector('#qaproof-tab-a11y-audit > .qaproof-card');
      if (testFormCard) testFormCard.style.display = '';
      if (a11yFormCard) a11yFormCard.style.display = '';

      // Navigate to the history tab we came from
      if (backTab === 'history' && typeof testsPageTabs !== 'undefined' && testsPageTabs) {
        testsPageTabs.switchTo('history');
      } else if (backTab === 'a11y-history' && typeof a11yPageTabs !== 'undefined' && a11yPageTabs) {
        a11yPageTabs.switchTo('a11y-history');
      }

      // Clear the attribute
      app.removeAttribute('data-back-tab');
    } else {
      // Normal back — show the test/audit tab with form
      var testPanel = app.querySelector('.qaproof-tab-panel[data-tab-panel="test"], .qaproof-tab-panel[data-tab-panel="a11y-audit"]');
      if (testPanel) {
        var panels = app.querySelectorAll('.qaproof-tab-panel');
        panels.forEach(function (p) { p.classList.remove('active'); });
        testPanel.classList.add('active');

        var pageTabs = app.querySelectorAll('.qaproof-page-tab');
        pageTabs.forEach(function (t) {
          if (t.getAttribute('data-tab') === testPanel.getAttribute('data-tab-panel')) {
            t.classList.add('active');
          } else {
            t.classList.remove('active');
          }
        });
      }

      // Show the form card(s) again
      var card = app.querySelector('.qaproof-card');
      if (card) card.style.display = '';
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ============================
  // Settings saved toast
  // ============================
  function showQaproofToast(message) {
    var app = document.getElementById('qaproof-app');
    if (!app) return;

    // Remove any existing toast
    var existing = app.querySelector('.qaproof-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'qaproof-toast';
    toast.innerHTML = '<span class="dashicons dashicons-yes-alt"></span> ' + message;
    app.prepend(toast);

    requestAnimationFrame(function () {
      toast.classList.add('qaproof-toast-visible');
    });

    setTimeout(function () {
      toast.classList.remove('qaproof-toast-visible');
      toast.addEventListener('transitionend', function () { toast.remove(); });
    }, 3000);
  }

  // Detect settings save via sessionStorage flag
  (function () {
    if (sessionStorage.getItem('qaproof_settings_saved')) {
      sessionStorage.removeItem('qaproof_settings_saved');
      // Hide default WP notice if any
      var wpNotice = document.querySelector('.notice-success, .updated');
      if (wpNotice) wpNotice.style.display = 'none';
      showQaproofToast('Settings saved successfully');
    }

    // Set flag before form submits
    var settingsForm = document.querySelector('#qaproof-app form[action="options.php"]');
    if (settingsForm) {
      settingsForm.addEventListener('submit', function () {
        sessionStorage.setItem('qaproof_settings_saved', '1');
      });
    }
  })();

  // ============================
  // Custom form validation (replace browser tooltips)
  // ============================
  (function () {
    var app = document.getElementById('qaproof-app');
    if (!app) return;

    // Disable native browser validation on all forms
    var forms = app.querySelectorAll('form');
    forms.forEach(function (f) { f.setAttribute('novalidate', ''); });

    // Show custom error under an input
    function showFieldError(input, message) {
      clearFieldError(input);
      var err = document.createElement('div');
      err.className = 'qaproof-field-error';
      err.textContent = message;
      input.classList.add('qaproof-input-invalid');
      input.parentNode.insertBefore(err, input.nextSibling);
    }

    // Remove custom error
    function clearFieldError(input) {
      input.classList.remove('qaproof-input-invalid');
      var next = input.nextElementSibling;
      if (next && next.classList.contains('qaproof-field-error')) {
        next.remove();
      }
    }

    // Build human-readable message
    function getValidationMessage(input) {
      var val = input.value.trim();
      var type = input.getAttribute('type') || 'text';
      var min = input.getAttribute('min');
      var max = input.getAttribute('max');

      if (input.hasAttribute('required') && !val) {
        return 'This field is required.';
      }
      if (type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        return 'Please enter a valid email address.';
      }
      if (type === 'url' && val && !/^https?:\/\/.+/i.test(val)) {
        return 'Please enter a valid URL starting with http:// or https://';
      }
      if (type === 'number' && val) {
        var num = parseFloat(val);
        if (isNaN(num)) return 'Please enter a valid number.';
        if (min !== null && num < parseFloat(min)) {
          return 'Value must be at least ' + min + '.';
        }
        if (max !== null && num > parseFloat(max)) {
          return 'Value must be no more than ' + max + '.';
        }
      }
      return '';
    }

    // Validate on submit
    app.addEventListener('submit', function (e) {
      var form = e.target.closest('form');
      if (!form) return;

      var inputs = form.querySelectorAll('input[required], input[type="number"], input[type="email"], input[type="url"]');
      var firstInvalid = null;

      inputs.forEach(function (input) {
        var msg = getValidationMessage(input);
        if (msg) {
          showFieldError(input, msg);
          if (!firstInvalid) firstInvalid = input;
        } else {
          clearFieldError(input);
        }
      });

      if (firstInvalid) {
        e.preventDefault();
        e.stopPropagation();
        firstInvalid.focus();
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, true);

    // Clear error on input change
    app.addEventListener('input', function (e) {
      var input = e.target;
      if (input.classList.contains('qaproof-input-invalid')) {
        var msg = getValidationMessage(input);
        if (!msg) {
          clearFieldError(input);
        } else {
          var next = input.nextElementSibling;
          if (next && next.classList.contains('qaproof-field-error')) {
            next.textContent = msg;
          }
        }
      }
    });
  })();

  // ============================
  // Custom select dropdowns
  // ============================
  (function () {
    var app = document.getElementById('qaproof-app');
    if (!app) return;

    function buildCustomSelect(nativeSelect) {

      var wrapper = document.createElement('div');
      wrapper.className = 'qaproof-select';

      var trigger = document.createElement('div');
      trigger.className = 'qaproof-select-trigger';
      trigger.setAttribute('tabindex', '0');

      var triggerText = document.createElement('span');
      triggerText.className = 'qaproof-select-text';

      var arrow = document.createElement('span');
      arrow.className = 'qaproof-select-arrow';
      arrow.innerHTML = '<span class="dashicons dashicons-arrow-down-alt2"></span>';

      trigger.appendChild(triggerText);
      trigger.appendChild(arrow);

      var dropdown = document.createElement('div');
      dropdown.className = 'qaproof-select-dropdown';

      function buildOptions() {
        dropdown.innerHTML = '';
        var options = nativeSelect.options;
        for (var i = 0; i < options.length; i++) {
          var item = document.createElement('div');
          item.className = 'qaproof-select-option';
          if (options[i].selected) item.classList.add('selected');
          item.dataset.value = options[i].value;
          item.textContent = options[i].text;
          dropdown.appendChild(item);
        }
        var selected = nativeSelect.options[nativeSelect.selectedIndex];
        triggerText.textContent = selected ? selected.text : '';
      }

      buildOptions();

      wrapper.appendChild(trigger);
      wrapper.appendChild(dropdown);

      nativeSelect.style.display = 'none';
      nativeSelect.parentNode.insertBefore(wrapper, nativeSelect.nextSibling);

      // Toggle dropdown
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = wrapper.classList.contains('open');
        closeAllSelects();
        if (!isOpen) wrapper.classList.add('open');
      });

      // Keyboard support
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger.click();
        } else if (e.key === 'Escape') {
          wrapper.classList.remove('open');
        }
      });

      // Select option
      dropdown.addEventListener('click', function (e) {
        var opt = e.target.closest('.qaproof-select-option');
        if (!opt) return;
        nativeSelect.value = opt.dataset.value;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        buildOptions();
        wrapper.classList.remove('open');
      });

      // Sync if native select changes programmatically
      nativeSelect.addEventListener('change', function () {
        buildOptions();
      });

      // Watch for dynamic option changes (e.g. saved designs populated by JS)
      var observer = new MutationObserver(function () {
        buildOptions();
      });
      observer.observe(nativeSelect, { childList: true, subtree: true, characterData: true });
    }

    function closeAllSelects() {
      app.querySelectorAll('.qaproof-select.open').forEach(function (s) {
        s.classList.remove('open');
      });
    }

    document.addEventListener('click', function () {
      closeAllSelects();
    });

    // Init all selects in #qaproof-app
    app.querySelectorAll('select').forEach(buildCustomSelect);
  })();

  // ============================
  // Job Recovery on Page Reload
  // ============================
  // Check for active jobs on the CURRENT page and resume polling.
  // Two phases:
  //   'submitting' — test was submitted but API hadn't responded yet (no jobId).
  //                  Re-submit the test automatically.
  //   'polling'    — jobId is known, resume polling for results.
  (function () {
    var isTestsPage = !!document.getElementById('qaproof-test-form');
    var isA11yPage = !!document.getElementById('qaproof-a11y-form');

    // Determine which page we're on and recover that page's job
    var currentPage = isA11yPage ? 'accessibility' : (isTestsPage ? 'tests' : null);
    if (!currentPage) return;

    var activeJob = getActiveJob(currentPage);
    if (!activeJob) return;

    // Phase 'submitting' — the API call was in-flight when the page was reloaded.
    // Re-submit the test by programmatically clicking the submit button.
    // Limit retries to 3 to prevent infinite re-submission loops.
    if (activeJob.phase === 'submitting') {
      var retryCount = activeJob.retries || 0;
      if (retryCount >= 3) {
        console.warn('[QAProof] Max retries reached (' + retryCount + ') — giving up on', activeJob.testType);
        clearActiveJob(currentPage);
        if (currentPage === 'tests') {
          showError('Test submission failed after multiple retries. Please try again.');
        } else if (currentPage === 'accessibility') {
          var a11yErrDivR = document.getElementById('qaproof-a11y-error');
          var a11yErrMsgR = document.getElementById('qaproof-a11y-error-message');
          if (a11yErrMsgR) a11yErrMsgR.textContent = 'Test submission failed after multiple retries. Please try again.';
          if (a11yErrDivR) a11yErrDivR.classList.remove('hidden');
        }
        return;
      }

      console.log('[QAProof] Recovering submitting job — re-submitting (retry ' + (retryCount + 1) + '/3)', activeJob.testType, 'on', currentPage);
      // Save incremented retry count BEFORE clearing, so the new submission carries it forward
      var pendingRetries = retryCount + 1;
      clearActiveJob(currentPage);

      // Stash retry count so the form submit handler can pick it up
      window.__qaproofPendingRetries = pendingRetries;

      if (currentPage === 'tests') {
        // Pre-fill the URL if it differs
        var urlInput = document.getElementById('qaproof-page-url');
        if (urlInput && activeJob.pageUrl) urlInput.value = activeJob.pageUrl;
        // Click the submit button to re-run the test
        if (submitBtn) submitBtn.click();
      } else if (currentPage === 'accessibility') {
        var a11yUrlInput = document.getElementById('qaproof-a11y-url');
        if (a11yUrlInput && activeJob.pageUrl) a11yUrlInput.value = activeJob.pageUrl;
        var a11ySubmit = document.getElementById('qaproof-a11y-submit-btn');
        if (a11ySubmit) a11ySubmit.click();
      }
      return;
    }

    // Phase 'polling' (or legacy entries without phase) — jobId is known, resume polling
    console.log('[QAProof] Recovering active job:', activeJob.jobId, activeJob.testType, 'on', currentPage);

    // Show loading state
    if (currentPage === 'tests' && loading) {
      testsPageBusy = true;
      loading.classList.remove('hidden');
      if (submitBtn) submitBtn.disabled = true;
      if (loadingText) loadingText.textContent = 'Resuming test — waiting for results...';
      if (loadingSubtext) loadingSubtext.textContent = 'Test is still running on the server';
      // Hide step indicators if present
      var stepsEl = document.getElementById('qaproof-loading-steps');
      if (stepsEl) stepsEl.style.display = 'none';

      startJobPolling(activeJob.jobId, {
        page: 'tests',
        onPoll: function (status, elapsed) {
          if (loadingSubtext) loadingSubtext.textContent = 'Status: ' + status + ' (' + elapsed + ')';
        },
        onDone: function (resultData) {
          if (resultData.testType === 'responsive') {
            renderResponsiveResults(resultData);
          } else if (resultData.testType === 'accessibility') {
            renderAccessibilityResults(resultData);
          } else if (resultData.testType === 'design-audit') {
            renderDesignAuditResults(resultData);
          } else {
            renderFidelityResults(resultData);
          }

          loading.classList.add('hidden');
          if (submitBtn) submitBtn.disabled = false;
          testsPageBusy = false;
        },
        onScreenshotsDone: function (resultData) {
          // Save to history AFTER screenshots are fetched.
          // Strip base64 screenshots to avoid exceeding PHP post_max_size.
          var historyData = Object.assign({}, resultData);
          delete historyData.screenshots;
          var saveData = new FormData();
          saveData.append('action', 'qaproof_save_history');
          saveData.append('nonce', qaproof.ajaxNonce);
          saveData.append('testType', activeJob.testType);
          saveData.append('pageUrl', activeJob.pageUrl);
          saveData.append('result', JSON.stringify(historyData));
          fetch(qaproof.ajaxUrl, { method: 'POST', body: saveData, credentials: 'same-origin' })
            .then(safeJson)
            .then(function () { if (testsHistoryMgr) testsHistoryMgr.load(true); })
            .catch(function () { if (testsHistoryMgr) testsHistoryMgr.load(true); });
        },
        onFailed: function (errorMsg) {
          showError(escapeHtml(errorMsg));
          loading.classList.add('hidden');
          if (submitBtn) submitBtn.disabled = false;
          testsPageBusy = false;
        },
      });
    } else if (currentPage === 'accessibility') {
      var a11yLoad = document.getElementById('qaproof-a11y-loading');
      var a11yBtn = document.getElementById('qaproof-a11y-submit');
      var a11yLoadText = document.getElementById('qaproof-a11y-loading-text');
      var a11yLoadSub = document.getElementById('qaproof-a11y-loading-subtext');
      var a11yErrDiv = document.getElementById('qaproof-a11y-error');
      var a11yErrMsg = document.getElementById('qaproof-a11y-error-message');
      var a11yRes = document.getElementById('qaproof-a11y-results');

      if (a11yLoad) a11yLoad.classList.remove('hidden');
      if (a11yBtn) a11yBtn.disabled = true;
      if (a11yLoadText) a11yLoadText.textContent = 'Resuming accessibility test — waiting for results...';
      if (a11yLoadSub) a11yLoadSub.textContent = 'Test is still running on the server';

      startJobPolling(activeJob.jobId, {
        page: 'accessibility',
        onPoll: function (status, elapsed) {
          if (a11yLoadSub) a11yLoadSub.textContent = 'Status: ' + status + ' (' + elapsed + ')';
        },
        onDone: function (resultData) {
          resultsContainer = a11yRes;
          renderAccessibilityResults(resultData);

          if (a11yLoad) a11yLoad.classList.add('hidden');
          if (a11yBtn) a11yBtn.disabled = false;
        },
        onScreenshotsDone: function (resultData) {
          // Strip base64 screenshots to avoid exceeding PHP post_max_size.
          var historyData = Object.assign({}, resultData);
          delete historyData.screenshots;
          var saveData = new FormData();
          saveData.append('action', 'qaproof_save_history');
          saveData.append('nonce', qaproof.ajaxNonce);
          saveData.append('testType', 'accessibility');
          saveData.append('pageUrl', activeJob.pageUrl);
          saveData.append('result', JSON.stringify(historyData));
          fetch(qaproof.ajaxUrl, { method: 'POST', body: saveData, credentials: 'same-origin' })
            .then(safeJson)
            .then(function () { if (a11yHistoryMgr) a11yHistoryMgr.load(true); })
            .catch(function () { if (a11yHistoryMgr) a11yHistoryMgr.load(true); });
        },
        onFailed: function (errorMsg) {
          if (a11yErrMsg) a11yErrMsg.textContent = errorMsg;
          if (a11yErrDiv) a11yErrDiv.classList.remove('hidden');
          if (a11yLoad) a11yLoad.classList.add('hidden');
          if (a11yBtn) a11yBtn.disabled = false;
        },
      });
    }
  })();
})();
