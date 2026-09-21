/**
 * First-run accessibility check — shown on the Dashboard while no API key is
 * configured.
 *
 * Why it exists: the plugin used to open on "Setup Required", sending a reader
 * who had just installed it off to qaproof.io to create an account, verify an
 * email and paste an API key before it would show anything at all. This runs a
 * real check of the site the plugin is installed on, with no account, and asks
 * for the account afterwards — to see the rest.
 *
 * Talks only to this site's own REST routes; the plugin's PHP makes the
 * outbound call, so nothing third-party is loaded into wp-admin.
 */
(function () {
  'use strict';

  var root = document.getElementById('qaproofFirstRun');
  if (!root || typeof qaproof === 'undefined') return;

  var POLL_INTERVAL_MS = 3000;
  var MAX_WAIT_MS = 3 * 60 * 1000;

  var intro   = document.getElementById('qaproofFrIntro');
  var busy    = document.getElementById('qaproofFrBusy');
  var busyTxt = document.getElementById('qaproofFrBusyText');
  var result  = document.getElementById('qaproofFrResult');
  var errBox  = document.getElementById('qaproofFrError');
  var errTxt  = document.getElementById('qaproofFrErrorText');

  function t(key, fallback) {
    return (qaproof.i18n && qaproof.i18n[key]) || fallback;
  }

  function show(el) {
    [intro, busy, result, errBox].forEach(function (n) { if (n) n.hidden = n !== el; });
  }

  function fail(message) {
    if (errTxt) errTxt.textContent = message;
    show(errBox);
  }

  function retryFromError() {
    show(intro);
    if (urlInput) { urlInput.focus(); urlInput.select(); }
  }

  function headers() {
    return { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce };
  }

  function severityLabel(sev) {
    if (sev === 'high') return t('frHigh', 'High');
    if (sev === 'medium') return t('frMedium', 'Medium');
    return t('frLow', 'Low');
  }

  function render(data) {
    var r = data.result || {};
    var score = typeof r.score === 'number' ? r.score : null;
    var total = r.totalIssues || 0;

    document.getElementById('qaproofFrScore').textContent = score === null ? '—' : String(score);

    var summary = document.getElementById('qaproofFrSummary');
    summary.textContent = total === 0
      ? t('frClean', 'No automated WCAG 2.1 AA failures found on this page.')
      : t('frFound', 'Found {n} issues on that page.').replace('{n}', String(total));

    var list = document.getElementById('qaproofFrIssues');
    list.innerHTML = '';
    (r.topIssues || []).forEach(function (issue) {
      var li = document.createElement('li');
      var sev = document.createElement('span');
      sev.className = 'qaproof-firstrun-sev qaproof-firstrun-sev-' + (issue.severity || 'low');
      sev.textContent = severityLabel(issue.severity);
      li.appendChild(sev);
      var text = document.createElement('span');
      // textContent throughout: these strings come from the audited page.
      text.textContent = issue.description || '';
      li.appendChild(text);
      list.appendChild(li);
    });

    // The teaser deliberately returns at most three issues, so the count of
    // what is NOT shown is the honest reason to connect an account.
    var cta = document.getElementById('qaproofFrCta');
    cta.innerHTML = '';
    var more = Math.max(0, total - (r.topIssues || []).length);
    var line = document.createElement('span');
    line.textContent = more > 0
      ? t('frMore', 'Connect a free account to see the remaining {n} issues, the exact element for each one, and export a PDF.').replace('{n}', String(more))
      : t('frMoreNone', 'Connect a free account to audit any page, track changes over time and export a PDF.');
    cta.appendChild(line);
    cta.appendChild(document.createTextNode(' '));
    var link = document.createElement('a');
    link.className = 'button button-primary';
    link.href = root.getAttribute('data-settings-url');
    link.textContent = t('frConnect', 'Connect a free account');
    cta.appendChild(link);

    show(result);
  }

  function poll(auditId, startedAt) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      fail(t('frTimeout', 'The check is taking longer than expected. Please try again in a moment.'));
      return;
    }

    fetch(qaproof.restBase + '/site-audit/' + encodeURIComponent(auditId), {
      headers: { 'X-WP-Nonce': qaproof.nonce },
      credentials: 'same-origin',
    })
      .then(function (res) { return res.json(); })
      .then(function (body) {
        if (!body || !body.success) {
          fail((body && body.error && body.error.message) || t('frFailed', 'The check could not be completed.'));
          return;
        }
        var data = body.data || {};
        if (data.status === 'done') { render(data); return; }
        if (data.status === 'failed') {
          fail((data.error && data.error.message) || t('frFailed', 'The check could not be completed.'));
          return;
        }
        if (busyTxt && data.status === 'processing') {
          busyTxt.textContent = t('frAnalysing', 'Checking the page against WCAG 2.1 AA…');
        }
        setTimeout(function () { poll(auditId, startedAt); }, POLL_INTERVAL_MS);
      })
      .catch(function () {
        fail(t('frNetwork', 'Could not reach the check. Please try again.'));
      });
  }

  var urlInput = document.getElementById('qaproofFrUrl');
  var localHint = document.getElementById('qaproofFrLocal');

  /**
   * Addresses our crawler cannot reach from the internet. Warning up front
   * beats a round trip that comes back "enter a public website URL" while the
   * field still holds the address the reader cannot use.
   */
  function looksUnreachable(value) {
    var host;
    try { host = new URL(value).hostname.toLowerCase(); } catch (e) { return false; }
    if (host === 'localhost' || host.indexOf('.') === -1) return true;
    if (/\.(local|test|localhost|internal|invalid)$/.test(host)) return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true;
    return false;
  }

  function syncLocalHint() {
    if (!localHint || !urlInput) return;
    localHint.hidden = !looksUnreachable(urlInput.value);
  }

  if (urlInput) {
    syncLocalHint();
    urlInput.addEventListener('input', syncLocalHint);
  }

  var retryBtn = document.getElementById('qaproofFrRetry');
  if (retryBtn) retryBtn.addEventListener('click', retryFromError);

  document.getElementById('qaproofFrRun').addEventListener('click', function () {
    var target = urlInput ? urlInput.value.trim() : '';
    show(busy);
    fetch(qaproof.restBase + '/site-audit', {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin',
      body: JSON.stringify({ url: target }),
    })
      .then(function (res) { return res.json(); })
      .then(function (body) {
        if (!body || !body.success || !body.data || !body.data.auditId) {
          fail((body && body.error && body.error.message) || t('frFailed', 'The check could not be started.'));
          return;
        }
        // A cached result comes back already finished — render it rather than
        // polling for a run that is not happening.
        if (body.data.status === 'done') { render(body.data); return; }
        poll(body.data.auditId, Date.now());
      })
      .catch(function () {
        fail(t('frNetwork', 'Could not reach the check. Please try again.'));
      });
  });
})();
