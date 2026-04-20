/* global qaproof */
(function () {
  'use strict';
  var Q = window.QAProof;
  var S = Q.state;

  // ============================
  // Connection Test (Settings Page)
  // ============================
  if (S.connectionBtn) {
    S.connectionBtn.addEventListener('click', function () {
      S.connectionStatus.textContent = (qaproof.i18n.apiTesting || 'Testing...');
      S.connectionStatus.className = '';

      var data = new FormData();
      data.append('action', 'qaproof_health_check');
      data.append('nonce', qaproof.ajaxNonce);

      fetch(qaproof.ajaxUrl, {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
      })
        .then(Q.safeJson)
        .then(function (resp) {
          if (resp.success) {
            S.connectionStatus.textContent = (qaproof.i18n.apiConnected || 'Connected! API status: ') + (resp.data.status || 'ok');
            S.connectionStatus.className = 'success';
          } else {
            S.connectionStatus.textContent = (qaproof.i18n.apiFailed || 'Failed: ') + (resp.data && resp.data.message ? resp.data.message : 'Unknown error');
            S.connectionStatus.className = 'error';
          }
        })
        .catch(function () {
          S.connectionStatus.textContent = (qaproof.i18n.apiNetworkError || 'Network error — could not reach API.');
          S.connectionStatus.className = 'error';
        });
    });
  }

  // ============================
  // Account Info Panel (Settings Page)
  // ============================
  (function () {
    var accountInfo    = document.getElementById('qaproof-account-info');
    var accountLoading = document.getElementById('qaproof-account-info-loading');
    var accountBody    = document.getElementById('qaproof-account-info-body');
    var accountError   = document.getElementById('qaproof-account-info-error');
    var emailEl        = document.getElementById('qaproof-account-email');
    var planBadgeEl    = document.getElementById('qaproof-account-plan-badge');
    var genTextEl      = document.getElementById('qaproof-account-gen-text');
    var genBarEl       = document.getElementById('qaproof-account-gen-bar');
    var genRemEl       = document.getElementById('qaproof-account-gen-remaining');
    var monitorsEl     = document.getElementById('qaproof-account-monitors');
    var historyEl      = document.getElementById('qaproof-account-history');

    if (!accountInfo) return; // only runs on Settings page

    function planLabel(plan) {
      var labels = { free: 'Free', starter: 'Starter', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' };
      return labels[plan] || (plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Free');
    }

    function planColor(plan) {
      var p = (plan || '').toLowerCase();
      if (p === 'pro' || p === 'business' || p === 'enterprise') return '#00ADB5';
      if (p === 'starter') return '#f59e0b';
      return '#9CA3AF'; // free
    }

    function renderAccount(data) {
      if (!data) return;
      var user = data.user || {};
      var ws   = data.workspace || {};
      var gen  = ws.aiGenerations || {};
      var used = gen.used || 0;
      var limit = gen.limit || 0;
      var remaining = gen.remaining !== undefined ? gen.remaining : Math.max(0, limit - used);
      var pct  = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;

      if (emailEl) emailEl.textContent = user.email || '';
      if (planBadgeEl) {
        var plan = ws.plan || 'free';
        planBadgeEl.textContent = planLabel(plan);
        planBadgeEl.style.background = planColor(plan);
      }
      if (genTextEl) genTextEl.textContent = used + ' / ' + limit;
      if (genBarEl) {
        genBarEl.style.width = pct + '%';
        genBarEl.style.background = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#00ADB5';
      }
      if (genRemEl) {
        genRemEl.textContent = remaining + ' remaining this billing period';
      }
      if (monitorsEl) monitorsEl.textContent = (ws.monitors && ws.monitors.limit ? ws.monitors.limit : 1) + ' monitors';
      if (historyEl)  historyEl.textContent  = (ws.historyRetentionDays || 7) + ' days history';

      if (accountLoading) accountLoading.style.display = 'none';
      if (accountError)   accountError.style.display   = 'none';
      if (accountBody)    accountBody.style.display     = '';
    }

    function showAccountError(msg) {
      if (accountLoading) accountLoading.style.display = 'none';
      if (accountBody)    accountBody.style.display    = 'none';
      if (accountError) {
        accountError.textContent = msg;
        accountError.style.display = '';
      }
    }

    function fetchAccountInfo() {
      var keyInput = document.getElementById('qaproof_api_key');
      var key = keyInput ? keyInput.value.trim() : '';
      if (!key) return; // no key — keep panel hidden

      accountInfo.style.display  = '';
      if (accountLoading) accountLoading.style.display = '';
      if (accountBody)    accountBody.style.display    = 'none';
      if (accountError)   accountError.style.display   = 'none';

      var data = new FormData();
      data.append('action', 'qaproof_fetch_account_info');
      data.append('nonce', qaproof.ajaxNonce);

      fetch(qaproof.ajaxUrl, {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
      })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
          if (resp.success) {
            renderAccount(resp.data);
          } else {
            showAccountError((resp.data && resp.data.message) || 'Failed to load account info.');
          }
        })
        .catch(function () {
          showAccountError('Network error — could not load account info.');
        });
    }

    // Auto-load if there's already a key saved
    if (qaproof.hasApiKey) {
      fetchAccountInfo();
    }

    // Refresh after "Test Connection" succeeds
    if (S.connectionBtn) {
      S.connectionBtn.addEventListener('click', function () {
        // Small delay to let the health check fire first, then reload account info
        setTimeout(fetchAccountInfo, 500);
      });
    }

    // Also refresh after settings form is submitted (page reloads — pick up on next load)
    // and when the API key input changes (validate + refresh after 1.5s debounce)
    var accountDebounce = null;
    var keyInput = document.getElementById('qaproof_api_key');
    if (keyInput) {
      keyInput.addEventListener('input', function () {
        clearTimeout(accountDebounce);
        accountInfo.style.display = 'none'; // hide while typing
        var val = keyInput.value.trim();
        if (!val) return;
        accountDebounce = setTimeout(function () {
          fetchAccountInfo();
        }, 1500);
      });
    }
  })();

  // ============================
  // Network Diagnostics (Settings page)
  // ============================
  var diagnoseBtn = document.getElementById('qaproof-diagnose-btn');
  var diagnoseOutput = document.getElementById('qaproof-diagnose-output');
  if (diagnoseBtn) {
    diagnoseBtn.addEventListener('click', function () {
      diagnoseBtn.disabled = true;
      diagnoseBtn.textContent = (qaproof.i18n.diagRunning || 'Running diagnostics...');
      diagnoseOutput.textContent = (qaproof.i18n.diagWait || 'Please wait (up to 60 seconds)...');
      diagnoseOutput.style.display = 'block';

      var data = new FormData();
      data.append('action', 'qaproof_diagnose');
      data.append('nonce', qaproof.ajaxNonce);

      fetch(qaproof.ajaxUrl, {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
      })
        .then(Q.safeJson)
        .then(function (resp) {
          diagnoseBtn.disabled = false;
          diagnoseBtn.textContent = (qaproof.i18n.diagRunBtn || 'Run Diagnostics');
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
            diagnoseOutput.textContent = (qaproof.i18n.diagError || 'Error: ') + ((resp.data && resp.data.message) || 'Unknown');
          }
        })
        .catch(function (err) {
          diagnoseBtn.disabled = false;
          diagnoseBtn.textContent = (qaproof.i18n.diagRunBtn || 'Run Diagnostics');
          diagnoseOutput.textContent = (qaproof.i18n.diagRequestFailed || 'Request failed: ') + err.message;
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
    // Accepts both old format (qap_<64hex>) and new format (qap_live_sk_<48hex>, qap_test_sk_<48hex>)
    var keyRegex  = /^qap_(?:[0-9a-f]{64}|(?:live|test)_sk_[0-9a-f]{48})$/i;

    var fadeEl = wrapper.querySelector('.qaproof-key-fade');
    function syncFade() {
      if (!fadeEl) return;
      var bg = getComputedStyle(keyInput).backgroundColor;
      fadeEl.style.background = 'linear-gradient(to right, transparent, ' + bg + ' 70%)';
    }
    syncFade();
    keyInput.addEventListener('focus', function () { setTimeout(syncFade, 50); });
    keyInput.addEventListener('blur', function () { setTimeout(syncFade, 50); });
    var themeBtn = document.getElementById('qaproof-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () { setTimeout(syncFade, 100); });
    }

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

    function validateKey() {
      var val = keyInput.value.trim();

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
            errorEl.textContent = (qaproof.i18n.apiKeyStartError || 'API key must start with "qap_"');
          } else {
            var hex = val.substring(4);
            if (hex.length !== 64) {
              errorEl.textContent = 'Key is ' + (4 + hex.length) + (qaproof.i18n.apiKeyLengthError || ' characters — expected 68 (qap_ + 64 hex chars)');
            } else {
              errorEl.textContent = (qaproof.i18n.apiKeyCharError || 'Key contains invalid characters — only 0-9 and a-f are allowed after "qap_"');
            }
          }
          errorEl.style.display = 'block';
        }
      }
    }

    keyInput.addEventListener('input', validateKey);
    keyInput.addEventListener('paste', function () { setTimeout(validateKey, 0); });

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
    var noMsg = designsList.querySelector('.qaproof-no-designs');
    if (noMsg) noMsg.style.display = rows.length > 0 ? 'none' : '';
  }

  function createDesignRow(data) {
    var row = document.createElement('div');
    row.className = 'qaproof-design-row';
    var designId = data.id || generateId();
    row.setAttribute('data-design-id', designId);
    row.innerHTML =
      '<div class="qaproof-design-row-fields">' +
        '<input type="text" placeholder="Design Name" value="' + (data.name || '') + '" data-field="name" class="regular-text" />' +
        '<input type="url" placeholder="Figma URL" value="' + (data.figmaUrl || '') + '" data-field="figmaUrl" class="regular-text" />' +
        '<div class="qaproof-token-field-wrap">' +
          '<input type="password" placeholder="Figma Token (figd_...)" value="' + (data.figmaToken || '') + '" data-field="figmaToken" class="regular-text" autocomplete="off" />' +
          '<button type="button" class="qaproof-token-toggle" title="Show / Hide token">' +
            '<svg class="qaproof-eye-icon qaproof-eye-off" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' +
            '<svg class="qaproof-eye-icon qaproof-eye-on" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
          '</button>' +
          '<span class="qaproof-token-fade"></span>' +
        '</div>' +
        '<input type="hidden" value="' + designId + '" data-field="id" />' +
      '</div>' +
      '<div class="qaproof-design-status qaproof-status-empty" data-status="empty" title="' + (qaproof.i18n.designNotCached || 'Not cached — open Tests page and click Save') + '">' +
        '<span class="qaproof-design-status-dot"></span>' +
        '<span class="qaproof-design-status-label">' + (qaproof.i18n.designNotCached || 'Not cached — open Tests page and click Save') + '</span>' +
      '</div>' +
      '<button type="button" class="button qaproof-design-remove" title="' + (qaproof.i18n.designRemove || 'Remove') + '">' +
        '<span class="dashicons dashicons-trash"></span>' +
      '</button>';
    row.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('input', syncDesignsToHidden);
    });
    row.querySelector('.qaproof-design-remove').addEventListener('click', function () {
      row.remove();
      syncDesignsToHidden();
    });
    // Token visibility toggle
    wireTokenToggle(row);
    return row;
  }

  function wireTokenToggle(container) {
    container.querySelectorAll('.qaproof-token-field-wrap').forEach(function (wrap) {
      var btn    = wrap.querySelector('.qaproof-token-toggle');
      var inp    = wrap.querySelector('input[data-field="figmaToken"]');
      var eyeOff = wrap.querySelector('.qaproof-eye-off');
      var eyeOn  = wrap.querySelector('.qaproof-eye-on');
      var fadeEl = wrap.querySelector('.qaproof-token-fade');
      if (!btn || !inp) return;

      // Sync fade gradient to input background (same as API Key)
      function syncFade() {
        if (!fadeEl) return;
        var bg = getComputedStyle(inp).backgroundColor;
        fadeEl.style.background = 'linear-gradient(to right, transparent, ' + bg + ' 70%)';
      }
      syncFade();
      inp.addEventListener('focus', function () { setTimeout(syncFade, 50); });
      inp.addEventListener('blur',  function () { setTimeout(syncFade, 50); });
      var themeBtn = document.getElementById('qaproof-theme-toggle');
      if (themeBtn) {
        themeBtn.addEventListener('click', function () { setTimeout(syncFade, 100); });
      }

      // Eye toggle
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var isPassword = inp.type === 'password';
        inp.type = isPassword ? 'text' : 'password';
        if (eyeOff && eyeOn) {
          eyeOff.style.display = isPassword ? 'none'  : 'block';
          eyeOn.style.display  = isPassword ? 'block' : 'none';
        }
      });
    });
  }

  if (addDesignBtn && designsList) {
    addDesignBtn.addEventListener('click', function () {
      var row = createDesignRow({});
      designsList.appendChild(row);
      syncDesignsToHidden();
      row.querySelector('input').focus();
    });

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
      wireTokenToggle(row);
    });

    // Live status updates from the Tests page (via localStorage `storage` event).
    // form.js writes `qaproof:design:<id>` with { state, count?, source? } while
    // saving/detecting, so the badge reflects progress even on another tab.
    function updateDesignStatus(designId, state, count, source) {
      if (!designId) return;
      var row = designsList.querySelector('.qaproof-design-row[data-design-id="' + designId + '"]');
      if (!row) return;
      var badge = row.querySelector('.qaproof-design-status');
      if (!badge) return;
      var labelEl = badge.querySelector('.qaproof-design-status-label');
      badge.classList.remove('qaproof-status-empty', 'qaproof-status-partial', 'qaproof-status-ready', 'qaproof-status-saving', 'qaproof-status-detecting', 'qaproof-status-error', 'qaproof-status-ratelimited');
      badge.classList.add('qaproof-status-' + state);
      badge.setAttribute('data-status', state);
      var label = '';
      switch (state) {
        case 'saving':    label = (qaproof.i18n.saveBtnSaving || 'Saving image…'); break;
        case 'detecting': label = (qaproof.i18n.saveBtnDetecting || 'Detecting elements…'); break;
        case 'ready':
          label = 'Ready · ' + (count || 0) + (qaproof.i18n.designElements || ' elements');
          if (source) label += ' (' + source + ')';
          break;
        case 'partial':     label = (qaproof.i18n.designPartial || 'Image cached · elements missing'); break;
        case 'error':       label = (qaproof.i18n.designDetectionFailed || 'Detection failed'); break;
        case 'ratelimited': label = (qaproof.i18n.designRateLimit || 'Figma rate limit — try again later'); break;
        default:            label = (qaproof.i18n.designNotCached || 'Not cached — open Tests page and click Save');
      }
      if (labelEl) labelEl.textContent = label;
      badge.setAttribute('title', label);
    }

    window.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf('qaproof:design:') !== 0) return;
      var designId = e.key.substring('qaproof:design:'.length);
      if (!e.newValue) return;
      try {
        var payload = JSON.parse(e.newValue);
        updateDesignStatus(designId, payload.state, payload.count, payload.source);
      } catch (err) { /* ignore malformed payload */ }
    });

    // Expose for same-tab updates (e.g. if Tests and Settings are rendered in the same admin page in future)
    window.qaproofUpdateDesignStatus = updateDesignStatus;

    // ------------------------------------------------------------------
    // Auto-cache saved designs on the Settings page
    // ------------------------------------------------------------------
    // When a design has a Figma URL + token but no cached image/elements
    // yet, run the fetch → save image → detect elements → save elements
    // pipeline automatically (sequentially, one design at a time) so the
    // user never has to open the Tests page to trigger it manually.
    function broadcastStatus(designId, state, count, source) {
      if (!designId) return;
      try {
        var payload = { state: state, ts: Date.now() };
        if (typeof count === 'number') payload.count = count;
        if (source) payload.source = source;
        localStorage.setItem('qaproof:design:' + designId, JSON.stringify(payload));
      } catch (err) { /* noop */ }
      updateDesignStatus(designId, state, count, source);
    }

    // Figma rate limits are scoped per file/workspace. We keep per-fileKey
    // state inside window.qaproof.figmaApiUsage.byFile[fileKey].rateLimit.
    function getFileEntry(fileKey) {
      var u = (window.qaproof && window.qaproof.figmaApiUsage) || {};
      var byFile = u.byFile || {};
      return byFile[fileKey] || null;
    }

    function isFileRateLimited(fileKey) {
      if (!fileKey) return 0;
      var entry = getFileEntry(fileKey);
      var retryAt = entry && entry.rateLimit ? parseInt(entry.rateLimit.retryAt || 0, 10) : 0;
      return (retryAt > 0 && retryAt > Date.now()) ? retryAt : 0;
    }

    // When a response comes back 429 with `retryAt` + `fileKey`, update
    // the per-file map so subsequent calls for THIS file short-circuit.
    function applyRateLimitFromResponse(json) {
      if (!json || !json.error) return 0;
      var code = json.error.code || '';
      var retryAt = parseInt(json.error.retryAt || 0, 10);
      var fileKey = json.error.fileKey || '';
      if (code !== 'FIGMA_RATE_LIMITED' || !fileKey || !(retryAt > 0 && retryAt > Date.now())) return 0;
      window.qaproof = window.qaproof || {};
      var u = window.qaproof.figmaApiUsage = window.qaproof.figmaApiUsage || { byFile: {} };
      u.byFile = u.byFile || {};
      u.byFile[fileKey] = u.byFile[fileKey] || { total: 0, byType: {} };
      u.byFile[fileKey].rateLimit = {
        retryAt: retryAt,
        observedAt: Date.now(),
        rawRetryAfter: String(json.error.rawRetryAfter || '')
      };
      // Trigger widget refresh.
      try {
        var w = document.getElementById('qaproof-figma-usage');
        if (w) w.dispatchEvent(new CustomEvent('qaproof:ratelimit', { detail: { retryAt: retryAt, fileKey: fileKey } }));
      } catch (e) { /* noop */ }
      return retryAt;
    }

    function extractFigmaFileKey(url) {
      if (!url) return '';
      var m = /figma\.com\/(?:design|file|proto|board)\/([A-Za-z0-9]+)/i.exec(url);
      return m ? m[1] : '';
    }

    function autoCacheDesign(row) {
      var designId = row.getAttribute('data-design-id');
      var figmaUrlInp   = row.querySelector('[data-field="figmaUrl"]');
      var figmaTokenInp = row.querySelector('[data-field="figmaToken"]');
      if (!designId || !figmaUrlInp || !figmaTokenInp) return Promise.resolve();
      var figmaUrl   = figmaUrlInp.value.trim();
      var figmaToken = figmaTokenInp.value.trim();
      if (!figmaUrl || !figmaToken) return Promise.resolve();

      var fileKey = extractFigmaFileKey(figmaUrl);

      // Pre-flight: if THIS file is rate-limited, do NOT hit the proxy.
      // Other designs (different fileKey) are unaffected.
      if (isFileRateLimited(fileKey)) {
        console.info('[QAProof] Auto-cache blocked: file', fileKey, 'is rate-limited');
        broadcastStatus(designId, 'ratelimited');
        return Promise.resolve();
      }

      broadcastStatus(designId, 'saving');

      return fetch(qaproof.restBase + '/figma-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce },
        body: JSON.stringify({ figmaUrl: figmaUrl, figmaToken: figmaToken }),
      })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        // 429 from the backend means Figma (or our cached retryAt) is blocking.
        if (applyRateLimitFromResponse(json)) {
          broadcastStatus(designId, 'ratelimited');
          return null;
        }
        if (!json || !json.success || !json.data || !json.data.imageBase64) {
          var code = json && json.error && json.error.code ? json.error.code : '';
          console.warn('[QAProof] Auto-cache: figma-preview failed for design ' + designId, code);
          broadcastStatus(designId, 'error');
          return null;
        }
        var imageData = json.data.imageBase64;
        return fetch(qaproof.restBase + '/save-design-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce },
          body: JSON.stringify({ designId: designId, imageBase64: imageData }),
        })
        .then(function (res) { return res.json(); })
        .then(function (saveJson) {
          if (!saveJson || !saveJson.success) {
            broadcastStatus(designId, 'error');
            return null;
          }
          return imageData;
        });
      })
      .then(function (imageData) {
        if (!imageData) return null;
        broadcastStatus(designId, 'detecting');
        return fetch(qaproof.restBase + '/detect-elements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce },
          // pixelPerfectOnly: require Figma API (pixel-perfect). If Figma API
          // fails (rate-limited, etc.), the API will NOT fall back to AI vision;
          // we'd rather keep the design uncached and retry later than save
          // inaccurate overlays.
          body: JSON.stringify({ figmaUrl: figmaUrl, figmaToken: figmaToken, pixelPerfectOnly: true }),
        })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (!json || !json.success || !json.data || !json.data.elements || !json.data.elements.length) {
            broadcastStatus(designId, 'partial');
            return null;
          }
          var source = json.data.source || '';
          // Defense-in-depth: even if the API ignored pixelPerfectOnly, reject
          // any non-Figma-API source so we never persist approximate overlays.
          if (source !== 'figma-api') {
            console.warn('[QAProof] Auto-cache: rejecting non-figma-api source', source);
            broadcastStatus(designId, 'partial');
            return null;
          }
          var elements = json.data.elements;
          return fetch(qaproof.restBase + '/save-design-elements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce },
            body: JSON.stringify({ designId: designId, elements: elements, source: source }),
          })
          .then(function (res) { return res.json(); })
          .then(function () {
            broadcastStatus(designId, 'ready', elements.length, source);
          });
        });
      })
      .catch(function (err) {
        console.warn('[QAProof] Auto-cache pipeline error for design ' + designId, err && err.message);
        broadcastStatus(designId, 'error');
      });
    }

    // Per-design cooldown so a failed auto-cache doesn't retry on every page
    // reload (which would burn Figma quota on already-exhausted accounts).
    var AUTO_CACHE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
    function lastAttemptKey(designId) { return 'qaproof:design:auto:' + designId; }
    function recentlyAttempted(designId) {
      try {
        var raw = localStorage.getItem(lastAttemptKey(designId));
        if (!raw) return false;
        var ts = parseInt(raw, 10);
        if (!ts) return false;
        return (Date.now() - ts) < AUTO_CACHE_COOLDOWN_MS;
      } catch (err) { return false; }
    }
    function markAttempt(designId) {
      try { localStorage.setItem(lastAttemptKey(designId), String(Date.now())); } catch (err) {}
    }

    function runAutoCacheQueue() {
      // Note: rate limits are per-fileKey now, so we don't do a global stop
      // here — the per-design pre-flight inside autoCacheDesign() skips each
      // rate-limited file individually while others continue.
      var rows = designsList.querySelectorAll('.qaproof-design-row[data-design-id]');
      var queue = [];
      rows.forEach(function (row) {
        var badge = row.querySelector('.qaproof-design-status');
        if (!badge) return;
        var state = badge.getAttribute('data-status');
        // Only auto-cache fresh designs that have NO image yet.
        // 'partial' (image cached, elements missing) is NOT auto-retried because
        // it still triggers a Figma `/v1/files/.../nodes` call on every reload,
        // silently burning quota. User must manually click "Detect Elements"
        // on the Tests page to consciously spend a token.
        if (state !== 'empty') return;
        var designId = row.getAttribute('data-design-id');
        if (designId && recentlyAttempted(designId)) {
          console.info('[QAProof] Auto-cache skipped for ' + designId + ' (recent attempt within cooldown)');
          return;
        }
        var figmaUrlInp   = row.querySelector('[data-field="figmaUrl"]');
        var figmaTokenInp = row.querySelector('[data-field="figmaToken"]');
        if (!figmaUrlInp || !figmaTokenInp) return;
        if (!figmaUrlInp.value.trim() || !figmaTokenInp.value.trim()) return;
        if (designId) markAttempt(designId);
        queue.push(row);
      });
      if (!queue.length) return;
      // Run sequentially to avoid hammering Figma's rate-limited API.
      queue.reduce(function (p, row) {
        return p.then(function () { return autoCacheDesign(row); });
      }, Promise.resolve());
    }

    // Kick off shortly after load so the UI paints first.
    if (window.qaproof && window.qaproof.restBase) {
      setTimeout(runAutoCacheQueue, 500);
    }

    // ------------------------------------------------------------------
    // Figma API usage widget — live refresh + reset button
    // ------------------------------------------------------------------
    (function wireFigmaUsageWidget() {
      var widget = document.getElementById('qaproof-figma-usage');
      if (!widget || !window.qaproof || !window.qaproof.restBase) return;

      function formatRetryDate(ms) {
        try {
          var d = new Date(ms);
          var now = new Date();
          var diffMs = ms - now.getTime();
          var diffDays = Math.floor(diffMs / 86400000);
          var diffHours = Math.floor((diffMs % 86400000) / 3600000);
          var diffMins = Math.floor((diffMs % 3600000) / 60000);
          var absolute = d.toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
          var relative;
          if (diffDays >= 1)      relative = 'in ' + diffDays + 'd ' + diffHours + 'h';
          else if (diffHours >= 1) relative = 'in ' + diffHours + 'h ' + diffMins + 'm';
          else                     relative = 'in ' + Math.max(1, diffMins) + 'm';
          return { absolute: absolute, relative: relative };
        } catch (e) {
          return { absolute: '', relative: '' };
        }
      }

      function renderUsage(data) {
        if (!data) return;
        // Usage is now per-fileKey. Build a roll-up for the global widget:
        // - total = sum of calls across all files this month
        // - cap   = per-file Starter cap (~6/month) — remember it's per file!
        // - limitedFiles = number of files currently under an active 429 window
        var cap    = parseInt(widget.getAttribute('data-cap'), 10) || 6;
        var byFile = data.byFile || {};
        var fileKeys = Object.keys(byFile);
        var total = parseInt(data.total || 0, 10);
        var imgN  = 0, nodesN = 0;
        var limitedFiles = [];
        fileKeys.forEach(function (k) {
          var e = byFile[k] || {};
          var bt = e.byType || {};
          imgN   += parseInt(bt.image || 0, 10);
          nodesN += parseInt(bt.nodes || 0, 10);
          var rl = e.rateLimit || {};
          var retryAt = parseInt(rl.retryAt || 0, 10);
          if (retryAt > 0 && retryAt > Date.now()) {
            limitedFiles.push({ fileKey: k, retryAt: retryAt });
          }
        });
        var anyLimited = limitedFiles.length > 0;

        var totalEl = widget.querySelector('.qaproof-figma-usage-total');
        var brkEl   = widget.querySelector('.qaproof-figma-usage-breakdown');
        var barEl   = widget.querySelector('.qaproof-figma-usage-bar');
        if (totalEl) {
          totalEl.textContent = total;
          totalEl.style.color = anyLimited ? '#b91c1c' : '#0f766e';
        }
        if (brkEl) {
          var files = fileKeys.length;
          brkEl.textContent = imgN + ' image, ' + nodesN + ' nodes · across ' + files + ' file' + (files === 1 ? '' : 's');
        }
        if (barEl) {
          // Bar now shows worst-case file usage (max calls any single file made
          // this month) relative to the per-file cap — more meaningful than summing.
          var worst = 0;
          fileKeys.forEach(function (k) {
            var t = parseInt((byFile[k] || {}).total || 0, 10);
            if (t > worst) worst = t;
          });
          var pct = cap > 0 ? Math.min(100, Math.round(worst / cap * 100)) : 0;
          barEl.style.width = (anyLimited ? 100 : pct) + '%';
          barEl.style.background = anyLimited ? '#dc2626' : '#10b981';
        }
        widget.setAttribute('data-total', total);

        // Roll-up banner: one line per rate-limited file. Each design row
        // shows its own inline indicator separately (see broadcastStatus).
        var banner = widget.querySelector('.qaproof-figma-ratelimit-banner');
        if (!banner) {
          banner = document.createElement('div');
          banner.className = 'qaproof-figma-ratelimit-banner';
          banner.style.cssText = 'margin-top:10px;padding:10px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px;line-height:1.5;display:none;';
          widget.appendChild(banner);
        }
        if (anyLimited) {
          var lines = limitedFiles.map(function (f) {
            var fmt = formatRetryDate(f.retryAt);
            return '<li><code>' + f.fileKey + '</code> \u2014 retry <strong>' + fmt.relative + '</strong> (' + fmt.absolute + ')</li>';
          }).join('');
          banner.innerHTML = '<strong>' + limitedFiles.length + ' Figma file' + (limitedFiles.length === 1 ? '' : 's') + ' rate-limited.</strong> ' +
            'Other designs are unaffected.<ul style="margin:6px 0 0 18px;padding:0;">' + lines + '</ul>';
          banner.style.display = 'block';
        } else {
          banner.style.display = 'none';
        }
      }

      function refresh() {
        fetch(window.qaproof.restBase + '/figma-api-usage', {
          headers: { 'X-WP-Nonce': window.qaproof.nonce }
        })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.success) renderUsage(j.data); })
        .catch(function () { /* ignore */ });
      }

      // Initial render from localized data (byFile map carries per-file
      // rateLimit already, no need to splice in a legacy global blob).
      try {
        renderUsage((window.qaproof && window.qaproof.figmaApiUsage) || {});
      } catch (e) { /* noop */ }

      // React to in-flight 429s without waiting for the next poll tick.
      widget.addEventListener('qaproof:ratelimit', function () {
        try { renderUsage((window.qaproof && window.qaproof.figmaApiUsage) || {}); } catch (e) {}
      });

      // Refresh after the auto-cache queue settles (every 2s for 20s).
      var ticks = 0;
      var interval = setInterval(function () {
        refresh();
        if (++ticks >= 10) clearInterval(interval);
      }, 2000);

      // Reset button
      var resetBtn = widget.querySelector('.qaproof-figma-usage-reset');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          if (!confirm(qaproof.i18n.resetFigmaConfirm || 'Reset the Figma API call counter for this month?\n\n(This only resets the local tracker in this plugin — it does NOT reset Figma\'s actual quota on their side.)')) return;
          fetch(window.qaproof.restBase + '/figma-api-usage/reset', {
            method: 'POST',
            headers: { 'X-WP-Nonce': window.qaproof.nonce }
          })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j && j.success) renderUsage(j.data); });
        });
      }
    })();
  }

  // ============================
  // Keyboard Navigation
  // ============================
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (S.allDifferences.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      var next = S.activeDiffIndex === null ? 0 : Math.min(S.activeDiffIndex + 1, S.allDifferences.length - 1);
      if (Q.selectDifference) Q.selectDifference(next);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      var prev = S.activeDiffIndex === null ? 0 : Math.max(S.activeDiffIndex - 1, 0);
      if (Q.selectDifference) Q.selectDifference(prev);
    } else if (e.key === 'Escape') {
      if (Q.deselectAll) Q.deselectAll();
    }
  });

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

    // Create sliding indicator
    var tabSlider = document.createElement('div');
    tabSlider.className = 'qaproof-page-tab-slider';
    tabsContainer.appendChild(tabSlider);

    function moveTabSlider(btn) {
      var navRect = tabsContainer.getBoundingClientRect();
      var btnRect = btn.getBoundingClientRect();
      tabSlider.style.width = btnRect.width + 'px';
      tabSlider.style.height = btnRect.height + 'px';
      tabSlider.style.transform = 'translateX(' + (btnRect.left - navRect.left - tabsContainer.clientLeft) + 'px) translateY(' + (btnRect.top - navRect.top - tabsContainer.clientTop) + 'px)';
    }

    // Initial position without transition
    requestAnimationFrame(function () {
      var activeBtn = tabsContainer.querySelector('.qaproof-page-tab.active');
      if (activeBtn) {
        tabSlider.style.transition = 'none';
        moveTabSlider(activeBtn);
        requestAnimationFrame(function () {
          tabSlider.style.transition = '';
        });
      }
    });

    function switchTo(targetTab) {
      tabs.forEach(function (t) {
        if (t.getAttribute('data-tab') === targetTab) {
          t.classList.add('active');
          moveTabSlider(t);
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

  // ---- Tests Page History Instance ----
  var testsHistoryMgr = Q.createHistoryManager({
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
    resultLoadingEl:     S.loading,
    resultLoadingTextEl: S.loadingText,
    resultContainerEl:   S.resultsContainer,
    renderResult: null, // uses fallback global render functions
    showError:    Q.showError,
    onBeforeView: function () {
      if (testsPageTabs) testsPageTabs.switchTo('test');
      var formCard = document.querySelector('#qaproof-tab-test > .qaproof-card');
      if (formCard) formCard.style.display = 'none';
      var app = document.getElementById('qaproof-app');
      if (app) app.setAttribute('data-back-tab', 'history');
    },
  });
  if (testsHistoryMgr) testsHistoryMgr.init();

  // ============================
  // Accessibility Page — Form Submit Handler
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

      a11yLoading.classList.remove('hidden');
      a11yLoading.style.display = '';
      a11yErrorDiv.classList.add('hidden');
      a11yResults.classList.add('hidden');
      a11yResults.innerHTML = '';
      a11ySubmitBtn.disabled = true;

      // Loading steps
      var checkSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var a11yLoadingSteps = [
        { time: 0, text: (qaproof.i18n.stepA11yCapture || 'Capturing page screenshot') },
        { time: 8000, text: (qaproof.i18n.stepA11yProcess || 'Processing images') },
        { time: 20000, text: (qaproof.i18n.stepA11yAnalysis || 'Running accessibility analysis') },
        { time: 50000, text: (qaproof.i18n.stepA11yWcag || 'Evaluating WCAG compliance') },
        { time: 90000, text: (qaproof.i18n.stepA11yReport || 'Generating audit report') },
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

      // Read WCAG level from dropdown or fallback to settings
      var wcagLevelEl = document.getElementById('qaproof-a11y-wcag-level');
      var wcagLevel = (wcagLevelEl && wcagLevelEl.value) ? wcagLevelEl.value : (qaproof.wcagLevel || 'AA');

      var a11yBody = {
        pageUrl: pageUrl,
        testType: 'accessibility',
        wcagLevel: wcagLevel,
      };

      var _a11yPendingRetries = window.__qaproofPendingRetries || 0;
      window.__qaproofPendingRetries = 0;
      Q.saveActiveJob(null, 'accessibility', pageUrl, 'accessibility', 'submitting', _a11yPendingRetries);

      fetch(qaproof.restUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': qaproof.nonce,
        },
        body: JSON.stringify(a11yBody),
        credentials: 'same-origin',
      })
      .then(Q.safeJson)
      .then(function (data) {
        if (!data.success || !data.data || !data.data.jobId) {
          throw new Error((data.error && data.error.message) || 'Failed to create accessibility test job.');
        }

        var jobId = data.data.jobId;
        Q.saveActiveJob(jobId, 'accessibility', pageUrl, 'accessibility', 'polling');

        Q.startJobPolling(jobId, {
          page: 'accessibility',
          onPoll: function (status, elapsed) {
            console.log('[QAProof] A11y poll:', status, elapsed);
          },
          onDone: function (resultData) {
            a11yTimers.forEach(clearTimeout);
            S.resultsContainer = a11yResults;
            if (Q.renderAccessibilityResults) Q.renderAccessibilityResults(resultData);

            a11yLoading.classList.add('hidden');
            a11ySubmitBtn.disabled = false;
          },
          onScreenshotsDone: function (resultData) {
            Q.saveTestHistory('accessibility', pageUrl, jobId, resultData)
              .then(function () { if (a11yHistoryMgr) a11yHistoryMgr.load(true); })
              .catch(function () { if (a11yHistoryMgr) a11yHistoryMgr.load(true); });
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
        if (err.message && err.message.indexOf('Rate limit') !== -1) {
          Q.clearActiveJob('accessibility');
        }
        a11yErrorMsg.textContent = (err.message || 'Network error.') + ' Reload the page to retry.';
        a11yErrorDiv.classList.remove('hidden');
        a11yLoading.classList.add('hidden');
        a11ySubmitBtn.disabled = false;
      });
    });
  }

  // ---- Accessibility Page History Instance ----
  var a11yHistoryMgr = Q.createHistoryManager({
    sectionId:    'qaproof-a11y-history-section',
    contentId:    'qaproof-a11y-history-content',
    toggleId:     'qaproof-a11y-history-toggle',
    listId:       'qaproof-a11y-history-list',
    loadingId:    'qaproof-a11y-history-loading',
    emptyId:      'qaproof-a11y-history-empty',
    loadMoreId:   'qaproof-a11y-history-load-more',
    filtersId:    null,
    defaultType:  'accessibility',
    perPage:      10,
    resultLoadingEl:     document.getElementById('qaproof-a11y-loading'),
    resultLoadingTextEl: document.getElementById('qaproof-a11y-loading-text'),
    resultContainerEl:   document.getElementById('qaproof-a11y-results'),
    renderResult: function (resultData) {
      S.resultsContainer = document.getElementById('qaproof-a11y-results');
      if (Q.renderAccessibilityResults) Q.renderAccessibilityResults(resultData);
    },
    showError: function (msg) {
      var el = document.getElementById('qaproof-a11y-error-message');
      var wrap = document.getElementById('qaproof-a11y-error');
      if (el) el.textContent = msg;
      if (wrap) wrap.classList.remove('hidden');
    },
    onBeforeView: function () {
      if (a11yPageTabs) a11yPageTabs.switchTo('a11y-audit');
      var formCard = document.querySelector('#qaproof-tab-a11y-audit > .qaproof-card');
      if (formCard) formCard.style.display = 'none';
      var app = document.getElementById('qaproof-app');
      if (app) app.setAttribute('data-back-tab', 'a11y-history');
    },
  });
  if (a11yHistoryMgr) a11yHistoryMgr.init();

  // Expose history managers so form submit can refresh them
  Q.testsHistoryMgr = testsHistoryMgr;
  Q.a11yHistoryMgr = a11yHistoryMgr;

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

    var backTab = app.getAttribute('data-back-tab');

    if (backTab) {
      var testFormCard = app.querySelector('#qaproof-tab-test > .qaproof-card');
      var a11yFormCard = app.querySelector('#qaproof-tab-a11y-audit > .qaproof-card');
      if (testFormCard) testFormCard.style.display = '';
      if (a11yFormCard) a11yFormCard.style.display = '';

      if (backTab === 'history' && testsPageTabs) {
        testsPageTabs.switchTo('history');
      } else if (backTab === 'a11y-history' && a11yPageTabs) {
        a11yPageTabs.switchTo('a11y-history');
      }

      app.removeAttribute('data-back-tab');
    } else {
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

      var card = app.querySelector('.qaproof-card');
      if (card) card.style.display = '';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ============================
  // Settings saved toast
  // ============================
  function showQaproofToast(message) {
    var app = document.getElementById('qaproof-app');
    if (!app) return;

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
      var wpNotice = document.querySelector('.notice-success, .updated');
      if (wpNotice) wpNotice.style.display = 'none';
      showQaproofToast((qaproof.i18n.settingsSaved || 'Settings saved successfully'));
    }

    var settingsForm = document.querySelector('#qaproof-app form[action="options.php"]');
    if (settingsForm) {
      settingsForm.addEventListener('submit', function () {
        sessionStorage.setItem('qaproof_settings_saved', '1');
        // Animate the submit button while the page reloads
        var btn = settingsForm.querySelector('#submit, input[type="submit"], button[type="submit"]');
        if (!btn) return;
        btn.disabled = true;
        // Create a spinner div that matches the button exactly
        var w = btn.offsetWidth;
        var h = btn.offsetHeight;
        var btnCs = getComputedStyle(btn);
        var spinner = document.createElement('div');
        spinner.className = 'qaproof-btn-saving';
        spinner.style.cssText = 'width:' + w + 'px;height:' + h + 'px;'
          + 'background:' + btnCs.background + ';'
          + 'border-radius:' + btnCs.borderRadius + ';'
          + 'margin:' + btnCs.margin + ';';
        spinner.innerHTML = '<span class="qaproof-btn-saving-spinner"></span>';
        btn.parentNode.insertBefore(spinner, btn);
        btn.style.setProperty('display', 'none', 'important');
      });
    }
  })();

  // ============================
  // Custom form validation (replace browser tooltips)
  // ============================
  (function () {
    var app = document.getElementById('qaproof-app');
    if (!app) return;

    var forms = app.querySelectorAll('form');
    forms.forEach(function (f) { f.setAttribute('novalidate', ''); });

    function showFieldError(input, message) {
      clearFieldError(input);
      var err = document.createElement('div');
      err.className = 'qaproof-field-error';
      err.textContent = message;
      input.classList.add('qaproof-input-invalid');
      input.parentNode.insertBefore(err, input.nextSibling);
    }

    function clearFieldError(input) {
      input.classList.remove('qaproof-input-invalid');
      var next = input.nextElementSibling;
      if (next && next.classList.contains('qaproof-field-error')) {
        next.remove();
      }
    }

    function getValidationMessage(input) {
      var val = input.value.trim();
      var type = input.getAttribute('type') || 'text';
      var min = input.getAttribute('min');
      var max = input.getAttribute('max');

      if (input.hasAttribute('required') && !val) {
        return (qaproof.i18n.fieldRequired || 'This field is required.');
      }
      if (type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        return (qaproof.i18n.invalidEmail || 'Please enter a valid email address.');
      }
      if (type === 'url' && val && !/^https?:\/\/.+/i.test(val)) {
        return (qaproof.i18n.invalidUrl || 'Please enter a valid URL starting with http:// or https://');
      }
      if (type === 'number' && val) {
        var num = parseFloat(val);
        if (isNaN(num)) return (qaproof.i18n.invalidNumber || 'Please enter a valid number.');
        if (min !== null && num < parseFloat(min)) {
          return (qaproof.i18n.minValue || 'Value must be at least ') + min + '.';
        }
        if (max !== null && num > parseFloat(max)) {
          return (qaproof.i18n.maxValue || 'Value must be no more than ') + max + '.';
        }
      }
      return '';
    }

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

      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = wrapper.classList.contains('open');
        closeAllSelects();
        if (!isOpen) wrapper.classList.add('open');
      });

      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger.click();
        } else if (e.key === 'Escape') {
          wrapper.classList.remove('open');
        }
      });

      dropdown.addEventListener('click', function (e) {
        var opt = e.target.closest('.qaproof-select-option');
        if (!opt) return;
        nativeSelect.value = opt.dataset.value;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        buildOptions();
        wrapper.classList.remove('open');
      });

      nativeSelect.addEventListener('change', function () {
        buildOptions();
      });

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

    app.querySelectorAll('select').forEach(buildCustomSelect);
  })();

  // ============================
  // Job Recovery on Page Reload
  // ============================
  (function () {
    var isTestsPage = !!document.getElementById('qaproof-test-form');
    var isA11yPage = !!document.getElementById('qaproof-a11y-form');

    var currentPage = isA11yPage ? 'accessibility' : (isTestsPage ? 'tests' : null);
    if (!currentPage) return;

    var activeJob = Q.getActiveJob(currentPage);
    if (!activeJob) return;

    // Phase 'submitting' — re-submit the test
    if (activeJob.phase === 'submitting') {
      var retryCount = activeJob.retries || 0;
      if (retryCount >= 3) {
        console.warn('[QAProof] Max retries reached (' + retryCount + ') — giving up on', activeJob.testType);
        Q.clearActiveJob(currentPage);
        if (currentPage === 'tests') {
          Q.showError((qaproof.i18n.testSubmissionFailed || 'Test submission failed after multiple retries. Please try again.'));
        } else if (currentPage === 'accessibility') {
          var a11yErrDivR = document.getElementById('qaproof-a11y-error');
          var a11yErrMsgR = document.getElementById('qaproof-a11y-error-message');
          if (a11yErrMsgR) a11yErrMsgR.textContent = (qaproof.i18n.testSubmissionFailed || 'Test submission failed after multiple retries. Please try again.');
          if (a11yErrDivR) a11yErrDivR.classList.remove('hidden');
        }
        return;
      }

      console.log('[QAProof] Recovering submitting job — re-submitting (retry ' + (retryCount + 1) + '/3)', activeJob.testType, 'on', currentPage);
      var pendingRetries = retryCount + 1;
      Q.clearActiveJob(currentPage);

      window.__qaproofPendingRetries = pendingRetries;

      if (currentPage === 'tests') {
        var urlInput = document.getElementById('qaproof-page-url');
        if (urlInput && activeJob.pageUrl) urlInput.value = activeJob.pageUrl;
        if (S.submitBtn) S.submitBtn.click();
      } else if (currentPage === 'accessibility') {
        var a11yUrlInput = document.getElementById('qaproof-a11y-url');
        if (a11yUrlInput && activeJob.pageUrl) a11yUrlInput.value = activeJob.pageUrl;
        var a11ySubmit = document.getElementById('qaproof-a11y-submit-btn');
        if (a11ySubmit) a11ySubmit.click();
      }
      return;
    }

    // Phase 'polling' — resume polling
    console.log('[QAProof] Recovering active job:', activeJob.jobId, activeJob.testType, 'on', currentPage);

    if (currentPage === 'tests' && S.loading) {
      S.testsPageBusy = true;
      S.loading.classList.remove('hidden');
      if (S.submitBtn) S.submitBtn.disabled = true;
      if (S.loadingText) S.loadingText.textContent = (qaproof.i18n.resumingTest || 'Resuming test — waiting for results...');
      if (S.loadingSubtext) S.loadingSubtext.textContent = (qaproof.i18n.resumingTestSub || 'Test is still running on the server');

      // Build progress steps — restore position based on elapsed time since job started
      var checkSvgR = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var resumeTestType = activeJob.testType || 'fidelity';
      var resumeSteps = resumeTestType === 'design-audit' ? [
        { time: 0,     text: 'Capturing page screenshot' },
        { time: 8000,  text: 'Extracting design tokens from DOM' },
        { time: 20000, text: 'Analyzing color palette & typography' },
        { time: 40000, text: 'AI auditing design consistency' },
        { time: 70000, text: 'Building design debt report' },
      ] : [
        { time: 0,     text: 'Capturing page screenshot' },
        { time: 8000,  text: 'Processing images' },
        { time: 20000, text: 'Running AI analysis' },
        { time: 50000, text: 'Generating report' },
        { time: 90000, text: 'Finalizing results' },
      ];

      // How much time has already passed since the job started
      var resumeElapsed = activeJob.startedAt ? (Date.now() - activeJob.startedAt) : 0;

      // Find which step we should currently be on
      var resumeCurrentStep = 0;
      for (var si = 0; si < resumeSteps.length; si++) {
        if (resumeElapsed >= resumeSteps[si].time) resumeCurrentStep = si;
      }

      var stepsEl = document.getElementById('qaproof-loading-steps');
      if (stepsEl) {
        stepsEl.style.display = '';
        stepsEl.innerHTML = '';
        for (var si = 0; si < resumeSteps.length; si++) {
          if (si > 0) {
            var conn = document.createElement('div');
            conn.className = 'qaproof-step-connector' + (si <= resumeCurrentStep ? ' completed' : '');
            conn.id = 'qaproof-connector-' + si;
            stepsEl.appendChild(conn);
          }
          var stepEl = document.createElement('div');
          if (si < resumeCurrentStep) {
            stepEl.className = 'qaproof-loading-step completed';
            stepEl.innerHTML = '<span class="qaproof-step-indicator">' + checkSvgR + '</span>';
          } else if (si === resumeCurrentStep) {
            stepEl.className = 'qaproof-loading-step active';
            stepEl.innerHTML = '<span class="qaproof-step-indicator">' + (si + 1) + '</span>';
          } else {
            stepEl.className = 'qaproof-loading-step';
            stepEl.innerHTML = '<span class="qaproof-step-indicator">' + (si + 1) + '</span>';
          }
          stepEl.id = 'qaproof-lstep-' + si;
          stepsEl.appendChild(stepEl);
        }
        if (S.loadingText) S.loadingText.textContent = resumeSteps[resumeCurrentStep].text + '...';
        if (S.loadingSubtext) S.loadingSubtext.textContent = resumeCurrentStep < resumeSteps.length - 1 ? 'This may take 1-3 minutes' : 'Almost done';
      }

      // Schedule only the remaining steps, with delay adjusted for elapsed time
      var resumeTimers = resumeSteps.map(function (step, idx) {
        if (idx <= resumeCurrentStep) return null; // already passed
        var delay = Math.max(0, step.time - resumeElapsed);
        return setTimeout(function () {
          for (var j = 0; j < idx; j++) {
            var prev = document.getElementById('qaproof-lstep-' + j);
            if (prev) { prev.classList.remove('active'); prev.classList.add('completed'); var ind = prev.querySelector('.qaproof-step-indicator'); if (ind) ind.innerHTML = checkSvgR; }
            var c = document.getElementById('qaproof-connector-' + (j + 1));
            if (c) c.classList.add('completed');
          }
          var curr = document.getElementById('qaproof-lstep-' + idx);
          if (curr) { curr.classList.add('active'); curr.classList.remove('completed'); }
          if (S.loadingText) S.loadingText.textContent = step.text + '...';
          if (S.loadingSubtext) S.loadingSubtext.textContent = idx < resumeSteps.length - 1 ? 'This may take 1-3 minutes' : 'Almost done';
        }, delay);
      });

      Q.startJobPolling(activeJob.jobId, {
        page: 'tests',
        onPoll: function (status, elapsed) {
          if (S.loadingSubtext) S.loadingSubtext.textContent = 'Status: ' + status + ' (' + elapsed + ')';
        },
        onDone: function (resultData) {
          resumeTimers.forEach(function (t) { if (t) clearTimeout(t); });
          if (resultData.testType === 'responsive') {
            Q.renderResponsiveResults(resultData);
          } else if (resultData.testType === 'accessibility') {
            Q.renderAccessibilityResults(resultData);
          } else if (resultData.testType === 'design-audit') {
            Q.renderDesignAuditResults(resultData);
          } else {
            Q.renderFidelityResults(resultData);
          }

          S.loading.classList.add('hidden');
          if (S.submitBtn) S.submitBtn.disabled = false;
          S.testsPageBusy = false;
        },
        onScreenshotsDone: function (resultData) {
          Q.saveTestHistory(activeJob.testType, activeJob.pageUrl, activeJob.jobId, resultData)
            .then(function () { if (testsHistoryMgr) testsHistoryMgr.load(true); })
            .catch(function () { if (testsHistoryMgr) testsHistoryMgr.load(true); });
        },
        onFailed: function (errorMsg) {
          Q.showError(Q.escapeHtml(errorMsg));
          S.loading.classList.add('hidden');
          if (S.submitBtn) S.submitBtn.disabled = false;
          S.testsPageBusy = false;
        },
      });
    } else if (currentPage === 'accessibility') {
      var a11yLoad = document.getElementById('qaproof-a11y-loading');
      var a11yBtn = document.getElementById('qaproof-a11y-submit-btn');
      var a11yLoadText = document.getElementById('qaproof-a11y-loading-text');
      var a11yLoadSub = document.getElementById('qaproof-a11y-loading-subtext');
      var a11yErrDiv = document.getElementById('qaproof-a11y-error');
      var a11yErrMsg = document.getElementById('qaproof-a11y-error-message');
      var a11yRes = document.getElementById('qaproof-a11y-results');

      if (a11yLoad) a11yLoad.classList.remove('hidden');
      if (a11yBtn) a11yBtn.disabled = true;
      if (a11yLoadText) a11yLoadText.textContent = (qaproof.i18n.resumingA11y || 'Resuming accessibility test — waiting for results...');
      if (a11yLoadSub) a11yLoadSub.textContent = (qaproof.i18n.resumingTestSub || 'Test is still running on the server');

      // Build progress steps — restore position based on elapsed time since job started
      var checkSvgA = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var a11yResumeSteps = [
        { time: 0,     text: (qaproof.i18n.stepA11yCapture || 'Capturing page screenshot') },
        { time: 8000,  text: (qaproof.i18n.stepA11yProcess || 'Processing images') },
        { time: 20000, text: (qaproof.i18n.stepA11yAnalysis || 'Running accessibility analysis') },
        { time: 50000, text: (qaproof.i18n.stepA11yWcag || 'Evaluating WCAG compliance') },
        { time: 90000, text: (qaproof.i18n.stepA11yReport || 'Generating audit report') },
      ];

      // How much time has already passed since the job started
      var a11yElapsed = activeJob.startedAt ? (Date.now() - activeJob.startedAt) : 0;

      // Find which step we should currently be on
      var a11yCurrentStep = 0;
      for (var si = 0; si < a11yResumeSteps.length; si++) {
        if (a11yElapsed >= a11yResumeSteps[si].time) a11yCurrentStep = si;
      }

      var a11yStepsEl = document.getElementById('qaproof-a11y-loading-steps');
      if (a11yStepsEl) {
        a11yStepsEl.style.display = '';
        a11yStepsEl.innerHTML = '';
        for (var si = 0; si < a11yResumeSteps.length; si++) {
          if (si > 0) {
            var conn = document.createElement('div');
            conn.className = 'qaproof-step-connector' + (si <= a11yCurrentStep ? ' completed' : '');
            conn.id = 'qaproof-a11y-connector-' + si;
            a11yStepsEl.appendChild(conn);
          }
          var stepEl = document.createElement('div');
          if (si < a11yCurrentStep) {
            stepEl.className = 'qaproof-loading-step completed';
            stepEl.innerHTML = '<span class="qaproof-step-indicator">' + checkSvgA + '</span>';
          } else if (si === a11yCurrentStep) {
            stepEl.className = 'qaproof-loading-step active';
            stepEl.innerHTML = '<span class="qaproof-step-indicator">' + (si + 1) + '</span>';
          } else {
            stepEl.className = 'qaproof-loading-step';
            stepEl.innerHTML = '<span class="qaproof-step-indicator">' + (si + 1) + '</span>';
          }
          stepEl.id = 'qaproof-a11y-lstep-' + si;
          a11yStepsEl.appendChild(stepEl);
        }
        if (a11yLoadText) a11yLoadText.textContent = a11yResumeSteps[a11yCurrentStep].text + '...';
        if (a11yLoadSub) a11yLoadSub.textContent = a11yCurrentStep < a11yResumeSteps.length - 1 ? 'This may take 1-3 minutes' : 'Almost done';
      }

      // Schedule only the remaining steps, with delay adjusted for elapsed time
      var a11yResumeTimers = a11yResumeSteps.map(function (step, idx) {
        if (idx <= a11yCurrentStep) return null; // already passed
        var delay = Math.max(0, step.time - a11yElapsed);
        return setTimeout(function () {
          for (var j = 0; j < idx; j++) {
            var prev = document.getElementById('qaproof-a11y-lstep-' + j);
            if (prev) { prev.classList.remove('active'); prev.classList.add('completed'); var ind = prev.querySelector('.qaproof-step-indicator'); if (ind) ind.innerHTML = checkSvgA; }
            var c = document.getElementById('qaproof-a11y-connector-' + (j + 1));
            if (c) c.classList.add('completed');
          }
          var curr = document.getElementById('qaproof-a11y-lstep-' + idx);
          if (curr) { curr.classList.add('active'); curr.classList.remove('completed'); }
          if (a11yLoadText) a11yLoadText.textContent = step.text + '...';
          if (a11yLoadSub) a11yLoadSub.textContent = idx < a11yResumeSteps.length - 1 ? 'This may take 1-3 minutes' : 'Almost done';
        }, delay);
      });

      Q.startJobPolling(activeJob.jobId, {
        page: 'accessibility',
        onPoll: function (status, elapsed) {
          if (a11yLoadSub) a11yLoadSub.textContent = 'Status: ' + status + ' (' + elapsed + ')';
        },
        onDone: function (resultData) {
          a11yResumeTimers.forEach(function (t) { if (t) clearTimeout(t); });
          S.resultsContainer = a11yRes;
          if (Q.renderAccessibilityResults) Q.renderAccessibilityResults(resultData);

          if (a11yLoad) a11yLoad.classList.add('hidden');
          if (a11yBtn) a11yBtn.disabled = false;
        },
        onScreenshotsDone: function (resultData) {
          Q.saveTestHistory('accessibility', activeJob.pageUrl, activeJob.jobId, resultData)
            .then(function () { if (a11yHistoryMgr) a11yHistoryMgr.load(true); })
            .catch(function () { if (a11yHistoryMgr) a11yHistoryMgr.load(true); });
        },
        onFailed: function (errorMsg) {
          a11yResumeTimers.forEach(function (t) { if (t) clearTimeout(t); });
          if (a11yErrMsg) a11yErrMsg.textContent = errorMsg;
          if (a11yErrDiv) a11yErrDiv.classList.remove('hidden');
          if (a11yLoad) a11yLoad.classList.add('hidden');
          if (a11yBtn) a11yBtn.disabled = false;
        },
      });
    }
  })();
})();
