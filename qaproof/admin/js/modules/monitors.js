(function () {
  'use strict';
  var Q = window.QAProof;

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

  // Plan quota — populated by loadMonitors() from API meta
  var monitorsQuota = { used: 0, limit: 999 };

  // In-memory cache of monitor objects keyed by id.
  // Populated whenever loadMonitors() renders the list so showMonitorDetail()
  // can instantly render the detail header without waiting for a GET /monitors/:id
  // round-trip (results still need a separate fetch).
  var monitorsCache = {};

  // Track active monitor polling (detail view)
  var monitorPollTimer = null;
  var monitorPollCount = 0;
  var monitorPollMaxAttempts = 120; // 10 minutes (every 5s)
  var capturingStepTimers = [];

  // Track background list-view polls (one per monitor that has a pending run)
  var listPollTimers = {};
  var LIST_POLL_MAX = 120; // 10 minutes at 5s intervals

  // ---- Custom Datepicker ----
  var qaproofDatepicker = (function () {
    var trigger = document.getElementById('qaproof-datepicker-trigger');
    var dropdown = document.getElementById('qaproof-datepicker-dropdown');
    var label = document.getElementById('qaproof-datepicker-label');
    var hiddenInput = document.getElementById('qaproof-monitor-scheduled-at');
    if (!trigger || !dropdown) return { set: function(){}, setNow: function(){}, getValue: function(){ return ''; } };

    var isNowMode = true;
    var selectedDate = new Date();
    var viewYear = selectedDate.getFullYear();
    var viewMonth = selectedDate.getMonth();
    var selectedHour = selectedDate.getHours();
    var selectedMinute = selectedDate.getMinutes();

    var monthNames = (qaproof.i18n && qaproof.i18n.monthNames) ? qaproof.i18n.monthNames : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var dayNames = (qaproof.i18n && qaproof.i18n.dayNames) ? qaproof.i18n.dayNames : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function formatLabel(d, h, m) {
      return pad(d.getDate()) + ' ' + monthNames[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear() + ', ' + pad(h) + ':' + pad(m);
    }

    function updateHidden() {
      if (isNowMode) {
        hiddenInput.value = '';
      } else {
        var d = new Date(selectedDate);
        hiddenInput.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(selectedHour) + ':' + pad(selectedMinute) + ':00';
      }
    }

    function updateLabel() {
      if (isNowMode) {
        label.textContent = qaproof.i18n.datePickerNow || 'Now';
      } else {
        label.textContent = formatLabel(selectedDate, selectedHour, selectedMinute);
      }
      updateHidden();
    }

    function render() {
      var now = new Date();
      var todayStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      var selStr = selectedDate.getFullYear() + '-' + pad(selectedDate.getMonth() + 1) + '-' + pad(selectedDate.getDate());

      var firstDay = new Date(viewYear, viewMonth, 1).getDay();
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

      var html = '<div class="qaproof-dp-header">';
      html += '<button type="button" class="qaproof-dp-nav" data-dir="-1">&lsaquo;</button>';
      html += '<span>' + monthNames[viewMonth] + ' ' + viewYear + '</span>';
      html += '<button type="button" class="qaproof-dp-nav" data-dir="1">&rsaquo;</button>';
      html += '</div>';

      html += '<div class="qaproof-dp-weekdays">';
      for (var w = 0; w < 7; w++) html += '<span>' + dayNames[w] + '</span>';
      html += '</div>';

      html += '<div class="qaproof-dp-days">';
      // Previous month padding
      for (var p = firstDay - 1; p >= 0; p--) {
        var pd = daysInPrev - p;
        html += '<button type="button" class="qaproof-dp-day other-month" data-y="' + (viewMonth === 0 ? viewYear - 1 : viewYear) + '" data-m="' + (viewMonth === 0 ? 11 : viewMonth - 1) + '" data-d="' + pd + '">' + pd + '</button>';
      }
      // Current month
      for (var d = 1; d <= daysInMonth; d++) {
        var dateStr = viewYear + '-' + pad(viewMonth + 1) + '-' + pad(d);
        var cls = 'qaproof-dp-day';
        if (dateStr === todayStr) cls += ' today';
        if (dateStr === selStr && !isNowMode) cls += ' selected';
        html += '<button type="button" class="' + cls + '" data-y="' + viewYear + '" data-m="' + viewMonth + '" data-d="' + d + '">' + d + '</button>';
      }
      // Next month padding
      var totalCells = firstDay + daysInMonth;
      var remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      for (var n = 1; n <= remaining; n++) {
        html += '<button type="button" class="qaproof-dp-day other-month" data-y="' + (viewMonth === 11 ? viewYear + 1 : viewYear) + '" data-m="' + (viewMonth === 11 ? 0 : viewMonth + 1) + '" data-d="' + n + '">' + n + '</button>';
      }
      html += '</div>';

      // Time row
      var roundedMin = selectedMinute - (selectedMinute % 5);
      html += '<div class="qaproof-dp-time">';
      html += '<label>Time</label>';
      html += '<div class="qaproof-dp-scroll-wrap">';
      html += '<div class="qaproof-dp-scroll" data-role="hour">';
      for (var h = 0; h < 24; h++) html += '<div class="qaproof-dp-scroll-item' + (h === selectedHour ? ' selected' : '') + '" data-val="' + h + '">' + pad(h) + '</div>';
      html += '</div></div>';
      html += '<span class="qaproof-dp-colon">:</span>';
      html += '<div class="qaproof-dp-scroll-wrap">';
      html += '<div class="qaproof-dp-scroll" data-role="minute">';
      for (var mi = 0; mi < 60; mi += 5) html += '<div class="qaproof-dp-scroll-item' + (mi === roundedMin ? ' selected' : '') + '" data-val="' + mi + '">' + pad(mi) + '</div>';
      html += '</div></div>';
      html += '</div>';

      // Actions
      html += '<div class="qaproof-dp-actions">';
      html += '<button type="button" class="qaproof-dp-btn-now">Now</button>';
      html += '<button type="button" class="qaproof-dp-btn-apply">Apply</button>';
      html += '</div>';

      dropdown.innerHTML = html;

      // Wire events
      dropdown.querySelectorAll('.qaproof-dp-nav').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var dir = parseInt(b.dataset.dir, 10);
          viewMonth += dir;
          if (viewMonth < 0) { viewMonth = 11; viewYear--; }
          if (viewMonth > 11) { viewMonth = 0; viewYear++; }
          render();
        });
      });

      dropdown.querySelectorAll('.qaproof-dp-day').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          isNowMode = false;
          selectedDate = new Date(parseInt(b.dataset.y), parseInt(b.dataset.m), parseInt(b.dataset.d));
          viewYear = selectedDate.getFullYear();
          viewMonth = selectedDate.getMonth();
          render();
        });
      });

      // Wire scroll time selectors
      dropdown.querySelectorAll('.qaproof-dp-scroll').forEach(function (scroller) {
        var role = scroller.dataset.role;
        var selItem = scroller.querySelector('.selected');
        if (selItem) selItem.scrollIntoView({ block: 'center' });

        scroller.querySelectorAll('.qaproof-dp-scroll-item').forEach(function (item) {
          item.addEventListener('click', function (e) {
            e.stopPropagation();
            scroller.querySelectorAll('.qaproof-dp-scroll-item').forEach(function (s) { s.classList.remove('selected'); });
            item.classList.add('selected');
            isNowMode = false;
            if (role === 'hour') selectedHour = parseInt(item.dataset.val, 10);
            if (role === 'minute') selectedMinute = parseInt(item.dataset.val, 10);
          });
        });
      });

      var nowBtn = dropdown.querySelector('.qaproof-dp-btn-now');
      if (nowBtn) nowBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        isNowMode = true;
        selectedDate = new Date();
        selectedHour = selectedDate.getHours();
        selectedMinute = selectedDate.getMinutes();
        viewYear = selectedDate.getFullYear();
        viewMonth = selectedDate.getMonth();
        updateLabel();
        dropdown.classList.add('hidden');
      });

      var applyBtn = dropdown.querySelector('.qaproof-dp-btn-apply');
      if (applyBtn) applyBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (isNowMode) {
          selectedDate = new Date();
          selectedHour = selectedDate.getHours();
          selectedMinute = selectedDate.getMinutes();
        }
        updateLabel();
        dropdown.classList.add('hidden');
      });
    }

    function positionDropdown() {
      var rect = trigger.getBoundingClientRect();
      dropdown.style.maxHeight = '';
      var dpH = dropdown.scrollHeight;
      var vpH = window.innerHeight;
      var top;
      var spaceAbove = rect.top - 10;
      var spaceBelow = vpH - rect.bottom - 10;

      if (spaceAbove >= dpH) {
        top = rect.top - dpH - 6;
      } else if (spaceBelow >= dpH) {
        top = rect.bottom + 6;
      } else if (spaceAbove > spaceBelow) {
        top = 10;
        dropdown.style.maxHeight = (rect.top - 16) + 'px';
      } else {
        top = rect.bottom + 6;
        dropdown.style.maxHeight = (vpH - rect.bottom - 16) + 'px';
      }
      dropdown.style.top = top + 'px';
      dropdown.style.left = rect.left + 'px';
    }

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (dropdown.classList.contains('hidden')) {
        render();
        dropdown.classList.remove('hidden');
        positionDropdown();
      } else {
        dropdown.classList.add('hidden');
      }
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) {
        updateLabel();
        dropdown.classList.add('hidden');
      }
    });

    return {
      set: function (date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) { this.setNow(); return; }
        isNowMode = false;
        selectedDate = date;
        selectedHour = date.getHours();
        selectedMinute = date.getMinutes();
        viewYear = date.getFullYear();
        viewMonth = date.getMonth();
        updateLabel();
      },
      setNow: function () {
        isNowMode = true;
        selectedDate = new Date();
        selectedHour = selectedDate.getHours();
        selectedMinute = selectedDate.getMinutes();
        viewYear = selectedDate.getFullYear();
        viewMonth = selectedDate.getMonth();
        updateLabel();
      },
      getValue: function () {
        if (isNowMode) return '';
        return selectedDate.getFullYear() + '-' + pad(selectedDate.getMonth() + 1) + '-' + pad(selectedDate.getDate()) + ' ' + pad(selectedHour) + ':' + pad(selectedMinute) + ':00';
      }
    };
  })();
  // ---- End Datepicker ----

  /**
   * Updates the "Add Monitor" button to reflect the current plan quota.
   * When at the limit: shows a quota badge next to the button.
   * When under the limit: removes any existing badge.
   */
  function updateAddMonitorBtnState() {
    if (!addMonitorBtn) return;
    var atLimit = monitorsQuota.limit < 999 && monitorsQuota.used >= monitorsQuota.limit;
    var existingBadge = document.getElementById('qaproof-monitor-limit-badge');

    if (atLimit) {
      if (!existingBadge) {
        var badge = document.createElement('span');
        badge.id = 'qaproof-monitor-limit-badge';
        badge.style.cssText = 'margin-left:10px;font-size:12px;color:#f87171;font-weight:500;';
        badge.textContent = '(' + monitorsQuota.used + '/' + monitorsQuota.limit + ' — limit reached)';
        addMonitorBtn.parentNode.insertBefore(badge, addMonitorBtn.nextSibling);
      }
    } else {
      if (existingBadge) existingBadge.remove();
    }
  }

  if (monitorsListEl) {
    initMonitorsPage();
  }

  function initMonitorsPage() {
    loadMonitors();
    clearAdminMenuBadge();

    if (addMonitorBtn) {
      addMonitorBtn.addEventListener('click', function () {
        if (monitorsQuota.used >= monitorsQuota.limit) {
          showToast(
            'Monitor limit reached (' + monitorsQuota.used + '/' + monitorsQuota.limit + '). Upgrade your plan to add more monitors.',
            'error'
          );
          return;
        }
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

    // On fresh navigation (not a reload), clear saved monitor so the nav link always
    // shows the monitors list, never a stale detail view.
    try {
      var navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      var isReload = navEntry ? navEntry.type === 'reload' : (performance.navigation && performance.navigation.type === 1);
      if (!isReload) { sessionStorage.removeItem('qaproof_open_monitor'); }
    } catch(e) {}

    // Handle browser back/forward navigation
    window.addEventListener('popstate', function (evt) {
      if (evt.state && evt.state.monitorId) {
        showMonitorDetail(evt.state.monitorId, false, true);
      } else {
        stopMonitorPoll();
        try { sessionStorage.removeItem('qaproof_open_monitor'); } catch(e2) {}
        if (monitorDetail) {
          monitorDetail.classList.add('hidden');
          monitorDetail.innerHTML = '';
        }
        if (monitorsListEl) monitorsListEl.classList.remove('hidden');
        if (addMonitorBtn) addMonitorBtn.classList.remove('hidden');
        if (monitorsLoading) monitorsLoading.classList.add('hidden');
        loadMonitors(true);
      }
    });

    // Check if URL has monitor_id param to show detail
    var urlParams = new URLSearchParams(window.location.search);
    var monitorId = urlParams.get('monitor_id');
    if (monitorId) {
      showMonitorDetail(monitorId);
    }
  }

  /**
   * Clear the WP admin "QAProof — 20" menu badge whenever the user opens the
   * Monitors page. The badge counts how many monitor regressions scored
   * below threshold since it was last cleared, and the natural "I've seen
   * the alerts" moment is when the user lands on the page that shows them.
   *
   * Two-step: POST to the REST clear-endpoint (so the WP transient counter
   * resets server-side, the next page render won't re-emit the badge), and
   * yank the .awaiting-mod span out of the sidebar so the user sees the
   * count disappear immediately without waiting for a full reload.
   */
  function clearAdminMenuBadge() {
    apiCall('POST', '/notifications/clear').catch(function () { /* best-effort */ });

    var menu = document.getElementById('adminmenu');
    if (!menu) return;
    // The Monitors submenu anchor has href ending with page=qaproof-monitors.
    // We strip the .awaiting-mod span only from there (and not from the
    // parent QAProof anchor that contains "page=qaproof" as a substring).
    var anchors = menu.querySelectorAll('a[href*="page=qaproof-monitors"]');
    anchors.forEach(function (a) {
      var badge = a.querySelector('.awaiting-mod');
      if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    });
  }

  function apiCall(method, path, body) {
    // Some hosting providers block DELETE and PUT at the server level.
    // WordPress supports X-HTTP-Method-Override to tunnel these via POST.
    var tunneled = (method === 'DELETE' || method === 'PUT');
    var opts = {
      method: tunneled ? 'POST' : method,
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': qaproof.nonce,
      },
      credentials: 'same-origin',
    };
    if (tunneled) opts.headers['X-HTTP-Method-Override'] = method;
    if (body) opts.body = JSON.stringify(body);
    // Guard: if Q or Q.safeJson is not yet available, fall back to basic JSON parser.
    var parser = (Q && Q.safeJson) ? Q.safeJson : function (r) { return r.json(); };
    return fetch(qaproof.restBase + path, opts).then(parser);
  }

  function loadMonitors(silent) {
    if (!silent) {
      if (monitorsLoading) monitorsLoading.classList.remove('hidden');
      if (monitorsListEl) monitorsListEl.innerHTML = '';
    }

    apiCall('GET', '/monitors').then(function (resp) {
      if (monitorsLoading) monitorsLoading.classList.add('hidden');
      if (!resp.success) {
        var errMsg = (resp.error && resp.error.message) ? resp.error.message : 'Failed to load monitors.';
        // Escape API error string before injecting into innerHTML — the SaaS
        // controls this field today, but defending against the field carrying
        // any HTML/script in the future is what wp.org reviewers expect.
        if (monitorsListEl) monitorsListEl.innerHTML = '<p class="qaproof-monitors-empty">' + Q.escapeHtml(errMsg) + '</p>';
        return;
      }
      // Store plan quota for use in showMonitorForm / addMonitorBtn click
      if (resp.meta) {
        monitorsQuota.used  = resp.meta.used  || 0;
        monitorsQuota.limit = resp.meta.limit || 999;
      }
      updateAddMonitorBtnState();
      // Restore detail view after a page reload
      var savedId = null;
      try { savedId = sessionStorage.getItem('qaproof_open_monitor'); } catch(e) {}
      if (savedId) {
        // Populate in-memory cache so the detail view can render instantly.
        // Do this even if we skip calling showMonitorDetail below.
        if (resp.data && resp.data.length) {
          resp.data.forEach(function (m) { monitorsCache[String(m.id)] = m; });
        }
        // If the URL already has monitor_id set to this same monitor, the
        // URL-param block above (initMonitorsPage) already called
        // showMonitorDetail. Calling it a second time would stop the running
        // poll and restart it from scratch, causing visible flicker and a race
        // condition where the stale-run guard can fire prematurely.
        var urlMonitorId = null;
        try { urlMonitorId = new URLSearchParams(window.location.search).get('monitor_id'); } catch(e) {}
        if (!urlMonitorId || String(urlMonitorId) !== String(savedId)) {
          showMonitorDetail(savedId);
        }
        return;
      }
      renderMonitorsList(resp.data);
    }).catch(function (err) {
      if (monitorsLoading) monitorsLoading.classList.add('hidden');
      var msg = (err && err.message) ? err.message : 'Failed to load monitors.';
      // Escape network-error string before injecting into innerHTML.
      if (monitorsListEl) monitorsListEl.innerHTML = '<p class="qaproof-monitors-empty">' + Q.escapeHtml(msg) + '</p>';
    });
  }

  function formatNextRun(nextRunAt, isEnabled) {
    if (!isEnabled) return '';
    if (!nextRunAt || nextRunAt === '0000-00-00 00:00:00') return '';
    try {
      var d = new Date(nextRunAt.replace(' ', 'T') + 'Z');
      var now = Date.now();
      var diff = d.getTime() - now;
      if (isNaN(diff)) return '';
      if (diff < 0) return 'Soon';
      var mins = Math.round(diff / 60000);
      if (mins < 60) return 'in ' + mins + 'm';
      var hrs = Math.round(diff / 3600000);
      if (hrs < 24) return 'in ' + hrs + 'h';
      var days = Math.round(diff / 86400000);
      return 'in ' + days + 'd';
    } catch(e) { return ''; }
  }

  function renderMonitorsList(monitors) {
    if (!monitorsListEl) return;

    // Rebuild in-memory cache so detail view can render instantly on click
    monitorsCache = {};
    if (monitors && monitors.length) {
      monitors.forEach(function (m) { monitorsCache[String(m.id)] = m; });
    }

    if (!monitors || monitors.length === 0) {
      monitorsListEl.innerHTML = '<p class="qaproof-monitors-empty">' + (qaproof.i18n.noMonitors || 'No monitors yet. Click "Add Monitor" to get started.') + '</p>';
      return;
    }

    var html = '<div class="qaproof-monitors-grid">';

    for (var i = 0; i < monitors.length; i++) {
      var m = monitors[i];
      var hasBaseline  = parseInt(m.has_baseline, 10);
      var isEnabled    = parseInt(m.is_enabled, 10);
      var lastScore    = m.last_score != null ? parseInt(m.last_score, 10) : null;

      // Check if a background job (baseline or regression) is currently running for this card.
      // isRunQueued() uses the server-side WP transient — authoritative, survives page reloads.
      // hasActivePendingRun() is kept as a fallback for the brief window between the user
      // clicking the button and the next list refresh bringing fresh server data.
      var isPendingRun = isRunQueued(m) || hasActivePendingRun(m.id);

      // Badge
      var badgeClass, badgeLabel;
      if (isPendingRun && !hasBaseline) {
        badgeClass = 'qaproof-badge-running';
        badgeLabel = 'Setting up';
      } else if (isPendingRun && hasBaseline) {
        badgeClass = 'qaproof-badge-running';
        badgeLabel = 'Running';
      } else if (!hasBaseline) {
        badgeClass = 'qaproof-badge-setup';
        badgeLabel = 'Setup needed';
      } else if (!isEnabled) {
        badgeClass = 'qaproof-badge-paused';
        badgeLabel = 'Paused';
      } else {
        badgeClass = 'qaproof-badge-active';
        badgeLabel = 'Active';
      }

      // Card stripe colour
      var cardVariant = isPendingRun ? 'qaproof-card-running' : (!hasBaseline ? 'qaproof-card-setup' : (!isEnabled ? 'qaproof-card-paused' : 'qaproof-card-active'));

      // Run button
      var runBtnCls, runBtnLabel, runBtnDisabled;
      if (isPendingRun) {
        runBtnCls      = 'button qaproof-run-monitor qaproof-btn-running';
        runBtnLabel    = '⟳ Running';
        runBtnDisabled = ' disabled';
      } else if (!hasBaseline) {
        runBtnCls      = 'button qaproof-run-monitor qaproof-btn-setup';
        runBtnLabel    = 'Set Up';
        runBtnDisabled = '';
      } else {
        runBtnCls      = 'button qaproof-run-monitor';
        runBtnLabel    = qaproof.i18n.monitorBtnRun || 'Check Now';
        runBtnDisabled = !isEnabled ? ' disabled' : '';
      }

      // URL parts
      var domain = m.page_url, path2 = '';
      try {
        var u = new URL(m.page_url);
        domain = u.hostname;
        path2  = u.pathname !== '/' ? u.pathname : '';
      } catch(e) {}

      // Score display
      var scoreClass = '';
      var scoreDisplay = '—';
      if (lastScore !== null) {
        scoreClass = Q.getScoreClass(lastScore);
        scoreDisplay = lastScore;
      }

      // Next run
      var nextRunStr = formatNextRun(m.next_run_at, isEnabled);

      // Schedule icon + text
      var schedText = Q.capitalize(m.schedule);
      var schedIcon = m.schedule === 'daily' ? '↻' : (m.schedule === 'weekly' ? '◷' : '◑');

      var domainInitial = domain ? domain.charAt(0).toUpperCase() : '?';

      html += '<div class="qaproof-monitor-card ' + cardVariant + '" data-id="' + m.id + '">';

      html += '<div class="qaproof-mc-body">';

      html += '<div class="qaproof-mc-left">';
      // No external favicon fetch — monitored sites are third-party origins
      // from the WP admin's perspective. Loading <img src="https://<site>/
      // favicon.ico"> from each would leak the admin's IP + UA to every
      // monitored site and trip the wp.org plugin-check "no external
      // requests" guideline (commit 0e56a29 already removed the equivalent
      // Google s2 favicons fetch for the same reason). The CSS uses the
      // data-initial letter as the badge instead.
      html += '<div class="qaproof-mc-favicon" data-initial="' + Q.escapeHtml(domainInitial) + '"></div>';
      html += '<div class="qaproof-mc-url-info">';
      // Top row: domain + badge
      html += '<div class="qaproof-mc-top-row">';
      html += '<a href="#" class="qaproof-monitor-detail-link qaproof-mc-domain" data-id="' + m.id + '">' + Q.escapeHtml(domain) + '</a>';
      html += '<span class="qaproof-monitor-badge ' + badgeClass + '">' + badgeLabel + '</span>';
      html += '</div>';
      // Path
      if (path2) {
        html += '<div class="qaproof-mc-path">' + Q.escapeHtml(path2) + '</div>';
      }
      // Meta chips row
      html += '<div class="qaproof-mc-chips">';
      html += '<span class="qaproof-mc-chip">' + schedIcon + ' ' + Q.escapeHtml(schedText) + '</span>';
      if (nextRunStr) {
        html += '<span class="qaproof-mc-chip qaproof-mc-chip-muted">⏱ ' + Q.escapeHtml(nextRunStr) + '</span>';
      }
      if (!hasBaseline) {
        html += '<span class="qaproof-mc-chip qaproof-mc-chip-warn">No baseline</span>';
      }
      html += '</div>';
      html += '</div>'; // .qaproof-mc-url-info
      html += '</div>'; // .qaproof-mc-left

      // Right: score circle
      html += '<div class="qaproof-mc-score-wrap">';
      html += '<div class="qaproof-mc-score-circle ' + scoreClass + '">';
      html += '<span class="qaproof-mc-score-num">' + scoreDisplay + '</span>';
      html += '</div>';
      html += '<div class="qaproof-mc-score-label">Last score</div>';
      html += '</div>'; // .qaproof-mc-score-wrap

      html += '</div>'; // .qaproof-mc-body

      // ── Card footer: actions ──
      html += '<div class="qaproof-mc-footer">';
      html += '<div class="qaproof-mc-actions">';
      var toggleBusyCls = isPendingRun ? ' qaproof-mc-btn-busy' : '';
      var toggleEnableCls = (!isPendingRun && !isEnabled) ? ' qaproof-mc-btn-enable' : '';
      var toggleBusyAttr = isPendingRun ? ' data-busy="1"' : '';
      html += '<button type="button" class="qaproof-mc-action-btn qaproof-toggle-monitor' + toggleBusyCls + toggleEnableCls + '" data-id="' + m.id + '" data-enabled="' + m.is_enabled + '"' + toggleBusyAttr + '>' + (isEnabled ? 'Pause' : 'Enable') + '</button>';
      html += '<button type="button" class="qaproof-mc-action-btn qaproof-edit-monitor" data-id="' + m.id + '">Edit</button>';
      html += '<button type="button" class="qaproof-mc-action-btn qaproof-mc-action-delete qaproof-delete-monitor" data-id="' + m.id + '">Delete</button>';
      html += '</div>';
      html += '<button type="button" class="' + runBtnCls + ' qaproof-mc-run-btn" data-id="' + m.id + '" data-has-baseline="' + (hasBaseline ? '1' : '0') + '"' + runBtnDisabled + '>' + runBtnLabel + '</button>';
      html += '</div>'; // .qaproof-mc-footer

      html += '</div>'; // .qaproof-monitor-card
    }

    html += '</div>';
    monitorsListEl.innerHTML = html;

    // Bind card click → detail view
    monitorsListEl.querySelectorAll('.qaproof-monitor-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('[disabled]')) return;
        showMonitorDetail(card.dataset.id);
      });
    });

    monitorsListEl.querySelectorAll('.qaproof-monitor-detail-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        showMonitorDetail(this.dataset.id);
      });
    });

    monitorsListEl.querySelectorAll('.qaproof-run-monitor').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        runMonitor(this.dataset.id, this);
      });
    });

    monitorsListEl.querySelectorAll('.qaproof-toggle-monitor').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (this.dataset.busy) return;
        toggleMonitor(this.dataset.id, parseInt(this.dataset.enabled, 10));
      });
    });

    monitorsListEl.querySelectorAll('.qaproof-edit-monitor').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        editMonitor(this.dataset.id);
      });
    });

    monitorsListEl.querySelectorAll('.qaproof-delete-monitor').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteMonitor(this.dataset.id, this);
      });
    });

    // Start background polling for any monitors that have a pending run
    startListPolling(monitors);
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
    var notifyOnSelect = document.getElementById('qaproof-monitor-notify-on');

    if (monitor) {
      if (titleEl) titleEl.textContent = qaproof.i18n.monitorFormTitleEdit || 'Edit Monitor';
      if (editIdEl) editIdEl.value = monitor.id;
      if (urlInput) urlInput.value = monitor.page_url;
      if (scheduleSelect) scheduleSelect.value = monitor.schedule;
      if (monitor.scheduled_at) {
        qaproofDatepicker.set(new Date(monitor.scheduled_at.replace(' ', 'T')));
      } else {
        qaproofDatepicker.setNow();
      }
      if (thresholdInput) thresholdInput.value = monitor.threshold_score;
      if (notifyEmailCb) notifyEmailCb.checked = parseInt(monitor.notify_email, 10) === 1;
      if (notifyAdminCb) notifyAdminCb.checked = parseInt(monitor.notify_admin, 10) === 1;
      if (notifyOnSelect) notifyOnSelect.value = monitor.notify_on || 'failures';
    } else {
      if (titleEl) titleEl.textContent = qaproof.i18n.monitorFormTitleAdd || 'Add Monitor';
      if (editIdEl) editIdEl.value = '';
      if (urlInput) urlInput.value = '';
      if (scheduleSelect) scheduleSelect.value = 'daily';
      qaproofDatepicker.setNow();
      if (thresholdInput) thresholdInput.value = qaproof.defaultThreshold || 90;
      if (notifyEmailCb) notifyEmailCb.checked = true;
      if (notifyAdminCb) notifyAdminCb.checked = true;
      if (notifyOnSelect) notifyOnSelect.value = 'failures';
    }

    monitorFormWrap.classList.remove('hidden');
    requestAnimationFrame(function () {
      monitorFormWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (urlInput) urlInput.focus({ preventScroll: true });
    });
  }

  function hideMonitorForm() {
    if (monitorFormWrap) monitorFormWrap.classList.add('hidden');
    // Scroll the "Add Monitor" button back into view.
    // scrollIntoView is the only reliable way to target the WP admin scroll container.
    // block:'center' ensures the button lands in the middle of the viewport,
    // well clear of the sticky WP admin bar.
    if (addMonitorBtn) {
      requestAnimationFrame(function () {
        addMonitorBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  function saveMonitor() {
    var editId = document.getElementById('qaproof-monitor-edit-id').value;
    var data = {
      page_url: document.getElementById('qaproof-monitor-url').value.trim(),
      schedule: document.getElementById('qaproof-monitor-schedule').value,
      scheduled_at: qaproofDatepicker.getValue(),
      threshold_score: parseInt(document.getElementById('qaproof-monitor-threshold').value, 10),
      notify_email: document.getElementById('qaproof-monitor-notify-email').checked ? 1 : 0,
      notify_admin: document.getElementById('qaproof-monitor-notify-admin').checked ? 1 : 0,
      notify_on: (document.getElementById('qaproof-monitor-notify-on') || {}).value || 'failures',
    };

    if (!data.page_url) return;

    // Validate URL format — must be http(s) with a real hostname
    try {
      var parsed = new URL(data.page_url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
      if (!parsed.hostname || parsed.hostname.indexOf('.') === -1) throw new Error();
    } catch (e) {
      var urlInput = document.getElementById('qaproof-monitor-url');
      if (urlInput) {
        urlInput.classList.add('qaproof-input-error');
        urlInput.focus();
        setTimeout(function () { urlInput.classList.remove('qaproof-input-error'); }, 2500);
      }
      showToast(qaproof.i18n.monitorInvalidUrl || 'Please enter a valid URL (e.g. https://example.com)', 'error');
      return;
    }

    var method = editId ? 'PUT' : 'POST';
    var path = editId ? '/monitors/' + editId : '/monitors';

    // Client-side duplicate check for new monitors (instant feedback, no server round-trip)
    if (!editId) {
      var normalizedNew = data.page_url.toLowerCase().replace(/\/$/, '');
      var cards = document.querySelectorAll('.qaproof-monitor-card');
      for (var ci = 0; ci < cards.length; ci++) {
        var cardId = cards[ci].dataset.id;
        // Get URL from the domain link text + path span
        var domainEl = cards[ci].querySelector('.qaproof-mc-domain');
        var pathEl   = cards[ci].querySelector('.qaproof-mc-path');
        if (domainEl) {
          var existingUrl = (domainEl.textContent + (pathEl ? pathEl.textContent : '')).toLowerCase().replace(/\/$/, '');
          if (existingUrl && normalizedNew.indexOf(existingUrl) !== -1) {
            showToast(qaproof.i18n.monitorDuplicateUrl || 'A monitor for this URL already exists.', 'error');
            return;
          }
        }
      }
    }

    apiCall(method, path, data).then(function (resp) {
      if (resp.success) {
        hideMonitorForm();
        loadMonitors(true);
        showToast(editId
          ? (qaproof.i18n.monitorUpdated || 'Монітор оновлено.')
          : (qaproof.i18n.monitorCreated || 'Монітор додано.'),
          'success');
      } else {
        var msg = (resp.error && resp.error.message) || (qaproof.i18n.monitorSaveFailed || 'Failed to save monitor.');
        showToast(msg, 'error');
      }
    }).catch(function (err) {
      var msg = (err && err.message) || (qaproof.i18n.monitorSaveFailed || 'Failed to save monitor.');
      showToast(msg, 'error');
    });
  }

  function editMonitor(id) {
    apiCall('GET', '/monitors/' + id).then(function (resp) {
      if (resp.success) {
        showMonitorForm(resp.data);
      }
    });
  }

  function rebindCardFooter(footer, id) {
    var tb = footer.querySelector('.qaproof-toggle-monitor');
    var eb = footer.querySelector('.qaproof-edit-monitor');
    var db = footer.querySelector('.qaproof-delete-monitor');
    var rb = footer.querySelector('.qaproof-run-monitor');
    if (tb) tb.addEventListener('click', function(e) { e.stopPropagation(); if (!this.dataset.busy) toggleMonitor(id, parseInt(this.dataset.enabled, 10)); });
    if (eb) eb.addEventListener('click', function(e) { e.stopPropagation(); editMonitor(id); });
    if (db) db.addEventListener('click', function(e) { e.stopPropagation(); deleteMonitor(id, this); });
    if (rb) rb.addEventListener('click', function(e) { e.stopPropagation(); runMonitor(id, this); });
  }

  function deleteMonitor(id, btn) {
    var footer = btn ? btn.closest('.qaproof-mc-footer') : null;
    if (!footer) return;

    // Save original HTML so Cancel can restore instantly (no API call)
    var savedHTML = footer.innerHTML;

    // Localized strings come from qaproof.i18n.* (set in class-admin-assets.php).
    // Fall back to English literals (not Ukrainian) so an unlocalized build
    // is still readable in any English-locale WP install.
    var confirmText = qaproof.i18n.monitorDeleteConfirm || 'Delete this monitor and all its results?';
    var yesText     = qaproof.i18n.monitorDeleteYes    || 'Delete';
    var noText      = qaproof.i18n.monitorDeleteNo     || 'Cancel';
    var deletedTpl  = qaproof.i18n.monitorDeleted      || 'Monitor for %s was deleted.';

    footer.innerHTML =
      '<div class="qaproof-inline-confirm">' +
      '<span>' + Q.escapeHtml(confirmText) + '</span>' +
      '<div class="qaproof-inline-confirm-btns">' +
      '<button type="button" class="qaproof-inline-confirm-yes">' + Q.escapeHtml(yesText) + '</button>' +
      '<button type="button" class="qaproof-inline-confirm-no">' + Q.escapeHtml(noText) + '</button>' +
      '</div>' +
      '</div>';

    footer.querySelector('.qaproof-inline-confirm-yes').addEventListener('click', function () {
      var card = footer.closest('.qaproof-monitor-card');
      var domainEl = card ? card.querySelector('.qaproof-mc-domain') : null;
      var domainName = domainEl ? domainEl.textContent : 'Monitor';
      apiCall('DELETE', '/monitors/' + id).then(function (resp) {
        if (resp.success) {
          // domainName comes from card.textContent (DOM-side, safe text), but
          // escape defensively before injecting into showToast's innerHTML.
          var msg = deletedTpl.indexOf('%s') !== -1
            ? deletedTpl.replace('%s', Q.escapeHtml(domainName))
            : Q.escapeHtml(domainName) + ' — ' + Q.escapeHtml(deletedTpl);
          showToast(msg, 'success');
          loadMonitors(true);
        } else {
          footer.innerHTML = savedHTML;
          rebindCardFooter(footer, id);
          // API error string is escaped before injection.
          showToast(Q.escapeHtml((resp.error && resp.error.message) || 'Failed to delete monitor.'), 'error');
        }
      }).catch(function () {
        footer.innerHTML = savedHTML;
        rebindCardFooter(footer, id);
        showToast('Failed to delete monitor.', 'error');
      });
    });

    footer.querySelector('.qaproof-inline-confirm-no').addEventListener('click', function () {
      footer.innerHTML = savedHTML;
      rebindCardFooter(footer, id);
    });
  }

  function toggleMonitor(id, currentEnabled) {
    apiCall('PUT', '/monitors/' + id, { is_enabled: currentEnabled ? 0 : 1 }).then(function (resp) {
      if (resp.success) loadMonitors(true);
    });
  }

  function stopCapturingAnimation() {
    capturingStepTimers.forEach(function (t) { clearTimeout(t); });
    capturingStepTimers = [];
  }

  function startCapturingAnimation(monitorId) {
    stopCapturingAnimation();
    var checkSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var steps = [
      { delay: 0,     stepId: 1, text: 'Taking screenshot…',    sub: 'This may take 30–60 seconds', completes: null },
      { delay: 20000, stepId: 2, text: 'Processing screenshot…', sub: 'Almost done',                     completes: 1 },
      { delay: 42000, stepId: 3, text: 'Saving baseline…',       sub: 'Finishing up',                    completes: 2 },
    ];

    // Save start time on first call; resume from elapsed on reload
    var storageKey = 'qaproof_run_start_' + monitorId;
    var startTime;
    try {
      var saved = sessionStorage.getItem(storageKey);
      startTime = saved ? parseInt(saved, 10) : Date.now();
      if (!saved) sessionStorage.setItem(storageKey, startTime);
    } catch(e) { startTime = Date.now(); }
    var elapsed = Date.now() - startTime;

    function applyStep(s) {
      if (s.completes) {
        for (var c = 1; c <= s.completes; c++) {
          var ps = document.getElementById('qaproof-cap-step-' + c);
          var pc = document.getElementById('qaproof-cap-conn-' + c);
          if (ps) {
            ps.classList.remove('active'); ps.classList.add('completed');
            var ind = ps.querySelector('.qaproof-step-indicator');
            if (ind) ind.innerHTML = checkSvg;
          }
          if (pc) pc.classList.add('completed');
        }
      }
      var el = document.getElementById('qaproof-cap-step-' + s.stepId);
      if (el) { el.classList.remove('completed'); el.classList.add('active'); }
      var tx = document.getElementById('qaproof-capturing-text');
      if (tx) tx.textContent = s.text;
      var sb = document.getElementById('qaproof-capturing-sub');
      if (sb) sb.textContent = s.sub;
    }

    steps.forEach(function (s) {
      var remaining = s.delay - elapsed;
      if (remaining <= 0) {
        // Already past this step — apply immediately (last one wins)
        applyStep(s);
      } else {
        capturingStepTimers.push(setTimeout(function () { applyStep(s); }, remaining));
      }
    });
  }

  function startRegressionAnimation(monitorId) {
    stopCapturingAnimation();
    var checkSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var steps = [
      { delay: 0,     stepId: 1, text: 'Taking screenshot…',        sub: 'This may take 30–60 seconds',                  completes: null },
      { delay: 25000, stepId: 2, text: 'Comparing with baseline…',  sub: 'Analyzing visual differences',                 completes: 1 },
      { delay: 55000, stepId: 3, text: 'Generating report…',        sub: 'Almost done',                                  completes: 2 },
    ];

    var storageKey = 'qaproof_run_start_' + monitorId;
    var startTime;
    try {
      var saved = sessionStorage.getItem(storageKey);
      startTime = saved ? parseInt(saved, 10) : Date.now();
      if (!saved) sessionStorage.setItem(storageKey, startTime);
    } catch(e) { startTime = Date.now(); }
    var elapsed = Date.now() - startTime;

    function applyStep(s) {
      if (s.completes) {
        for (var c = 1; c <= s.completes; c++) {
          var ps = document.getElementById('qaproof-reg-step-' + c);
          var pc = document.getElementById('qaproof-reg-conn-' + c);
          if (ps) {
            ps.classList.remove('active'); ps.classList.add('completed');
            var ind = ps.querySelector('.qaproof-step-indicator');
            if (ind) ind.innerHTML = checkSvg;
          }
          if (pc) pc.classList.add('completed');
        }
      }
      var el = document.getElementById('qaproof-reg-step-' + s.stepId);
      if (el) { el.classList.remove('completed'); el.classList.add('active'); }
      var tx = document.getElementById('qaproof-reg-text');
      if (tx) tx.textContent = s.text;
      var sb = document.getElementById('qaproof-reg-sub');
      if (sb) sb.textContent = s.sub;
    }

    steps.forEach(function (s) {
      var remaining = s.delay - elapsed;
      if (remaining <= 0) {
        applyStep(s);
      } else {
        capturingStepTimers.push(setTimeout(function () { applyStep(s); }, remaining));
      }
    });
  }

  function stopMonitorPoll() {
    if (monitorPollTimer) {
      clearTimeout(monitorPollTimer);
      monitorPollTimer = null;
    }
    monitorPollCount = 0;
    stopCapturingAnimation();
  }

  // ---- List-mode background polling ----
  // Runs silently in the list view while a baseline or regression job is in progress.
  // On completion it calls loadMonitors() to refresh the card state.

  // Returns true if monitor has an active pending run within the stale window.
  // If the run started > 8 min ago, treats it as a failed/dead run, clears the
  // session flags, and fires a one-time error toast so the user knows why the
  // "Running" indicator vanished.
  var STALE_RUN_MS = 15 * 60 * 1000;

  // Returns true if the server reports a run was queued for this monitor
  // within the past 25 minutes (matches the PHP transient TTL).
  // This is the AUTHORITATIVE check — survives page reloads and new tabs.
  function isRunQueued(monitor) {
    if (!monitor || !monitor.run_queued_at) return false;
    try {
      var elapsed = Date.now() - new Date(monitor.run_queued_at).getTime();
      return elapsed >= 0 && elapsed <= STALE_RUN_MS;
    } catch(e) { return false; }
  }

  function hasActivePendingRun(monitorId) {
    try {
      if (!sessionStorage.getItem('qaproof_pending_run_' + monitorId)) return false;
      var startedAt = parseInt(sessionStorage.getItem('qaproof_run_start_' + monitorId), 10);
      if (!startedAt || (Date.now() - startedAt) <= STALE_RUN_MS) return true;

      // Stale — clean up and warn (once per monitor per browser tab)
      sessionStorage.removeItem('qaproof_pending_run_' + monitorId);
      sessionStorage.removeItem('qaproof_run_start_' + monitorId);
      var warnKey = 'qaproof_run_stale_warned_' + monitorId;
      if (!sessionStorage.getItem(warnKey)) {
        sessionStorage.setItem(warnKey, '1');
        setTimeout(function () {
          showToast('A monitor run started ' + Math.round((Date.now() - startedAt) / 60000) +
            ' min ago never completed. The job likely failed on the server. Try running it again.',
            'error');
        }, 200);
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // Show a slide-in toast notification (auto-dismisses after 5s).
  //
  // CONTRACT: `message` and `actionLabel` are written via innerHTML so they
  // MAY contain plugin-static markup like `<strong>` for emphasis. Any
  // API-supplied or user-controlled value the caller wants to embed MUST be
  // passed through Q.escapeHtml() at the CALL SITE before being concatenated
  // into `message`. All current callers comply; new callers should follow
  // the same pattern (see grep `showToast(` for examples).
  function showToast(message, type, onAction, actionLabel) {
    type = type || 'success';
    var existing = document.getElementById('qaproof-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'qaproof-toast';
    toast.className = 'qaproof-toast qaproof-toast-' + type;
    // Live-region semantics. Errors get role="alert" (assertive — interrupts
    // SR), success/info get role="status" (polite — queued). Without this
    // SR users hear nothing when a toast appears.
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');

    var icon = type === 'success' ? '✓' : '✕';
    toast.innerHTML =
      '<span class="qaproof-toast-icon">' + icon + '</span>' +
      '<span class="qaproof-toast-msg">' + message + '</span>' +
      (onAction && actionLabel
        ? '<button type="button" class="qaproof-toast-action">' + actionLabel + '</button>'
        : '') +
      '<button type="button" class="qaproof-toast-close">&times;</button>';

    document.body.appendChild(toast);

    if (onAction && actionLabel) {
      toast.querySelector('.qaproof-toast-action').addEventListener('click', function () {
        toast.remove();
        onAction();
      });
    }
    toast.querySelector('.qaproof-toast-close').addEventListener('click', function () {
      toast.classList.add('qaproof-toast-out');
      setTimeout(function () { toast.remove(); }, 350);
    });

    // Auto-dismiss after 6s
    var autoDismiss = setTimeout(function () {
      if (toast.parentNode) {
        toast.classList.add('qaproof-toast-out');
        setTimeout(function () { toast.remove(); }, 350);
      }
    }, 6000);

    toast.addEventListener('mouseenter', function () { clearTimeout(autoDismiss); });
  }

  function stopListPolling() {
    Object.keys(listPollTimers).forEach(function (id) {
      clearTimeout(listPollTimers[id]);
    });
    listPollTimers = {};
  }

  function stopListPollForMonitor(monitorId) {
    if (listPollTimers[monitorId]) {
      clearTimeout(listPollTimers[monitorId]);
      delete listPollTimers[monitorId];
    }
  }

  // Poll GET /monitors/:id until has_baseline becomes 1, then reload the list.
  function pollBaselineInList(monitorId, attempts) {
    attempts = attempts || 0;
    if (attempts > LIST_POLL_MAX) {
      // Timed out — clear session key and reload
      try {
        sessionStorage.removeItem('qaproof_pending_run_' + monitorId);
        sessionStorage.removeItem('qaproof_run_start_' + monitorId);
      } catch(e) {}
      stopListPollForMonitor(monitorId);
      loadMonitors(true);
      return;
    }
    // Ping wp-cron from browser every 3rd attempt so the queued monitor run fires reliably
    if (attempts % 3 === 0) {
      try { fetch('/wp-cron.php?doing_wp_cron=' + (Date.now() / 1000).toFixed(6)); } catch(e) {}
    }
    listPollTimers[monitorId] = setTimeout(function () {
      delete listPollTimers[monitorId];
      apiCall('GET', '/monitors/' + monitorId).then(function (resp) {
        if (resp.success && resp.data && parseInt(resp.data.has_baseline, 10) === 1) {
          try {
            sessionStorage.removeItem('qaproof_pending_run_' + monitorId);
            sessionStorage.removeItem('qaproof_run_start_' + monitorId);
          } catch(e) {}
          var pageUrl = (resp.data && resp.data.page_url) ? resp.data.page_url : '';
          try { pageUrl = new URL(pageUrl).hostname; } catch(e) {}
          // pageUrl is API-supplied — escape before injecting into the toast's
          // innerHTML so a maliciously-crafted page_url can't introduce script
          // tags. URL().hostname normally strips most dangerous chars, but the
          // catch-block fallback keeps the raw value on parse failure.
          showToast(
            '✓ Baseline captured! <strong>' + Q.escapeHtml(pageUrl) + '</strong> is now being monitored.',
            'success',
            function () { showMonitorDetail(monitorId); },
            'Run First Test'
          );
          loadMonitors(true);
        } else {
          pollBaselineInList(monitorId, attempts + 1);
        }
      }).catch(function () {
        pollBaselineInList(monitorId, attempts + 1);
      });
    }, 5000);
  }

  // Poll GET /monitors/:id/results until total exceeds expectedCount, then reload the list.
  function pollResultInList(monitorId, expectedCount, attempts, lastRunAtBefore) {
    attempts = attempts || 0;
    if (attempts > LIST_POLL_MAX) {
      try {
        sessionStorage.removeItem('qaproof_pending_run_' + monitorId);
        sessionStorage.removeItem('qaproof_run_start_' + monitorId);
      } catch(e) {}
      stopListPollForMonitor(monitorId);
      loadMonitors(true);
      return;
    }
    // Ping wp-cron from browser every 3rd attempt so the queued monitor run fires reliably
    if (attempts % 3 === 0) {
      try { fetch('/wp-cron.php?doing_wp_cron=' + (Date.now() / 1000).toFixed(6)); } catch(e) {}
    }
    var sep = (qaproof.restBase.indexOf('?') !== -1) ? '&' : '?';
    listPollTimers[monitorId] = setTimeout(function () {
      delete listPollTimers[monitorId];
      apiCall('GET', '/monitors/' + monitorId + '/results' + sep + 'limit=1').then(function (resp) {
        var newTotal = (resp.success && resp.total) ? resp.total : 0;
        if (newTotal > expectedCount) {
          try {
            sessionStorage.removeItem('qaproof_pending_run_' + monitorId);
            sessionStorage.removeItem('qaproof_run_start_' + monitorId);
          } catch(e) {}
          var score = (resp.data && resp.data[0] && resp.data[0].score != null) ? resp.data[0].score : null;
          // Numeric coerce + escape — score should be an integer from the API,
          // but treating it as untrusted defends against any future shape
          // drift (e.g. API starts returning "n/a" as a string).
          var scoreStr = score !== null ? ' Score: <strong>' + Q.escapeHtml(String(score)) + '</strong>' : '';
          showToast(
            'Regression test completed.' + scoreStr,
            'success',
            function () { showMonitorDetail(monitorId); },
            'View Result'
          );
          loadMonitors(true);
        } else if (attempts >= 5 && lastRunAtBefore) {
          // Fallback: check last_run_at directly in case result-count never updates
          // (e.g. monitors_save_result failed but scheduler still updated last_run_at)
          apiCall('GET', '/monitors/' + monitorId).then(function (mResp) {
            var mon = mResp.success && mResp.data;
            if (mon && mon.last_run_at && mon.last_run_at !== lastRunAtBefore) {
              try {
                sessionStorage.removeItem('qaproof_pending_run_' + monitorId);
                sessionStorage.removeItem('qaproof_run_start_' + monitorId);
              } catch(e) {}
              showToast('Monitor run finished. Refreshing…', 'info');
              loadMonitors(true);
            } else {
              pollResultInList(monitorId, expectedCount, attempts + 1, lastRunAtBefore);
            }
          }).catch(function () {
            pollResultInList(monitorId, expectedCount, attempts + 1, lastRunAtBefore);
          });
        } else {
          pollResultInList(monitorId, expectedCount, attempts + 1, lastRunAtBefore);
        }
      }).catch(function () {
        pollResultInList(monitorId, expectedCount, attempts + 1, lastRunAtBefore);
      });
    }, 5000);
  }

  // Called by renderMonitorsList — starts background polls for any monitors with pending runs.
  function startListPolling(monitors) {
    stopListPolling();
    monitors.forEach(function (m) {
      // Use server-side run_queued_at as primary signal; sessionStorage as fallback.
      if (!isRunQueued(m) && !hasActivePendingRun(m.id)) return;

      if (!parseInt(m.has_baseline, 10)) {
        // Baseline capture in progress
        pollBaselineInList(m.id, 0);
      } else {
        // Regression run in progress — fetch current result count first, then poll for increase
        var sep = (qaproof.restBase.indexOf('?') !== -1) ? '&' : '?';
        var lastRunAtBefore = m.last_run_at || null;
        apiCall('GET', '/monitors/' + m.id + '/results' + sep + 'limit=1').then(function (resp) {
          var currentCount = (resp.success && resp.total) ? resp.total : 0;
          pollResultInList(m.id, currentCount, 0, lastRunAtBefore);
        }).catch(function () {
          pollResultInList(m.id, 0, 0, lastRunAtBefore);
        });
      }
    });
  }
  // ---- End list-mode polling ----

  // Show a success state after baseline capture completes in the detail view.
  function showBaselineSuccess(monitorId) {
    if (!monitorDetail) return;

    monitorDetail.innerHTML =
      '<div class="qaproof-baseline-success">' +
        '<div class="qaproof-baseline-success-icon">✓</div>' +
        '<h3>Baseline captured!</h3>' +
        '<p>Your monitoring is now active. Run the first regression test to start tracking visual changes.</p>' +
        '<div class="qaproof-baseline-success-actions">' +
          '<button type="button" id="qaproof-success-run" class="button button-primary">Run First Test</button>' +
          '<button type="button" id="qaproof-success-back" class="button">&larr; Back to Monitors</button>' +
        '</div>' +
      '</div>';

    document.getElementById('qaproof-success-back').addEventListener('click', function () {
      try { sessionStorage.removeItem('qaproof_open_monitor'); } catch(e) {}
      monitorDetail.classList.add('hidden');
      monitorDetail.innerHTML = '';
      if (monitorsListEl) monitorsListEl.classList.remove('hidden');
      if (addMonitorBtn) addMonitorBtn.classList.remove('hidden');
      loadMonitors(true);
    });

    document.getElementById('qaproof-success-run').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Starting…';

      try {
        sessionStorage.removeItem('qaproof_run_start_' + monitorId);
        sessionStorage.removeItem('qaproof_run_stale_warned_' + monitorId);
        sessionStorage.setItem('qaproof_pending_run_' + monitorId, '1');
        sessionStorage.setItem('qaproof_run_start_' + monitorId, String(Date.now()));
      } catch(e) {}

      apiCall('POST', '/monitors/' + monitorId + '/run').then(function (resp) {
        if (resp.success) {
          // Navigate to detail view in poll mode — will show live progress
          showMonitorDetail(monitorId, true);
        } else {
          btn.disabled = false;
          btn.textContent = 'Run First Test';
          try { sessionStorage.removeItem('qaproof_pending_run_' + monitorId); } catch(e) {}
          var errMsg = (resp.error && resp.error.message) || (qaproof.i18n.monitorRunFailed || 'Failed to start test. Please try again.');
          showToast(Q.escapeHtml(errMsg), 'error');
        }
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Run First Test';
        try { sessionStorage.removeItem('qaproof_pending_run_' + monitorId); } catch(e) {}
        var errMsg = (err && err.message) || (qaproof.i18n.monitorRunFailed || 'Failed to start test. Please try again.');
        showToast(Q.escapeHtml(errMsg), 'error');
      });
    });
  }

  // Poll GET /monitors/:id until has_baseline === 1 (used for first-time baseline capture).
  // Baseline creation does NOT create a result row, so pollForMonitorResult would never detect it.
  function pollForBaseline(monitorId) {
    monitorPollCount++;
    if (monitorPollCount > monitorPollMaxAttempts) {
      stopMonitorPoll();
      try {
        sessionStorage.removeItem('qaproof_pending_run_' + monitorId);
        sessionStorage.removeItem('qaproof_run_start_' + monitorId);
      } catch(e) {}
      stopCapturingAnimation();
      var loadingText = document.getElementById('qaproof-monitors-loading-text');
      if (loadingText) loadingText.textContent = qaproof.i18n.monitorTimeout || 'Test timed out. Check back later.';
      var runBtn = document.getElementById('qaproof-detail-run');
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = (qaproof.i18n.monitorBtnRun || 'Check Now'); }
      return;
    }

    // Ping wp-cron from the browser every 3 attempts (~15s) so the queued
    // monitor run fires reliably even when WP's own cron tick is delayed.
    if (monitorPollCount % 3 === 1) {
      try { fetch('/wp-cron.php?doing_wp_cron=' + (Date.now() / 1000).toFixed(6)); } catch(e) {}
    }

    apiCall('GET', '/monitors/' + monitorId).then(function (resp) {
      if (resp.success && resp.data && parseInt(resp.data.has_baseline, 10) === 1) {
        // Baseline saved — complete step 3 and reload detail
        stopMonitorPoll();
        try {
          sessionStorage.removeItem('qaproof_pending_run_' + monitorId);
          sessionStorage.removeItem('qaproof_run_start_' + monitorId);
        } catch(e) {}
        stopCapturingAnimation();
        showBaselineSuccess(monitorId);
        return;
      }
      // Not ready yet — retry in 5s
      monitorPollTimer = setTimeout(function () {
        pollForBaseline(monitorId);
      }, 5000);
    }).catch(function () {
      monitorPollTimer = setTimeout(function () {
        pollForBaseline(monitorId);
      }, 5000);
    });
  }

  function pollForMonitorResult(monitorId, expectedResultCount) {
    monitorPollCount++;
    if (monitorPollCount > monitorPollMaxAttempts) {
      stopMonitorPoll();
      try {
        sessionStorage.removeItem('qaproof_pending_run_' + monitorId);
        sessionStorage.removeItem('qaproof_run_start_' + monitorId);
      } catch(e) {}
      // Update UI to show timeout
      var loadingText = document.getElementById('qaproof-monitors-loading-text');
      if (loadingText) loadingText.textContent = qaproof.i18n.monitorTimeout || 'Test timed out. Check back later.';
      var runBtn = document.getElementById('qaproof-detail-run');
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = (qaproof.i18n.monitorBtnRun || 'Check Now'); }
      // Hide loading after a moment
      setTimeout(function () {
        if (monitorsLoading) monitorsLoading.classList.add('hidden');
      }, 3000);
      return;
    }

    // Ping wp-cron from the browser every 3 attempts (~15s) so the queued
    // monitor run fires reliably even when WP's own cron tick is delayed.
    if (monitorPollCount % 3 === 1) {
      try { fetch('/wp-cron.php?doing_wp_cron=' + (Date.now() / 1000).toFixed(6)); } catch(e) {}
    }

    // Use & separator when restBase already contains ? (rest_route= format), else ?
    var sep = (qaproof.restBase.indexOf('?') !== -1) ? '&' : '?';
    apiCall('GET', '/monitors/' + monitorId + '/results' + sep + 'limit=1').then(function (resp) {
      if (resp.success && resp.data && resp.data.length > 0) {
        var latestResult = resp.data[0];
        var newTotal = resp.total || 0;
        // Check if we got a NEW result (total increased)
        if (newTotal > expectedResultCount) {
          stopMonitorPoll();
          try {
            sessionStorage.removeItem('qaproof_pending_run_' + monitorId);
            sessionStorage.removeItem('qaproof_run_start_' + monitorId);
          } catch(e) {}
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

  // Bulk setups hit the API's per-workspace concurrency cap (429). We keep the
  // card "running" and retry on an interval so each monitor gets its turn as a
  // slot frees, instead of erroring out. ~20 × 8s ≈ 2.5 min of patience.
  var MONITOR_RUN_MAX_RETRIES = 20;
  var MONITOR_RUN_RETRY_MS    = 8000;

  function runMonitor(id, btn, attempt) {
    attempt = attempt || 0;
    var hasBaseline = btn && btn.dataset.hasBaseline === '1';
    // Add running animation to the card immediately so the gradient stripe
    // appears on click — not 2-3 s later after the POST round-trips and
    // loadMonitors() re-renders. The list now uses .qaproof-monitor-card,
    // not the legacy `tr[data-id]` rows; targeting that class is what makes
    // qaproof-card-running's ::before/::after animation kick in.
    var card = btn ? btn.closest('.qaproof-monitor-card') : null;
    if (card) {
      card.classList.add('qaproof-card-running');
      card.classList.remove('qaproof-card-setup', 'qaproof-card-paused', 'qaproof-card-active');
    }

    if (btn) {
      btn.disabled = true;
      // Mirror the post-render running state immediately so the user sees
      // the running label on click instead of a bare spinner that's then
      // replaced once loadMonitors() finishes round-tripping. Strip any
      // sibling state classes so we don't end up with "running setup" etc.
      btn.classList.remove('qaproof-btn-setup', 'qaproof-btn-active', 'qaproof-btn-paused');
      btn.classList.add('qaproof-btn-running');
      btn.textContent = qaproof.i18n.monitorBtnRunning || '⟳ Running';
    }

    var sep = (qaproof.restBase.indexOf('?') !== -1) ? '&' : '?';

    // Before running a regression check, snapshot the current result count so
    // pollResultInList knows when a new result appears.
    var getResultCount = hasBaseline
      ? apiCall('GET', '/monitors/' + id + '/results' + sep + 'limit=1')
          .then(function (r) { return (r.success && r.total) ? r.total : 0; })
          .catch(function () { return 0; })
      : Promise.resolve(0);

    // Mark the run as pending IMMEDIATELY — before the POST fires — so that
    // if the user opens the monitor detail view while the long baseline capture
    // (~20s) is still in flight, hasActivePendingRun() returns true and the
    // detail view shows the loading block straight away.
    try {
      sessionStorage.setItem('qaproof_pending_run_' + id, '1');
      sessionStorage.setItem('qaproof_run_start_' + id, String(Date.now()));
    } catch(e) {}

    // Roll back the optimistic running state (card stripe + button label +
    // sessionStorage) when the POST fails to start a run.
    function rollbackRunningState() {
      if (card) card.classList.remove('qaproof-card-running');
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('qaproof-btn-running');
        btn.textContent = hasBaseline
          ? (qaproof.i18n.monitorBtnRun   || 'Check Now')
          : (qaproof.i18n.monitorBtnSetup || 'Set Up');
      }
      try {
        sessionStorage.removeItem('qaproof_pending_run_' + id);
        sessionStorage.removeItem('qaproof_run_start_' + id);
      } catch(e) {}
    }

    getResultCount.then(function (resultCount) {
      return apiCall('POST', '/monitors/' + id + '/run').then(function (resp) {
        if (resp.success) {
          // Store pre-run result count so detail view can detect completion at render time
          try {
            if (hasBaseline) {
              sessionStorage.setItem('qaproof_pre_run_count_' + id, String(resultCount));
            }
          } catch(e) {}
          loadMonitors(true);

          var jobId = resp.data && resp.data.job_id;

          if (jobId) {
            // Both setup (baseline capture) and Check Now (regression) now run
            // as async jobs. Poll the API job, then call finish-run — the PHP
            // handler stamps has_baseline for a baseline result, or saves a
            // result row for a regression result.
            Q.startJobPolling(jobId, {
              page: 'monitors',
              onDone: function (result) {
                apiCall('POST', '/monitors/' + id + '/finish-run', {
                  job_id: jobId,
                  result: result,
                }).then(function () {
                  try {
                    sessionStorage.removeItem('qaproof_pending_run_' + id);
                    sessionStorage.removeItem('qaproof_run_start_' + id);
                    sessionStorage.removeItem('qaproof_pre_run_count_' + id);
                  } catch(e) {}
                  loadMonitors(true);
                  // Refresh detail view if it's open for this monitor.
                  var openId;
                  try { openId = sessionStorage.getItem('qaproof_open_monitor'); } catch(e) {}
                  if (openId && String(openId) === String(id)) {
                    showMonitorDetail(id);
                  }
                }).catch(function () {
                  rollbackRunningState();
                  Q.alert(qaproof.i18n.monitorRunFailed || 'Failed to save result.');
                });
              },
              onFailed: function (errMsg) {
                rollbackRunningState();
                Q.alert(errMsg || (qaproof.i18n.monitorRunFailed || 'Check Now failed.'));
              },
            });
          } else if (!hasBaseline) {
            // Legacy fallback (older API without a baseline job): poll until
            // has_baseline flips to 1.
            pollBaselineInList(id);
          } else {
            // Legacy fallback (older API without a job id): poll the DB.
            pollResultInList(id, resultCount, 0, null);
          }
        } else {
          // Per-workspace concurrency cap (429). Expected during bulk setups —
          // keep the card "running" and retry after a delay so each monitor
          // gets its turn instead of surfacing an error.
          var code = resp.error && resp.error.code;
          if (code === 'CONCURRENCY_LIMIT' && attempt < MONITOR_RUN_MAX_RETRIES) {
            setTimeout(function () { runMonitor(id, btn, attempt + 1); }, MONITOR_RUN_RETRY_MS);
            return;
          }
          rollbackRunningState();
          Q.alert((resp.error && resp.error.message) || (qaproof.i18n.monitorRunFailed || 'Failed to run monitor.'));
        }
      });
    }).catch(function () {
      rollbackRunningState();
    });
  }

  function showMonitorDetail(id, shouldPoll, fromPopstate) {
    if (!monitorDetail) return;
    // Survive page reloads — remember which monitor is open
    try { sessionStorage.setItem('qaproof_open_monitor', id); } catch(e) {}
    // Quick optimistic check from sessionStorage — only set shouldPoll to true,
    // never to false, and NEVER fire the stale toast here. The stale toast fires
    // later (after server data arrives) when the server also confirms no active run.
    // This prevents a false "never completed" error from showing before we know
    // the server's authoritative state.
    if (!shouldPoll) {
      try {
        if (sessionStorage.getItem('qaproof_pending_run_' + id)) shouldPoll = true;
      } catch(e) {}
    }

    // Push history state so browser back button returns to monitors list
    if (!fromPopstate) {
      try {
        var cleanParams = new URLSearchParams(window.location.search);
        cleanParams.set('monitor_id', id);
        history.pushState({ monitorId: id }, '', window.location.pathname + '?' + cleanParams.toString());
      } catch(e) {}
    }

    // Stop any active polling
    stopMonitorPoll();
    if (monitorsLoading) monitorsLoading.classList.add('hidden');

    function switchToDetail(html) {
      monitorDetail.innerHTML = html;
      if (monitorsListEl) monitorsListEl.classList.add('hidden');
      if (addMonitorBtn) addMonitorBtn.classList.add('hidden');
      monitorDetail.classList.remove('hidden');
    }

    // ── Instant render from cache ──────────────────────────────────────────────
    // If we already have this monitor's data (from the list), render the detail
    // header + a results skeleton immediately — no waiting. Then fetch only the
    // results in the background and swap in the real content when it arrives.
    // This eliminates the 1-2s blank/wait before the detail appears.
    var cachedMonitor = monitorsCache[String(id)];
    if (cachedMonitor) {
      // Render header + skeleton immediately
      renderMonitorDetail(cachedMonitor, null /* skeleton mode */, 0, shouldPoll, switchToDetail);
    }

    // Bail to error view if API doesn't respond within 20s
    var detailLoadTimeout = setTimeout(function () {
      try { sessionStorage.removeItem('qaproof_open_monitor'); } catch(e) {}
      var errorHtml =
        '<div style="padding:32px;text-align:center;">' +
          '<p style="color:#9ca3af;margin-bottom:16px;">Could not load monitor — server is busy. Please try again.</p>' +
          '<button type="button" id="qaproof-detail-error-back" class="button">&larr; ' + (qaproof.i18n.monitorBackToList || 'Back to Monitors') + '</button>' +
        '</div>';
      switchToDetail(errorHtml);
      var errBack = document.getElementById('qaproof-detail-error-back');
      if (errBack) errBack.addEventListener('click', function () {
        monitorDetail.classList.add('hidden');
        monitorDetail.innerHTML = '';
        if (monitorsListEl) monitorsListEl.classList.remove('hidden');
        if (addMonitorBtn) addMonitorBtn.classList.remove('hidden');
        loadMonitors(true);
      });
    }, 20000);

    // Fetch monitor data + results. When we have a cached monitor, only results
    // are strictly needed — but we still fetch the monitor too to get fresh
    // last_score / has_baseline in case it changed since the list loaded.
    Promise.all([
      cachedMonitor
        ? Promise.resolve({ success: true, data: cachedMonitor })
        : apiCall('GET', '/monitors/' + id),
      apiCall('GET', '/monitors/' + id + '/results'),
    ]).then(function (results) {
      clearTimeout(detailLoadTimeout);
      var monitorResp = results[0];
      var resultsResp = results[1];

      if (!monitorResp.success) {
        try { sessionStorage.removeItem('qaproof_open_monitor'); } catch(e) {}
        var notFoundHtml =
          '<div style="padding:32px;text-align:center;">' +
            '<p style="color:#9ca3af;margin-bottom:16px;">' + (qaproof.i18n.monitorNotFound || 'Monitor not found.') + '</p>' +
            '<button type="button" id="qaproof-detail-notfound-back" class="button">&larr; ' + (qaproof.i18n.monitorBackToList || 'Back to Monitors') + '</button>' +
          '</div>';
        switchToDetail(notFoundHtml);
        var nfBack = document.getElementById('qaproof-detail-notfound-back');
        if (nfBack) nfBack.addEventListener('click', function () {
          monitorDetail.classList.add('hidden');
          monitorDetail.innerHTML = '';
          if (monitorsListEl) monitorsListEl.classList.remove('hidden');
          if (addMonitorBtn) addMonitorBtn.classList.remove('hidden');
          loadMonitors(true);
        });
        return;
      }

      var totalResults = resultsResp.total || (resultsResp.data ? resultsResp.data.length : 0);

      // ── Server-driven run state (primary signal) ───────────────────────────
      // The PHP handler injects run_queued_at into every GET /monitors/:id
      // response. This WP transient is set when the user triggers a run and
      // deleted by the scheduler when the job finishes — so it survives page
      // reloads, multiple tabs, and any sessionStorage loss.
      var serverRunActive = isRunQueued(monitorResp.data);

      if (serverRunActive) {
        // Server confirms a run is in progress — always start polling.
        shouldPoll = true;
        // Keep sessionStorage in sync so animation timers have a start time.
        try {
          if (!sessionStorage.getItem('qaproof_pending_run_' + id)) {
            sessionStorage.setItem('qaproof_pending_run_' + id, '1');
          }
          if (!sessionStorage.getItem('qaproof_run_start_' + id)) {
            // Use the server's queue time as the animation start reference.
            var queuedMs = new Date(monitorResp.data.run_queued_at).getTime();
            sessionStorage.setItem('qaproof_run_start_' + id, String(queuedMs || Date.now()));
          }
        } catch(e) {}
      } else {
        // Server says no active run.
        if (shouldPoll) {
          // sessionStorage thought there was a run — check if it's stale and
          // fire the "never completed" toast if needed (now safe to call since
          // the server confirmed the run is not actually in progress).
          shouldPoll = hasActivePendingRun(id);
        }

        // Race-condition guard: if shouldPoll is true (sessionStorage says a run
        // is in progress) but fetched data already shows the result appeared,
        // the run finished — don't show the loader.
        if (shouldPoll) {
          var preRunCount = null;
          try { preRunCount = parseInt(sessionStorage.getItem('qaproof_pre_run_count_' + id), 10); } catch(e) {}
          if (!isNaN(preRunCount) && totalResults > preRunCount) {
            shouldPoll = false;
            try {
              sessionStorage.removeItem('qaproof_pending_run_' + id);
              sessionStorage.removeItem('qaproof_run_start_' + id);
              sessionStorage.removeItem('qaproof_pre_run_count_' + id);
            } catch(e) {}
          }
        }
      }

      // Render (or re-render) with real results data
      renderMonitorDetail(monitorResp.data, resultsResp.success ? resultsResp.data : [], totalResults, shouldPoll, switchToDetail);
    }).catch(function () {
      clearTimeout(detailLoadTimeout);
      try { sessionStorage.removeItem('qaproof_open_monitor'); } catch(e) {}
      var catchHtml =
        '<div style="padding:32px;text-align:center;">' +
          '<p style="color:#9ca3af;margin-bottom:16px;">Failed to load monitor. Check your connection and try again.</p>' +
          '<button type="button" id="qaproof-detail-catch-back" class="button">&larr; ' + (qaproof.i18n.monitorBackToList || 'Back to Monitors') + '</button>' +
        '</div>';
      switchToDetail(catchHtml);
      var catchBack = document.getElementById('qaproof-detail-catch-back');
      if (catchBack) catchBack.addEventListener('click', function () {
        monitorDetail.classList.add('hidden');
        monitorDetail.innerHTML = '';
        if (monitorsListEl) monitorsListEl.classList.remove('hidden');
        if (addMonitorBtn) addMonitorBtn.classList.remove('hidden');
        loadMonitors(true);
      });
    });
  }


  function renderMonitorDetail(monitor, monitorResults, totalResultCount, shouldPoll, switchToDetail) {
    if (!monitorDetail) return;
    // Stop any poll that might have been started by a previous skeleton render
    // so we don't get duplicate polling loops when real data replaces the skeleton.
    if (monitorResults !== null) stopMonitorPoll();
    // If no switchToDetail helper provided (e.g. called after poll refresh), use direct assignment
    if (!switchToDetail) {
      switchToDetail = function(h) {
        monitorDetail.innerHTML = h;
        if (monitorsListEl) monitorsListEl.classList.add('hidden');
        if (addMonitorBtn) addMonitorBtn.classList.add('hidden');
        monitorDetail.classList.remove('hidden');
      };
    }

    // Compute early — needed for both the header button and the loading block below
    var pollHasBaseline = parseInt(monitor.has_baseline, 10);
    var isSettingUp = shouldPoll && !pollHasBaseline;

    var html = '';
    html += '<div class="qaproof-detail-header">';
    html += '  <button type="button" id="qaproof-back-to-list" class="button">&larr; ' + (qaproof.i18n.monitorBackToList || 'Back to Monitors') + '</button>';
    html += '  <h2>' + Q.escapeHtml(monitor.page_url) + '</h2>';
    html += '  <div class="qaproof-detail-meta">';
    var detailSchedule = Q.capitalize(monitor.schedule);
    if (monitor.scheduled_at) {
      var saD = new Date(monitor.scheduled_at.replace(' ', 'T'));
      if (!isNaN(saD.getTime()) && saD > new Date()) {
        detailSchedule += ' (starts ' + formatDate(monitor.scheduled_at) + ')';
      }
    }
    html += '    <span>Schedule: <strong>' + Q.escapeHtml(detailSchedule) + '</strong></span>';
    html += '    <span>Threshold: <strong>' + monitor.threshold_score + '</strong></span>';
    html += '    <span>Last Score: <strong class="' + Q.getScoreClass(parseInt(monitor.last_score, 10)) + '">' + (monitor.last_score != null ? monitor.last_score : '—') + '</strong></span>';
    html += '  </div>';
    // Button: disabled while any job is in progress or monitor is paused
    var isPaused = !parseInt(monitor.is_enabled, 10);
    var runBtnDisabled = (shouldPoll || isPaused) ? ' disabled' : '';
    var runBtnText = isSettingUp
      ? (qaproof.i18n.monitorSettingUp || 'Setting up...')
      : (shouldPoll ? (qaproof.i18n.monitorRunning || 'Running...') : (!pollHasBaseline ? 'Set Up' : (qaproof.i18n.monitorBtnRun || 'Check Now')));
    html += '  <button type="button" id="qaproof-detail-run" class="button button-primary" data-id="' + monitor.id + '"' + runBtnDisabled + '>' + runBtnText + '</button>';
    html += '</div>';

    // Results timeline
    // monitorResults === null means "skeleton mode" — data not yet fetched.
    // Render a shimmer placeholder; the real content will be swapped in shortly.
    html += '<h3>' + (qaproof.i18n.monitorResultsHistory || 'Results History') + '</h3>';
    if (monitorResults === null) {
      html += '<div class="qaproof-results-loading"><div class="qaproof-results-loading-spinner"></div></div>';
    } else if (monitorResults.length === 0) {
      html += '<p class="qaproof-monitors-empty">' + (qaproof.i18n.monitorNoResults || 'No results yet. Click "Run Now" to run the first check.') + '</p>';
    } else {
      html += '<div class="qaproof-results-timeline">';
      for (var i = 0; i < monitorResults.length; i++) {
        var r = monitorResults[i];
        var rScoreClass = r.score != null ? Q.getScoreClass(parseInt(r.score, 10)) : '';
        var statusBadge = '';
        if (r.status === 'failed') statusBadge = '<span class="qaproof-badge qaproof-badge-high">Failed</span>';
        else if (r.status === 'approved') statusBadge = '<span class="qaproof-badge qaproof-badge-approved">Approved</span>';

        html += '<div class="qaproof-result-row" data-result-id="' + r.id + '">';
        html += '  <span class="qaproof-result-date">' + Q.escapeHtml(formatDate(r.run_date)) + '</span>';
        html += '  <span class="qaproof-result-score ' + rScoreClass + '">' + (r.score != null ? r.score : '—') + '</span>';
        html += '  ' + statusBadge;
        html += '  <span class="qaproof-result-summary">' + Q.escapeHtml(truncate(r.summary || (r.error_message || ''), 80)) + '</span>';
        if (r.status === 'completed' && parseInt(r.has_changes, 10)) {
          html += '  <button type="button" class="button button-small qaproof-approve-result" data-id="' + r.id + '">' + (qaproof.i18n.monitorApproveChanges || 'Approve Changes') + '</button>';
        }
        html += '  <button type="button" class="button button-small qaproof-view-result" data-id="' + r.id + '">' + (qaproof.i18n.monitorView || 'View') + '</button>';
        html += '</div>';
      }
      html += '</div>';
    }

    // Inline loading block — always rendered (hidden by default).
    // Shown when a baseline or regression job is running.
    // The animation functions look for these IDs so they must be in the DOM.
    var loadingBlockStyle = shouldPoll ? '' : ' style="display:none"';
    html += '<div class="qaproof-capturing-state" id="qaproof-loading-block"' + loadingBlockStyle + '>';
    html += '<div class="qaproof-loading-inner">';
    html += '<div class="qaproof-loading-left">';
    html += '<div class="qaproof-loading-spinner"></div>';
    html += '<div class="qaproof-loading-info">';
    if (!pollHasBaseline) {
      html += '<p class="qaproof-capturing-text" id="qaproof-capturing-text">Taking screenshot…</p>';
      html += '<p class="qaproof-capturing-sub" id="qaproof-capturing-sub">This may take 30–60 seconds</p>';
    } else {
      html += '<p class="qaproof-capturing-text" id="qaproof-reg-text">Taking screenshot…</p>';
      html += '<p class="qaproof-capturing-sub" id="qaproof-reg-sub">This may take 30–60 seconds</p>';
    }
    html += '</div></div>'; // close .qaproof-loading-info + .qaproof-loading-left
    html += '<div class="qaproof-loading-steps">';
    if (!pollHasBaseline) {
      html += '<div class="qaproof-loading-step" id="qaproof-cap-step-1"><div class="qaproof-step-indicator">1</div><span class="qaproof-step-label">Screenshot</span></div>';
      html += '<div class="qaproof-step-connector" id="qaproof-cap-conn-1"></div>';
      html += '<div class="qaproof-loading-step" id="qaproof-cap-step-2"><div class="qaproof-step-indicator">2</div><span class="qaproof-step-label">Process</span></div>';
      html += '<div class="qaproof-step-connector" id="qaproof-cap-conn-2"></div>';
      html += '<div class="qaproof-loading-step" id="qaproof-cap-step-3"><div class="qaproof-step-indicator">3</div><span class="qaproof-step-label">Save</span></div>';
    } else {
      html += '<div class="qaproof-loading-step" id="qaproof-reg-step-1"><div class="qaproof-step-indicator">1</div><span class="qaproof-step-label">Screenshot</span></div>';
      html += '<div class="qaproof-step-connector" id="qaproof-reg-conn-1"></div>';
      html += '<div class="qaproof-loading-step" id="qaproof-reg-step-2"><div class="qaproof-step-indicator">2</div><span class="qaproof-step-label">Compare</span></div>';
      html += '<div class="qaproof-step-connector" id="qaproof-reg-conn-2"></div>';
      html += '<div class="qaproof-loading-step" id="qaproof-reg-step-3"><div class="qaproof-step-indicator">3</div><span class="qaproof-step-label">Report</span></div>';
    }
    html += '</div>'; // close .qaproof-loading-steps
    html += '</div></div>'; // close .qaproof-loading-inner + #qaproof-loading-block

    html += '<div id="qaproof-result-detail"></div>';

    switchToDetail(html);

    // In skeleton mode (monitorResults === null) we rendered the header immediately
    // from cache but results haven't loaded yet. Don't start polling here — the
    // second renderMonitorDetail call (with real results) will start it.
    if (monitorResults === null) return;

    if (shouldPoll) {
      if (!pollHasBaseline) {
        // First-time setup: poll until has_baseline === 1
        startCapturingAnimation(monitor.id);
        pollForBaseline(monitor.id);
      } else {
        // Regression run: poll until a new result row appears
        startRegressionAnimation(monitor.id);
        pollForMonitorResult(monitor.id, totalResultCount || 0);
      }
    }

    var backBtn = document.getElementById('qaproof-back-to-list');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        stopMonitorPoll();
        try { sessionStorage.removeItem('qaproof_open_monitor'); } catch(e) {}
        try {
          var listParams = new URLSearchParams(window.location.search);
          listParams.delete('monitor_id');
          var newSearch = listParams.toString();
          history.pushState({}, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));
        } catch(e) {}
        monitorDetail.classList.add('hidden');
        monitorDetail.innerHTML = '';
        if (monitorsListEl) monitorsListEl.classList.remove('hidden');
        if (addMonitorBtn) addMonitorBtn.classList.remove('hidden');
        if (monitorsLoading) monitorsLoading.classList.add('hidden');
        loadMonitors();
      });
    }

    var runBtn = document.getElementById('qaproof-detail-run');
    if (runBtn) {
      runBtn.addEventListener('click', function () {
        stopMonitorPoll();
        runBtn.disabled = true;
        runBtn.textContent = qaproof.i18n.monitorRunning || 'Running...';

        // Show the inline loading block without re-rendering the entire detail
        var loadingBlock = document.getElementById('qaproof-loading-block');
        if (loadingBlock) loadingBlock.style.display = '';

        // Always write a fresh start timestamp so hasActivePendingRun()
        // doesn't see a stale value from a previous run and fire a false
        // "never completed" error on the next page refresh.
        // Also clear the old stale-warned guard so the warning can fire
        // again if this new run genuinely fails.
        try {
          sessionStorage.removeItem('qaproof_run_start_' + monitor.id);
          sessionStorage.removeItem('qaproof_run_stale_warned_' + monitor.id);
          sessionStorage.setItem('qaproof_pending_run_' + monitor.id, '1');
          sessionStorage.setItem('qaproof_run_start_' + monitor.id, String(Date.now()));
        } catch(e) {}

        // Use the correct animation for each run type
        if (!pollHasBaseline) {
          startCapturingAnimation(monitor.id);
        } else {
          startRegressionAnimation(monitor.id);
        }

        // Restore the run button + loading UI on any failure path.
        function detailRunFailed(msg) {
          runBtn.disabled = false;
          runBtn.textContent = (qaproof.i18n.monitorBtnRun || 'Run Now');
          if (loadingBlock) loadingBlock.style.display = 'none';
          stopCapturingAnimation();
          try { sessionStorage.removeItem('qaproof_pending_run_' + monitor.id); } catch(e) {}
          if (msg) showToast(Q.escapeHtml(msg), 'error');
        }

        apiCall('POST', '/monitors/' + monitor.id + '/run').then(function (resp) {
          if (!resp.success) {
            detailRunFailed((resp.error && resp.error.message) || (qaproof.i18n.monitorRunFailed || 'Failed to run monitor.'));
            return;
          }

          var jobId = resp.data && resp.data.job_id;
          if (!jobId) {
            // Legacy fallback (older API without a job id): poll the DB.
            pollForMonitorResult(monitor.id, totalResultCount || 0);
            return;
          }

          // Both setup (baseline capture) and Check Now (regression) run as
          // async jobs. Poll the job, then call finish-run — the PHP handler
          // marks has_baseline for a baseline result or saves a result row for
          // a regression result. (The old DB-poll path hung on baseline runs
          // because a baseline produces no result row.)
          Q.startJobPolling(jobId, {
            page: 'monitors',
            onDone: function (result) {
              apiCall('POST', '/monitors/' + monitor.id + '/finish-run', {
                job_id: jobId,
                result: result,
              }).then(function () {
                try {
                  sessionStorage.removeItem('qaproof_pending_run_' + monitor.id);
                  sessionStorage.removeItem('qaproof_run_start_' + monitor.id);
                } catch(e) {}
                showMonitorDetail(monitor.id);
              }).catch(function () {
                detailRunFailed(qaproof.i18n.monitorRunFailed || 'Failed to save result.');
              });
            },
            onFailed: function (errMsg) {
              detailRunFailed(errMsg || (qaproof.i18n.monitorRunFailed || 'Check Now failed.'));
            },
          });
        }).catch(function () {
          detailRunFailed();
        });
      });
    }

    monitorDetail.querySelectorAll('.qaproof-approve-result').forEach(function (btn) {
      btn.addEventListener('click', function () {
        approveResult(this.dataset.id, monitor.id, this);
      });
    });

    monitorDetail.querySelectorAll('.qaproof-view-result').forEach(function (btn) {
      btn.addEventListener('click', function () {
        viewResult(this.dataset.id);
      });
    });
  }

  function approveResult(resultId, monitorId, btn) {
    Q.confirm(
      qaproof.i18n.monitorApproveConfirm || 'Approve these changes? This will update the baseline to the current page state.',
      { okLabel: qaproof.i18n.monitorApproveChanges || 'Approve Changes' }
    ).then(function (ok) {
      if (!ok) return;
      if (btn) {
        btn.disabled = true;
        btn.textContent = qaproof.i18n.monitorApproving || 'Approving...';
      }
      var approvePath = '/results/' + resultId + '/approve' + (monitorId ? '?monitorId=' + encodeURIComponent(monitorId) : '');
      apiCall('POST', approvePath).then(function (resp) {
        if (resp.success) {
          showMonitorDetail(monitorId);
        } else {
          Q.alert((resp.error && resp.error.message) || (qaproof.i18n.monitorApproveFailed || 'Failed to approve.'));
          if (btn) {
            btn.disabled = false;
            btn.textContent = qaproof.i18n.monitorApproveChanges || 'Approve Changes';
          }
        }
      });
    });
  }

  /**
   * Poll for screenshots on a completed result that has none yet.
   * Called after renderResultDetail renders a placeholder. When screenshots
   * arrive, re-renders the screenshot section in-place without touching the
   * rest of the detail view. Max 24 attempts × 5s = 2 minutes.
   */
  function pollForScreenshots(monitorId, resultId, container, differences, attempts) {
    attempts = attempts || 0;
    if (attempts >= 24) return; // give up after 2 min

    // Ping wp-cron every 3rd attempt to keep the SCREENSHOTS_HOOK moving.
    if (attempts > 0 && attempts % 3 === 0) {
      try { fetch('/wp-cron.php?doing_wp_cron=' + (Date.now() / 1000).toFixed(6), { mode: 'no-cors' }); } catch(e) {}
    }

    setTimeout(function () {
      // Abort if the user navigated away and the placeholder is no longer in the DOM.
      if (!document.getElementById('qaproof-screenshots-pending')) return;

      var sep = (qaproof.restBase.indexOf('?') !== -1) ? '&' : '?';
      apiCall('GET', '/monitors/' + monitorId + '/results' + sep + 'limit=20').then(function (resp) {
        if (!resp.success || !resp.data) {
          pollForScreenshots(monitorId, resultId, container, differences, attempts + 1);
          return;
        }
        var found = null;
        for (var i = 0; i < resp.data.length; i++) {
          if (String(resp.data[i].id) === String(resultId)) { found = resp.data[i]; break; }
        }
        if (!found) {
          pollForScreenshots(monitorId, resultId, container, differences, attempts + 1);
          return;
        }

        var sc = found.screenshots_json ? JSON.parse(found.screenshots_json) : {};
        if (sc.baseline && sc.current) {
          // Screenshots arrived — replace placeholder with the real section.
          var placeholder = document.getElementById('qaproof-screenshots-pending');
          if (!placeholder) return; // user navigated away

          var sectionHtml = '';
          sectionHtml += '<div class="qaproof-screenshot-section">';
          sectionHtml += '  <div class="qaproof-screenshot-chrome">';
          sectionHtml += '    <div class="qaproof-chrome-bar">';
          sectionHtml += '      <div class="qaproof-chrome-logo"><img src="' + qaproof.pluginUrl + 'admin/images/icon.svg" width="22" height="22" alt="" aria-hidden="true"></div>';
          sectionHtml += '      <div class="qaproof-chrome-title">' + (qaproof.i18n.monitorVisualComp || 'Visual Comparison') + '</div>';
          sectionHtml += '      <div class="qaproof-chrome-actions">';
          sectionHtml += '        <button type="button" id="qaproof-toggle-markers" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg> ' + (qaproof.i18n.monitorMarkers || 'Markers') + '</button>';
          sectionHtml += '        <button type="button" id="qaproof-toggle-sync" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2v4h4M12 14v-4H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4L8.5 7.5M4 12l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> ' + (qaproof.i18n.monitorSyncScroll || 'Sync Scroll') + '</button>';
          sectionHtml += '      </div>';
          sectionHtml += '    </div>';
          sectionHtml += '    <div class="qaproof-comparison-viewport">';
          sectionHtml += '      <div class="qaproof-screenshot-col">';
          sectionHtml += '        <div class="qaproof-screenshot-label">' + (qaproof.i18n.monitorBaseline || 'Baseline') + '</div>';
          sectionHtml += '        <div class="qaproof-screenshot-wrapper" id="qaproof-wrapper-figma">';
          sectionHtml += '          <div class="qaproof-screenshot-inner">';
          sectionHtml += '            <img id="qaproof-screenshot-figma" src="' + Q.escapeAttr(sc.baseline) + '" alt="Baseline" />';
          sectionHtml += '            <div class="qaproof-markers-layer" id="qaproof-markers-figma"></div>';
          sectionHtml += '          </div>';
          sectionHtml += '        </div>';
          sectionHtml += '      </div>';
          sectionHtml += '      <div class="qaproof-screenshot-col">';
          sectionHtml += '        <div class="qaproof-screenshot-label">' + (qaproof.i18n.monitorCurrent || 'Current') + '</div>';
          sectionHtml += '        <div class="qaproof-screenshot-wrapper" id="qaproof-wrapper-live">';
          sectionHtml += '          <div class="qaproof-screenshot-inner">';
          sectionHtml += '            <img id="qaproof-screenshot-live" src="' + Q.escapeAttr(sc.current) + '" alt="Current" />';
          sectionHtml += '            <div class="qaproof-markers-layer" id="qaproof-markers-live"></div>';
          sectionHtml += '          </div>';
          sectionHtml += '        </div>';
          sectionHtml += '      </div>';
          sectionHtml += '    </div>';
          sectionHtml += '  </div>';
          sectionHtml += '</div>';

          var wrapper = document.createElement('div');
          wrapper.innerHTML = sectionHtml;
          placeholder.parentNode.replaceChild(wrapper.firstChild, placeholder);

          // Wire up sync-scroll, toolbar and markers now that images are in the DOM.
          var bImg = document.getElementById('qaproof-screenshot-figma');
          var cImg = document.getElementById('qaproof-screenshot-live');
          if (bImg && cImg) {
            Promise.all([Q.waitForImage(bImg), Q.waitForImage(cImg)]).then(function () {
              Q.renderMarkers(differences);
            });
          }
          Q.setupSyncScroll();
          Q.setupToolbar();
        } else {
          pollForScreenshots(monitorId, resultId, container, differences, attempts + 1);
        }
      }).catch(function () {
        pollForScreenshots(monitorId, resultId, container, differences, attempts + 1);
      });
    }, 5000);
  }

  function viewResult(resultId) {
    var detailArea = document.getElementById('qaproof-result-detail');
    if (!detailArea) return;
    detailArea.innerHTML = '<span class="spinner is-active" style="float:none;"></span> ' + (qaproof.i18n.monitorLoadingResult || 'Loading result...');

    var runBtn = document.getElementById('qaproof-detail-run');
    var monitorId = runBtn ? runBtn.dataset.id : null;
    if (!monitorId) return;

    apiCall('GET', '/monitors/' + monitorId + '/results').then(function (resp) {
      if (!resp.success) return;
      var result = null;
      for (var i = 0; i < resp.data.length; i++) {
        if (String(resp.data[i].id) === String(resultId)) { result = resp.data[i]; break; }
      }
      if (!result) {
        detailArea.innerHTML = '<p>' + (qaproof.i18n.monitorResultNotFound || 'Result not found.') + '</p>';
        return;
      }
      renderResultDetail(result, detailArea, monitorId);
    });
  }

  function renderResultDetail(result, container, monitorId) {
    if (result.status === 'failed') {
      container.innerHTML = '<div class="qaproof-card"><h3>' + (qaproof.i18n.monitorRunFailed2 || 'Run Failed') + '</h3><p>' + Q.escapeHtml(result.error_message || '') + '</p></div>';
      return;
    }

    var categories     = result.categories_json     ? JSON.parse(result.categories_json)     : {};
    var differences    = result.differences_json    ? JSON.parse(result.differences_json)    : [];
    var recommendations = result.recommendations_json ? JSON.parse(result.recommendations_json) : [];
    var screenshots    = result.screenshots_json    ? JSON.parse(result.screenshots_json)    : {};

    Q.allDifferences   = differences;
    Q.activeDiffIndex  = null;
    Q.syncScrollEnabled = true;
    Q.markersVisible   = true;

    var score      = result.score != null ? parseInt(result.score, 10) : null;
    var scoreClass = Q.getScoreClass(score);

    var html = '<hr />';
    html += '<div class="qaproof-report-hero"><div class="qaproof-report-hero-top">';
    html += '<div class="qaproof-report-hero-score">';
    html += Q.buildScoreRingHtml(score, (qaproof.i18n.monitorRegressionScore || 'Regression Score'), scoreClass);
    html += '<div class="qaproof-score-label">' + (qaproof.i18n.monitorRegressionScore || 'Regression Score') + '</div>';
    html += '</div>';
    html += '<div class="qaproof-report-hero-info">';
    html += '<div class="qaproof-summary">' + Q.escapeHtml(result.summary || '') + '</div>';
    html += '<div class="qaproof-report-hero-actions">';
    html += '<button type="button" id="qaproof-pdf-btn" class="qaproof-btn qaproof-pdf-btn"><span class="dashicons dashicons-pdf"></span> ' + (qaproof.i18n.monitorDownloadPdf || 'Download PDF Report') + '</button>';
    html += '<button type="button" id="qaproof-email-btn" class="qaproof-btn qaproof-email-btn"><span class="dashicons dashicons-email-alt"></span> ' + (qaproof.i18n.monitorSendEmail || 'Send to Email') + '</button>';
    html += '</div></div></div></div>';

    html += '<h3>' + (qaproof.i18n.monitorCategories || 'Categories') + '</h3>';
    html += '<div class="qaproof-categories" id="qaproof-reg-categories"></div>';

    if (screenshots.baseline && screenshots.current) {
      html += '<div class="qaproof-screenshot-section">';
      html += '  <div class="qaproof-screenshot-chrome">';
      html += '    <div class="qaproof-chrome-bar">';
      html += '      <div class="qaproof-chrome-logo"><img src="' + qaproof.pluginUrl + 'admin/images/icon.svg" width="22" height="22" alt="" aria-hidden="true"></div>';
      html += '      <div class="qaproof-chrome-title">' + (qaproof.i18n.monitorVisualComp || 'Visual Comparison') + '</div>';
      html += '      <div class="qaproof-chrome-actions">';
      html += '        <button type="button" id="qaproof-toggle-markers" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r="0.75" fill="currentColor"/></svg> ' + (qaproof.i18n.monitorMarkers || 'Markers') + '</button>';
      html += '        <button type="button" id="qaproof-toggle-sync" class="qaproof-chrome-btn active"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 2v4h4M12 14v-4H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4L8.5 7.5M4 12l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> ' + (qaproof.i18n.monitorSyncScroll || 'Sync Scroll') + '</button>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="qaproof-comparison-viewport">';
      html += '      <div class="qaproof-screenshot-col">';
      html += '        <div class="qaproof-screenshot-label">' + (qaproof.i18n.monitorBaseline || 'Baseline') + '</div>';
      html += '        <div class="qaproof-screenshot-wrapper" id="qaproof-wrapper-figma">';
      html += '          <div class="qaproof-screenshot-inner">';
      html += '            <img id="qaproof-screenshot-figma" src="' + Q.escapeAttr(screenshots.baseline) + '" alt="Baseline" />';
      html += '            <div class="qaproof-markers-layer" id="qaproof-markers-figma"></div>';
      html += '          </div>';
      html += '        </div>';
      html += '      </div>';
      html += '      <div class="qaproof-screenshot-col">';
      html += '        <div class="qaproof-screenshot-label">' + (qaproof.i18n.monitorCurrent || 'Current') + '</div>';
      html += '        <div class="qaproof-screenshot-wrapper" id="qaproof-wrapper-live">';
      html += '          <div class="qaproof-screenshot-inner">';
      html += '            <img id="qaproof-screenshot-live" src="' + Q.escapeAttr(screenshots.current) + '" alt="Current" />';
      html += '            <div class="qaproof-markers-layer" id="qaproof-markers-live"></div>';
      html += '          </div>';
      html += '        </div>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    } else if (result.status === 'completed') {
      // Screenshots not yet available (background fetch still in progress) — show placeholder.
      html += '<div id="qaproof-screenshots-pending" style="margin:16px 0;padding:12px 16px;background:rgba(0,183,158,0.08);border-radius:8px;display:flex;align-items:center;gap:10px;">';
      html += '<span class="spinner is-active" style="float:none;margin:0;"></span>';
      html += '<span>' + (qaproof.i18n.monitorScreenshotsLoading || 'Screenshots are loading in the background…') + '</span>';
      html += '</div>';
    }

    html += '<h3>' + (qaproof.i18n.monitorDifferences || 'Differences') + ' <span class="qaproof-diff-count" id="qaproof-diff-count">' + differences.length + '</span></h3>';
    html += '<div class="qaproof-card"><div class="qaproof-filter-row"><div class="qaproof-severity-filter" id="qaproof-severity-filter">';
    html += '<button type="button" class="qaproof-filter-btn active" data-severity="all">' + (qaproof.i18n.monitorAll || 'All') + '</button>';
    html += '<button type="button" class="qaproof-filter-btn" data-severity="high">' + (qaproof.i18n.monitorHigh || 'High') + '</button>';
    html += '<button type="button" class="qaproof-filter-btn" data-severity="medium">' + (qaproof.i18n.monitorMedium || 'Medium') + '</button>';
    html += '<button type="button" class="qaproof-filter-btn" data-severity="low">' + (qaproof.i18n.monitorLow || 'Low') + '</button>';
    html += '</div></div><div id="qaproof-differences"></div></div>';

    html += '<h3>' + (qaproof.i18n.monitorRecommendations || 'Recommendations') + '</h3>';
    html += '<div class="qaproof-card"><div class="qaproof-recommendations" id="qaproof-recommendations"></div></div>';

    container.innerHTML = html;

    Q.renderCategoriesInto('qaproof-reg-categories', categories, {
      layout:     (qaproof.i18n.catLayout     || 'Layout & Structure'),
      styling:    (qaproof.i18n.catStyling    || 'Styling & Colors'),
      typography: (qaproof.i18n.catTypography || 'Typography & Content'),
      images:     (qaproof.i18n.catImages     || 'Images & Media'),
      components: (qaproof.i18n.catComponents || 'Components & UI'),
    });
    Q.renderDifferencesInto('qaproof-differences', 'qaproof-diff-count', differences, false);
    Q.renderRecommendationsInto('qaproof-recommendations', recommendations);

    if (screenshots.baseline && screenshots.current) {
      var bImg = document.getElementById('qaproof-screenshot-figma');
      var cImg = document.getElementById('qaproof-screenshot-live');
      Promise.all([Q.waitForImage(bImg), Q.waitForImage(cImg)]).then(function () { Q.renderMarkers(differences); });
      Q.setupSyncScroll();
      Q.setupToolbar();
    } else if (result.status === 'completed' && monitorId) {
      // Screenshots are not yet saved — poll for them in background.
      // Also ping wp-cron immediately so the SCREENSHOTS_HOOK fires without waiting
      // for the next natural page load (critical when DISABLE_WP_CRON=true).
      try { fetch('/wp-cron.php?doing_wp_cron=' + (Date.now() / 1000).toFixed(6), { mode: 'no-cors' }); } catch(e) {}
      pollForScreenshots(monitorId, result.id, container, differences, 0);
    }

    Q.setupFilterFor('qaproof-severity-filter', 'severity');

    var pdfBtn = document.getElementById('qaproof-pdf-btn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        Q.generatePdfReport({
          testType: 'regression', score: score, summary: result.summary,
          categories: categories, differences: differences,
          recommendations: recommendations, pageUrl: result.page_url || '',
        });
      });
    }

    Q.scrollToElement(container);
  }

  // ============================
  // Local helpers
  // ============================

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

  function truncate(str, maxLen) {
    if (!str || str.length <= maxLen) return str || '';
    return str.substring(0, maxLen) + '...';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ============================
  // Expose public API
  // ============================
  Q.monitors = {
    load: loadMonitors,
    showDetail: showMonitorDetail,
    stopPoll: stopMonitorPoll,
  };
})();
