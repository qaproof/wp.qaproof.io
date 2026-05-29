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
      // Show the panel when the user has typed a key OR when a key is
      // already saved (the input now renders empty for security — the
      // server-side handler falls back to the saved option when no api_key
      // is posted).
      if (!key && !qaproof.hasApiKey) return;

      accountInfo.style.display  = '';
      if (accountLoading) accountLoading.style.display = '';
      if (accountBody)    accountBody.style.display    = 'none';
      if (accountError)   accountError.style.display   = 'none';

      var data = new FormData();
      data.append('action', 'qaproof_fetch_account_info');
      data.append('nonce', qaproof.ajaxNonce);
      // Pass the current input value when the user is previewing an unsaved
      // key. When empty, the AJAX handler falls back to the saved option.
      if (key) data.append('api_key', key);

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
    var designId = data.id || generateId();
    var verifyLabel = qaproof.i18n.verifyAccessLabel || 'Verify access';
    var removeLabel = qaproof.i18n.designRemove || 'Remove';

    var row = document.createElement('div');
    row.className = 'qaproof-design-row';
    row.setAttribute('data-design-id', designId);

    // Build fields container — every value goes via attributes/textContent so
    // hostile saved data can never break out of an attribute or inject HTML.
    var fields = document.createElement('div');
    fields.className = 'qaproof-design-row-fields';

    var nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.placeholder = 'Design Name';
    nameInp.value = data.name || '';
    nameInp.setAttribute('data-field', 'name');
    nameInp.className = 'regular-text';
    fields.appendChild(nameInp);

    var urlInp = document.createElement('input');
    urlInp.type = 'url';
    urlInp.placeholder = 'Figma URL';
    urlInp.value = data.figmaUrl || '';
    urlInp.setAttribute('data-field', 'figmaUrl');
    urlInp.className = 'regular-text';
    fields.appendChild(urlInp);

    var verifyBtn = document.createElement('button');
    verifyBtn.type = 'button';
    verifyBtn.className = 'button qaproof-design-verify-btn';
    verifyBtn.setAttribute('data-design-id', designId);
    verifyBtn.title = verifyLabel;
    verifyBtn.textContent = verifyLabel;
    fields.appendChild(verifyBtn);

    var idInp = document.createElement('input');
    idInp.type = 'hidden';
    idInp.value = designId;
    idInp.setAttribute('data-field', 'id');
    fields.appendChild(idInp);

    row.appendChild(fields);

    // Verify-result message slot — full text goes here, not into the button.
    // Hidden until a verify call completes; toggled visible + colored by the
    // verify-access click handler. Keeps the verify button compact instead of
    // ballooning with long error messages.
    var verifyMsg = document.createElement('div');
    verifyMsg.className = 'qaproof-design-verify-msg';
    verifyMsg.hidden = true;
    row.appendChild(verifyMsg);

    // Remove button (uses dashicon span)
    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'button qaproof-design-remove';
    removeBtn.title = removeLabel;
    var icon = document.createElement('span');
    icon.className = 'dashicons dashicons-trash';
    removeBtn.appendChild(icon);
    row.appendChild(removeBtn);

    // Wire input/remove listeners. Editing the URL invalidates any previous
    // verify result — clear the message slot so a stale "no access" doesn't
    // linger under a freshly pasted URL.
    row.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('input', syncDesignsToHidden);
      if (inp.getAttribute('data-field') === 'figmaUrl') {
        inp.addEventListener('input', function () {
          if (!verifyMsg.hidden) {
            verifyMsg.hidden = true;
            verifyMsg.textContent = '';
            verifyMsg.classList.remove('qaproof-verify-msg-error', 'qaproof-verify-msg-success');
          }
        });
      }
    });
    removeBtn.addEventListener('click', function () {
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
          Q.confirm(
            qaproof.i18n.resetFigmaConfirm || 'Reset the Figma API call counter for this month?\n\n(This only resets the local tracker in this plugin — it does NOT reset Figma\'s actual quota on their side.)',
            { okLabel: qaproof.i18n.modalReset || 'Reset' }
          ).then(function (ok) {
            if (!ok) return;
            fetch(window.qaproof.restBase + '/figma-api-usage/reset', {
              method: 'POST',
              headers: { 'X-WP-Nonce': window.qaproof.nonce }
            })
            .then(function (r) { return r.json(); })
            .then(function (j) { if (j && j.success) renderUsage(j.data); });
          });
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
    perPage:      (qaproof.maxHistory && parseInt(qaproof.maxHistory, 10) > 0) ? parseInt(qaproof.maxHistory, 10) : 10,
    resultLoadingEl:     S.loading,
    resultLoadingTextEl: S.loadingText,
    resultLoadingSubtextEl: S.loadingSubtext,
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

      var _a11yPendingRetries = window.QAProof.__pendingRetries || 0;
      window.QAProof.__pendingRetries = 0;
      Q.saveActiveJob(null, 'accessibility', pageUrl, 'accessibility', 'submitting', _a11yPendingRetries, wcagLevel);

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
        Q.saveActiveJob(jobId, 'accessibility', pageUrl, 'accessibility', 'polling', 0, wcagLevel);

        Q.startJobPolling(jobId, {
          page: 'accessibility',
          onPoll: function (status, elapsed) {
          },
          onDone: function (resultData) {
            a11yTimers.forEach(clearTimeout);
            // Inject pageUrl so PDF always has correct metadata
            resultData.pageUrl = resultData.pageUrl || pageUrl || '';
            // Inject user-selected WCAG level so PDF/history always shows the correct level
            if (wcagLevel) resultData.targetWcagLevel = wcagLevel;
            S.resultsContainer = a11yResults;
            try {
              if (Q.renderAccessibilityResults) Q.renderAccessibilityResults(resultData);
            } catch (renderErr) {
              console.error('[QAProof] renderAccessibilityResults threw — hiding loader anyway', renderErr);
            }

            a11yLoading.classList.add('hidden');
            a11ySubmitBtn.disabled = false;
          },
          onScreenshotsDone: function (resultData) {
            // Server-side single writer persists history; just refresh the list.
            if (a11yHistoryMgr) a11yHistoryMgr.load(true);
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
    perPage:      (qaproof.maxHistory && parseInt(qaproof.maxHistory, 10) > 0) ? parseInt(qaproof.maxHistory, 10) : 10,
    resultLoadingEl:     document.getElementById('qaproof-a11y-loading'),
    resultLoadingTextEl: document.getElementById('qaproof-a11y-loading-text'),
    resultLoadingSubtextEl: document.getElementById('qaproof-a11y-loading-subtext'),
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
    // Remove any existing settings toast (not the monitors toast which uses an id)
    var existing = document.querySelector('.qaproof-toast:not(#qaproof-toast)');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'qaproof-toast qaproof-toast-success';
    toast.innerHTML =
      '<span class="qaproof-toast-icon"><span class="dashicons dashicons-yes-alt"></span></span>' +
      '<span class="qaproof-toast-msg">' + message + '</span>';
    document.body.appendChild(toast);

    // Dismiss after 3s using the qaproof-toast-out animation (defined in CSS)
    setTimeout(function () {
      toast.classList.add('qaproof-toast-out');
      toast.addEventListener('animationend', function () { toast.remove(); }, { once: true });
    }, 3000);
  }

  // Detect settings save via sessionStorage flag
  (function () {
    if (sessionStorage.getItem('qaproof_settings_saved')) {
      sessionStorage.removeItem('qaproof_settings_saved');
      // Clear any active jobs — the API key may have changed so a job that was
      // running under the previous key must not resume under the new workspace.
      Q.clearActiveJob('tests');
      Q.clearActiveJob('accessibility');
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
  // Hour Picker
  // ============================
  (function () {
    document.querySelectorAll('.qaproof-hour-picker').forEach(function (picker) {
      var fieldName = picker.dataset.field;
      var hiddenInput = document.querySelector('input[name="' + fieldName + '"]');
      var display = document.getElementById('qaproof-hour-display');

      picker.addEventListener('click', function (e) {
        var btn = e.target.closest('.qaproof-hour-btn');
        if (!btn) return;

        picker.querySelectorAll('.qaproof-hour-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');

        var hour = parseInt(btn.dataset.hour, 10);
        if (hiddenInput) hiddenInput.value = hour;
        if (display) display.textContent = ('0' + hour).slice(-2);
      });
    });
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

      var pendingRetries = retryCount + 1;
      Q.clearActiveJob(currentPage);

      window.QAProof.__pendingRetries = pendingRetries;

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

    if (currentPage === 'tests' && S.loading) {
      // Preflight: check job status before showing the loading UI.
      // Avoids a loader flash when the job was already cancelled (e.g. because
      // beforeunload fired during WP admin menu navigation).
      fetch(Q.buildPollUrl(activeJob.jobId), {
        method: 'GET',
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin',
      })
      .then(function (preRes) {
        if (preRes.status === 404 || preRes.status === 502) throw new Error('JOB_GONE');
        return Q.safeJson(preRes);
      })
      .then(function (preData) {
        var status = preData.success && preData.data && preData.data.status;
        // Terminal or missing — silently discard, let the user start fresh
        if (!status || status === 'cancelled' || status === 'failed') {
          Q.clearActiveJob('tests');
          return;
        }
        // Already done — render immediately without showing the loading UI
        if (status === 'done' && preData.data && preData.data.result) {
          Q.clearActiveJob('tests');
          var rd = preData.data.result;
          rd.pageUrl = rd.pageUrl || activeJob.pageUrl || '';
          if (rd.testType === 'responsive') {
            Q.renderResponsiveResults(rd);
          } else if (rd.testType === 'accessibility') {
            Q.renderAccessibilityResults(rd);
          } else if (rd.testType === 'design-audit') {
            Q.renderDesignAuditResults(rd);
          } else {
            Q.renderFidelityResults(rd);
          }
          return;
        }
        // Job is still running — show loading and resume polling
        resumeTestsPolling();
      })
      .catch(function () {
        Q.clearActiveJob('tests'); // network error → reset silently
      });

      function resumeTestsPolling() {
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
          // Inject pageUrl and wcagLevel so PDF always has correct metadata
          resultData.pageUrl = resultData.pageUrl || activeJob.pageUrl || '';
          if (resultData.testType === 'accessibility' && activeJob.wcagLevel) {
            resultData.targetWcagLevel = activeJob.wcagLevel;
          }
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
          // Server-side single writer persists history; just refresh the list.
          if (testsHistoryMgr) testsHistoryMgr.load(true);
        },
        onFailed: function (errorMsg) {
          resumeTimers.forEach(function (t) { if (t) clearTimeout(t); });
          S.loading.classList.add('hidden');
          if (S.submitBtn) S.submitBtn.disabled = false;
          S.testsPageBusy = false;
          // Silently reset if the job was cancelled due to page navigation.
          if (errorMsg && errorMsg.indexOf('cancelled') !== -1) return;
          Q.showError(Q.escapeHtml(errorMsg));
        },
      });
      } // end resumeTestsPolling()
    } else if (currentPage === 'accessibility') {
      var a11yLoad = document.getElementById('qaproof-a11y-loading');
      var a11yBtn = document.getElementById('qaproof-a11y-submit-btn');
      var a11yLoadText = document.getElementById('qaproof-a11y-loading-text');
      var a11yLoadSub = document.getElementById('qaproof-a11y-loading-subtext');
      var a11yErrDiv = document.getElementById('qaproof-a11y-error');
      var a11yErrMsg = document.getElementById('qaproof-a11y-error-message');
      var a11yRes = document.getElementById('qaproof-a11y-results');

      // Preflight: check job status before showing the loading UI.
      // Avoids a loader flash when the job was already cancelled (e.g. because
      // beforeunload fired during WP admin menu navigation).
      fetch(Q.buildPollUrl(activeJob.jobId), {
        method: 'GET',
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin',
      })
      .then(function (preRes) {
        if (preRes.status === 404 || preRes.status === 502) throw new Error('JOB_GONE');
        return Q.safeJson(preRes);
      })
      .then(function (preData) {
        var status = preData.success && preData.data && preData.data.status;
        // Terminal or missing — silently discard, let the user start fresh
        if (!status || status === 'cancelled' || status === 'failed') {
          Q.clearActiveJob('accessibility');
          return;
        }
        // Already done — render immediately without showing the loading UI
        if (status === 'done' && preData.data && preData.data.result) {
          Q.clearActiveJob('accessibility');
          var rd = preData.data.result;
          rd.pageUrl = rd.pageUrl || activeJob.pageUrl || '';
          if (activeJob.wcagLevel) rd.targetWcagLevel = activeJob.wcagLevel;
          S.resultsContainer = a11yRes;
          if (Q.renderAccessibilityResults) Q.renderAccessibilityResults(rd);
          return;
        }
        // Job is still running — show loading and resume polling
        resumeA11yPolling();
      })
      .catch(function () {
        Q.clearActiveJob('accessibility'); // network error → reset silently
      });

      function resumeA11yPolling() {
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
          // Inject pageUrl so PDF always has correct metadata
          resultData.pageUrl = resultData.pageUrl || activeJob.pageUrl || '';
          // Restore WCAG target level from saved job so PDF subtitle is correct
          if (activeJob.wcagLevel) resultData.targetWcagLevel = activeJob.wcagLevel;
          S.resultsContainer = a11yRes;
          if (Q.renderAccessibilityResults) Q.renderAccessibilityResults(resultData);

          if (a11yLoad) a11yLoad.classList.add('hidden');
          if (a11yBtn) a11yBtn.disabled = false;
        },
        onScreenshotsDone: function (resultData) {
          // Server-side single writer persists history; just refresh the list.
          if (a11yHistoryMgr) a11yHistoryMgr.load(true);
        },
        onFailed: function (errorMsg) {
          a11yResumeTimers.forEach(function (t) { if (t) clearTimeout(t); });
          if (a11yLoad) a11yLoad.classList.add('hidden');
          if (a11yBtn) a11yBtn.disabled = false;
          // Silently reset if the job was cancelled due to page navigation.
          if (errorMsg && errorMsg.indexOf('cancelled') !== -1) return;
          if (a11yErrMsg) a11yErrMsg.textContent = errorMsg;
          if (a11yErrDiv) a11yErrDiv.classList.remove('hidden');
        },
      });
      } // end resumeA11yPolling()
    }
  })();

  // ============================
  // Settings page: Verify access per saved design
  // ============================
  // The share-with-figma@qaproof.io modal + service-email Copy button +
  // "Show me how" trigger lived here through v1.0.6. Removed in v1.0.7
  // alongside the service-account PAT path — OAuth is now the only Figma
  // auth, and the modal taught the wrong recovery flow (per-file shares
  // that no longer work). Only the per-row Verify access handler remains.
  (function () {
    if (!window.qaproof || !qaproof.restBase) return;

    // Compat shim — older code paths (or third-party JS embedded by
    // customers) may reference window.QAProof.showFigmaShareGuide(). Leave
    // a no-op stub for one release so they don't crash on
    // `undefined is not a function`; drop entirely in v1.1.x.
    if (!window.QAProof) window.QAProof = {};
    if (typeof window.QAProof.showFigmaShareGuide !== 'function') {
      window.QAProof.showFigmaShareGuide = function () { /* deprecated v1.0.7 */ };
    }

    // The old openFigmaShareGuide() body (~150 lines, .qaproof-modal-wide
    // builder + Steps list + Open file / Retry / Close actions) and the
    // adjacent "Show me how →" and figma@qaproof.io Copy click handlers
    // were here in v1.0.6. Pull from `git show v1.0.6 -- this file` if
    // anyone needs to resurrect the manual-share flow.
    // Verify access: calls /designs/verify-access with the row's figmaUrl.
    //
    // Button label stays compact at all times — long error messages go into a
    // sibling .qaproof-design-verify-msg slot below the row instead of being
    // jammed into the button's textContent (which would balloon the layout).
    function setVerifyMsg(row, kind, text) {
      if (!row) return;
      var slot = row.querySelector('.qaproof-design-verify-msg');
      if (!slot) return;
      slot.classList.remove('qaproof-verify-msg-error', 'qaproof-verify-msg-success');
      if (!text) {
        slot.hidden = true;
        slot.textContent = '';
        return;
      }
      if (kind === 'error') slot.classList.add('qaproof-verify-msg-error');
      else if (kind === 'success') slot.classList.add('qaproof-verify-msg-success');
      slot.textContent = text;
      slot.hidden = false;
    }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.qaproof-design-verify-btn');
      if (!btn) return;
      e.preventDefault();

      var row = btn.closest('.qaproof-design-row');
      if (!row) return;
      var urlInp = row.querySelector('[data-field="figmaUrl"]');
      var url = urlInp ? urlInp.value.trim() : '';
      var labelDefault = qaproof.i18n.verifyAccessLabel || 'Verify access';

      if (!url) {
        btn.classList.add('qaproof-verify-error');
        btn.textContent = '✗ ' + labelDefault;
        setVerifyMsg(row, 'error', qaproof.i18n.verifyNoUrl || 'Add the Figma URL first.');
        // Revert button so user can retry; leave the message slot in place
        // until the user does something (clicks Verify again or edits the URL).
        setTimeout(function () {
          if (!btn.isConnected) return;
          btn.classList.remove('qaproof-verify-error');
          btn.textContent = labelDefault;
        }, 3500);
        return;
      }

      btn.disabled = true;
      btn.classList.remove('qaproof-verify-ok', 'qaproof-verify-error');
      btn.textContent = qaproof.i18n.verifyChecking || 'Checking…';
      setVerifyMsg(row, null, '');

      fetch(qaproof.restBase + '/designs/verify-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce },
        body: JSON.stringify({ figmaUrl: url }),
      })
        .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, body: j }; }); })
        .then(function (r) {
          btn.disabled = false;
          if (r.ok && r.body && r.body.success) {
            btn.classList.add('qaproof-verify-ok');
            btn.textContent = '✓ ' + (qaproof.i18n.verifyAccessOk || 'Access OK');
            // Surface the user we authenticated as, when the backend tells us
            // (only present on OAuth-mode response). Brief, optional context.
            var who = r.body.data && (r.body.data.figmaUserEmail || r.body.data.figmaUserHandle);
            var fileName = r.body.data && r.body.data.name;
            var okMsg = (qaproof.i18n.verifyAccessOk || 'Access OK');
            if (fileName) okMsg += ' — ' + fileName;
            if (who) okMsg += ' (via ' + who + ')';
            setVerifyMsg(row, 'success', okMsg);
            // Revert button quickly so it's clickable again; keep the success
            // text visible so the user has confirmation of which account + file.
            setTimeout(function () {
              if (!btn.isConnected) return;
              btn.classList.remove('qaproof-verify-ok');
              btn.textContent = labelDefault;
            }, 4000);
          } else {
            var code = r.body && r.body.error && r.body.error.code ? r.body.error.code : '';
            var msg;
            if (code === 'FIGMA_NOT_SHARED') {
              // OAuth-only since v1.0.7: the backend message explains the
              // connected account doesn't have access to this file. (The
              // old auto-open "share with figma@qaproof.io" guide modal was
              // removed — it taught a recovery path that no longer exists.)
              msg = (r.body && r.body.error && r.body.error.message) ||
                    qaproof.i18n.figmaNotShared ||
                    'Your connected Figma account does not have access to this file.';
            } else if (code === 'FIGMA_FILE_NOT_FOUND') {
              msg = qaproof.i18n.figmaFileNotFound || 'File not found. Check the URL.';
            } else {
              msg = (r.body && r.body.error && r.body.error.message) || 'Verification failed.';
            }
            btn.classList.add('qaproof-verify-error');
            btn.textContent = '✗ ' + (qaproof.i18n.verifyFailedShort || 'Failed');
            setVerifyMsg(row, 'error', msg);
            // Revert button so a retry click is possible; keep the error
            // message visible. It's cleared on the next verify call (start
            // of this handler) or when the user edits the URL.
            setTimeout(function () {
              if (!btn.isConnected) return; // row was removed mid-verify
              btn.classList.remove('qaproof-verify-error');
              btn.textContent = labelDefault;
            }, 3500);
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.classList.add('qaproof-verify-error');
          btn.textContent = '✗ ' + labelDefault;
          setVerifyMsg(row, 'error', qaproof.i18n.verifyNetworkError || 'Network error — try again.');
          setTimeout(function () {
            if (!btn.isConnected) return;
            btn.classList.remove('qaproof-verify-error');
            btn.textContent = labelDefault;
          }, 3500);
        });
    });
  })();
})();
