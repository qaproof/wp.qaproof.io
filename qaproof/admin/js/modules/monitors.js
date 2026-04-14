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

  // Track active monitor polling
  var monitorPollTimer = null;
  var monitorPollCount = 0;
  var monitorPollMaxAttempts = 60; // 5 minutes (every 5s)

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

    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    var dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

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
        label.textContent = 'Now';
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
    return fetch(qaproof.restBase + path, opts).then(Q.safeJson);
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
    html += '<th>' + Q.escapeHtml('URL') + '</th>';
    html += '<th>' + Q.escapeHtml('Schedule') + '</th>';
    html += '<th>' + Q.escapeHtml('Last Score') + '</th>';
    html += '<th>' + Q.escapeHtml('Last Run') + '</th>';
    html += '<th>' + Q.escapeHtml('Status') + '</th>';
    html += '<th>' + Q.escapeHtml('Actions') + '</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < monitors.length; i++) {
      var m = monitors[i];
      var scoreClass = m.last_score != null ? Q.getScoreClass(parseInt(m.last_score, 10)) : '';
      var scoreText = m.last_score != null ? m.last_score : '—';
      var lastRun = m.last_run_at ? formatDate(m.last_run_at) : 'Never';
      var statusClass = parseInt(m.is_enabled, 10) ? 'qaproof-status-active' : 'qaproof-status-paused';
      var statusText = parseInt(m.is_enabled, 10) ? 'Active' : 'Paused';
      var baselineText = parseInt(m.has_baseline, 10) ? '' : ' (no baseline)';

      html += '<tr data-id="' + m.id + '" class="qaproof-monitor-row-clickable">';
      html += '<td class="qaproof-monitor-url"><a href="#" class="qaproof-monitor-detail-link" data-id="' + m.id + '">' + Q.escapeHtml(truncateUrl(m.page_url, 60)) + '</a> <span class="qaproof-monitor-view-hint">View Results &rsaquo;</span></td>';
      var scheduleText = Q.capitalize(m.schedule);
      if (m.scheduled_at) {
        var sa = new Date(m.scheduled_at.replace(' ', 'T'));
        if (!isNaN(sa.getTime()) && sa > new Date()) {
          scheduleText += ' (from ' + formatDate(m.scheduled_at) + ')';
        }
      }
      html += '<td>' + Q.escapeHtml(scheduleText) + '</td>';
      html += '<td><span class="qaproof-monitor-score ' + scoreClass + '">' + scoreText + '</span></td>';
      html += '<td>' + Q.escapeHtml(lastRun) + '</td>';
      html += '<td><span class="' + statusClass + '">' + Q.escapeHtml(statusText + baselineText) + '</span></td>';
      html += '<td class="qaproof-monitor-actions">';
      html += '  <button type="button" class="button qaproof-run-monitor" data-id="' + m.id + '" title="Run Now">Run</button>';
      html += '  <button type="button" class="button qaproof-toggle-monitor" data-id="' + m.id + '" data-enabled="' + m.is_enabled + '">' + (parseInt(m.is_enabled, 10) ? 'Pause' : 'Enable') + '</button>';
      html += '  <button type="button" class="button qaproof-edit-monitor" data-id="' + m.id + '">Edit</button>';
      html += '  <button type="button" class="button button-link-delete qaproof-delete-monitor" data-id="' + m.id + '">Delete</button>';
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
      if (monitor.scheduled_at) {
        qaproofDatepicker.set(new Date(monitor.scheduled_at.replace(' ', 'T')));
      } else {
        qaproofDatepicker.setNow();
      }
      if (thresholdInput) thresholdInput.value = monitor.threshold_score;
      if (notifyEmailCb) notifyEmailCb.checked = parseInt(monitor.notify_email, 10) === 1;
      if (notifyAdminCb) notifyAdminCb.checked = parseInt(monitor.notify_admin, 10) === 1;
    } else {
      if (titleEl) titleEl.textContent = 'Add Monitor';
      if (editIdEl) editIdEl.value = '';
      if (urlInput) urlInput.value = '';
      if (scheduleSelect) scheduleSelect.value = 'daily';
      qaproofDatepicker.setNow();
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
      scheduled_at: qaproofDatepicker.getValue(),
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
        var scoreClass = r.score != null ? Q.getScoreClass(parseInt(r.score, 10)) : '';
        var statusBadge = '';
        if (r.status === 'failed') statusBadge = '<span class="qaproof-badge qaproof-badge-high">Failed</span>';
        else if (r.status === 'approved') statusBadge = '<span class="qaproof-badge qaproof-badge-approved">Approved</span>';

        html += '<div class="qaproof-result-row" data-result-id="' + r.id + '">';
        html += '  <span class="qaproof-result-date">' + Q.escapeHtml(formatDate(r.run_date)) + '</span>';
        html += '  <span class="qaproof-result-score ' + scoreClass + '">' + (r.score != null ? r.score : '—') + '</span>';
        html += '  ' + statusBadge;
        html += '  <span class="qaproof-result-summary">' + Q.escapeHtml(truncate(r.summary || (r.error_message || ''), 80)) + '</span>';

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

    var row = monitorDetail.querySelector('.qaproof-result-row[data-result-id="' + resultId + '"]');
    if (!row) return;

    // We need to get the full result data. Find the monitor ID from the detail header run button
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
      container.innerHTML = '<div class="qaproof-card"><h3>Run Failed</h3><p>' + Q.escapeHtml(result.error_message || 'Unknown error') + '</p></div>';
      return;
    }

    var categories = result.categories_json ? JSON.parse(result.categories_json) : {};
    var differences = result.differences_json ? JSON.parse(result.differences_json) : [];
    var recommendations = result.recommendations_json ? JSON.parse(result.recommendations_json) : [];
    var screenshots = result.screenshots_json ? JSON.parse(result.screenshots_json) : {};

    Q.allDifferences = differences;
    Q.activeDiffIndex = null;
    Q.syncScrollEnabled = true;
    Q.markersVisible = true;

    var score = result.score != null ? parseInt(result.score, 10) : null;
    var scoreClass = Q.getScoreClass(score);

    var html = '<hr />';
    html += '<div class="qaproof-report-hero">';
    html += '  <div class="qaproof-report-hero-top">';
    html += '    <div class="qaproof-report-hero-score">';
    html += Q.buildScoreRingHtml(score, 'Regression Score', scoreClass);
    html += '      <div class="qaproof-score-label">Regression Score</div>';
    html += '    </div>';
    html += '    <div class="qaproof-report-hero-info">';
    html += '      <div class="qaproof-summary">' + Q.escapeHtml(result.summary || '') + '</div>';
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
      html += '            <img id="qaproof-screenshot-figma" src="' + Q.escapeAttr(screenshots.baseline) + '" alt="Baseline" />';
      html += '            <div class="qaproof-markers-layer" id="qaproof-markers-figma"></div>';
      html += '          </div>';
      html += '        </div>';
      html += '      </div>';
      html += '      <div class="qaproof-screenshot-col">';
      html += '        <div class="qaproof-screenshot-label">Current</div>';
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
    Q.renderCategoriesInto('qaproof-reg-categories', categories, {
      layout: 'Layout & Structure',
      styling: 'Styling & Colors',
      typography: 'Typography & Content',
      images: 'Images & Media',
      components: 'Components & UI',
    });

    Q.renderDifferencesInto('qaproof-differences', 'qaproof-diff-count', differences, false);
    Q.renderRecommendationsInto('qaproof-recommendations', recommendations);

    // Markers after images load
    if (screenshots.baseline && screenshots.current) {
      var baselineImg = document.getElementById('qaproof-screenshot-figma');
      var currentImg = document.getElementById('qaproof-screenshot-live');
      Promise.all([Q.waitForImage(baselineImg), Q.waitForImage(currentImg)]).then(function () {
        Q.renderMarkers(differences);
      });

      Q.setupSyncScroll();
      Q.setupToolbar();
    }

    Q.setupFilterFor('qaproof-severity-filter', 'severity');

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
        Q.generatePdfReport(resultData);
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
