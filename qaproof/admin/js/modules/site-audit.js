/* global qaproof */
/**
 * Site Audit page — a whole site, not one URL.
 *
 * Talks only to this site's own REST routes; the plugin's PHP holds the API
 * key and makes the outbound call, so the key never reaches the browser.
 *
 * Two constraints shape this. A run takes 10–35 minutes, so the page must
 * survive being closed: the audit id lives in the URL and in localStorage and
 * reopening resumes watching. And the report leads with what a person can act
 * on — what changed since last time, then the single fix that covers the most
 * pages — because a per-page list of a template defect repeated forty times
 * buries everything else.
 */
(function () {
  'use strict';

  var startEl = document.getElementById('qasa-start');
  if (!startEl || typeof qaproof === 'undefined') return;

  var POLL_MS = 4000;
  var LAST_KEY = 'qaproof_site_audit_last';

  var el = function (id) { return document.getElementById(id); };
  var progressEl = el('qasa-progress');
  var reportEl = el('qasa-report');

  var pollTimer = null;
  var currentId = null;

  // ── helpers ───────────────────────────────────────────────────────────────

  function t(key, fallback) {
    return (qaproof.i18n && qaproof.i18n[key]) || fallback;
  }

  /**
   * WordPress without pretty permalinks uses `?rest_route=`, so a path that
   * carries its own query string would add a SECOND `?` and WP would fold it
   * into the route name — a 404 that looks like a missing endpoint. Same
   * gotcha the monitors module hit.
   */
  function restUrl(path) {
    var base = qaproof.restBase;
    if (base.indexOf('?') !== -1 && path.indexOf('?') !== -1) {
      return base + path.replace('?', '&');
    }
    return base + path;
  }

  function api(method, path, body) {
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce },
      credentials: 'same-origin'
    };
    if (body) opts.body = JSON.stringify(body);

    return fetch(restUrl(path), opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok || !json || json.success === false) {
          var err = new Error(
            (json && json.error && json.error.message) ||
            t('saRequestFailed', 'The request failed. Please try again.')
          );
          err.status = res.status;
          err.code = json && json.error && json.error.code;
          throw err;
        }
        return json.data;
      });
    });
  }

  function show(which) {
    startEl.style.display = which === 'start' ? '' : 'none';
    progressEl.style.display = which === 'progress' ? '' : 'none';
    reportEl.style.display = which === 'report' ? '' : 'none';
  }

  function showError(message) {
    el('qasa-error-text').textContent = message;
    el('qasa-error').style.display = '';
  }
  function clearError() {
    el('qasa-error').style.display = 'none';
    el('qasa-error-text').textContent = '';
  }

  function hostOf(url) {
    try { return new URL(url).host; } catch (e) { return url || ''; }
  }

  function pathOf(url) {
    try {
      var u = new URL(url);
      return (u.pathname === '/' ? '/' : u.pathname) + (u.search || '');
    } catch (e) { return url || ''; }
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 90) return t('saJustNow', 'just now');
    var mins = Math.round(secs / 60);
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.round(hrs / 24) + 'd ago';
  }

  function remember(id) {
    currentId = id;
    try { localStorage.setItem(LAST_KEY, id); } catch (e) { /* private mode */ }
    try {
      var u = new URL(window.location.href);
      u.searchParams.set('audit', id);
      window.history.replaceState({}, '', u.toString());
    } catch (e) { /* history is a convenience */ }
  }

  function forget() {
    currentId = null;
    try { localStorage.removeItem(LAST_KEY); } catch (e) {}
    try {
      var u = new URL(window.location.href);
      u.searchParams.delete('audit');
      window.history.replaceState({}, '', u.toString());
    } catch (e) {}
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  function pageRow(page) {
    var row = document.createElement('div');
    row.className = 'qasa-page';

    var dot = document.createElement('span');
    dot.className = 'qasa-page-dot ' + (page.status || 'pending');
    row.appendChild(dot);

    var url = document.createElement('span');
    url.className = 'qasa-page-url';
    url.textContent = pathOf(page.url);
    url.title = page.url;
    row.appendChild(url);

    if (page.status === 'done') {
      var score = document.createElement('span');
      score.className = 'qasa-page-score';
      score.textContent = page.score == null ? '' : String(page.score);
      row.appendChild(score);
    } else if (page.status === 'failed') {
      var note = document.createElement('span');
      note.className = 'qasa-page-note';
      // "blocked" and "timed out" call for different actions from the reader.
      note.textContent = (page.error && page.error.message) || t('saFailed', 'failed');
      row.appendChild(note);
    }

    return row;
  }

  function renderPages(container, pages) {
    container.textContent = '';
    var frag = document.createDocumentFragment();
    pages.forEach(function (p) { frag.appendChild(pageRow(p)); });
    container.appendChild(frag);
  }

  function renderProgress(audit) {
    el('qasa-prog-url').textContent = audit.startUrl;
    el('qasa-phase').textContent = audit.status === 'discovering'
      ? t('saPhaseFinding', 'Finding pages…')
      : t('saPhaseChecking', 'Checking pages…');

    var total = audit.pagesTotal || 0;
    var settled = (audit.pagesDone || 0) + (audit.pagesFailed || 0);
    el('qasa-bar-fill').style.width = (total ? Math.round((settled / total) * 100) : 0) + '%';
    el('qasa-prog-count').textContent = settled + ' / ' + (total || '—');

    // A rough ETA from finished pages is honest; a precise-looking one would
    // not be, since page cost varies several-fold.
    var eta = '';
    if (audit.startedAt && settled > 0 && total > settled) {
      var elapsed = (Date.now() - new Date(audit.startedAt).getTime()) / 1000;
      var remaining = Math.round((elapsed / settled) * (total - settled) / 60);
      if (remaining >= 1) eta = '~' + remaining + ' min ' + t('saLeft', 'left');
    }
    el('qasa-prog-eta').textContent = eta;

    renderPages(el('qasa-prog-pages'), audit.pages || []);
  }

  function groupRow(g) {
    var box = document.createElement('div');
    box.className = 'qasa-group';

    var top = document.createElement('div');
    top.className = 'qasa-group-top';

    var badge = document.createElement('span');
    badge.className = 'qasa-badge ' + (g.needsReview ? 'review' : (g.severity || 'low'));
    badge.textContent = g.needsReview ? t('saUnverified', 'Unverified') : (g.severity || 'low');
    top.appendChild(badge);

    var pages = document.createElement('span');
    pages.className = 'qasa-group-pages';
    // The line the whole report exists for.
    pages.textContent = g.pageCount === 1
      ? t('saOnePage', '1 page')
      : g.pageCount + ' ' + t('saPagesWord', 'pages');
    top.appendChild(pages);

    if (g.wcagCriterion) {
      var sc = document.createElement('span');
      sc.className = 'qasa-group-sc';
      sc.textContent = 'WCAG ' + g.wcagCriterion;
      top.appendChild(sc);
    }
    box.appendChild(top);

    var desc = document.createElement('p');
    desc.className = 'qasa-group-desc';
    desc.textContent = g.description || '';
    box.appendChild(desc);

    if (g.selector) {
      var sel = document.createElement('div');
      sel.className = 'qasa-group-sel';
      sel.textContent = g.selector;
      box.appendChild(sel);
    }

    return box;
  }

  /** "Since your last audit: 6 resolved, 1 new." Hidden on a first run. */
  function renderDiff(cmp) {
    var box = el('qasa-diff');
    if (!cmp || !cmp.pagesCompared) { box.style.display = 'none'; return; }
    box.style.display = '';

    el('qasa-diff-resolved').textContent = cmp.resolvedCount;
    el('qasa-diff-new').textContent = cmp.newCount;
    el('qasa-diff-unchanged').textContent = cmp.unchangedCount;

    var sub = cmp.pagesCompared + ' ' + (cmp.pagesCompared === 1
      ? t('saPageComparedOne', 'page compared with the previous audit')
      : t('saPageCompared', 'pages compared with the previous audit'));
    if (cmp.pagesOnlyInThisScan) {
      sub += ' · ' + cmp.pagesOnlyInThisScan + ' ' + t('saNewToThisScan', 'new to this scan');
    }
    el('qasa-diff-sub').textContent = sub;

    var lists = el('qasa-diff-lists');
    lists.textContent = '';

    var section = function (titleText, items, cls, mark) {
      if (!items || !items.length) return;
      var wrap = document.createElement('div');
      wrap.className = 'qasa-diff-group';

      var h = document.createElement('h3');
      h.textContent = titleText;
      wrap.appendChild(h);

      items.slice(0, 12).forEach(function (f) {
        var row = document.createElement('div');
        row.className = 'qasa-diff-item ' + cls;

        var m = document.createElement('span');
        m.className = 'qasa-diff-mark';
        m.textContent = mark;
        row.appendChild(m);

        var body = document.createElement('div');
        body.className = 'qasa-diff-item-body';

        var d = document.createElement('div');
        d.textContent = f.description || '';
        body.appendChild(d);

        var where = document.createElement('div');
        where.className = 'qasa-diff-item-where';
        where.textContent = (f.selector ? f.selector + '  ·  ' : '') + pathOf(f.url);
        body.appendChild(where);

        row.appendChild(body);
        wrap.appendChild(row);
      });

      if (items.length > 12) {
        var more = document.createElement('div');
        more.className = 'qasa-diff-more';
        more.textContent = '+' + (items.length - 12) + ' ' + t('saMore', 'more');
        wrap.appendChild(more);
      }

      lists.appendChild(wrap);
    };

    section(t('saFixedList', 'Fixed since last audit'), cmp.resolved, 'fixed', '✓');
    section(t('saNewList', 'New since last audit'), cmp.new, 'added', '!');
  }

  function renderReport(audit) {
    el('qasa-host').textContent = hostOf(audit.startUrl);
    el('qasa-score').textContent = audit.score == null ? '—' : String(audit.score);

    var totals = audit.totals || {};
    el('qasa-stat-high').textContent = totals.high || 0;
    el('qasa-stat-medium').textContent = totals.medium || 0;
    el('qasa-stat-low').textContent = totals.low || 0;
    el('qasa-stat-review').textContent = totals.needsReview || 0;

    // Coverage states what was NOT looked at too. A report that implies it
    // covered a site it sampled is the kind of claim that loses an agency its
    // client.
    var parts = [];
    var checked = audit.pagesDone || 0;
    if (audit.pagesDiscovered && audit.pagesDiscovered > checked) {
      parts.push(checked + ' ' + t('saOf', 'of') + ' ' + audit.pagesDiscovered + ' ' + t('saPagesFound', 'pages found'));
    } else {
      parts.push(checked + ' ' + t('saPagesChecked', 'pages checked'));
    }
    if (audit.pagesFailed) {
      parts.push(audit.pagesFailed + ' ' + t('saCouldNotLoad', 'could not be loaded'));
    }
    if (audit.discoveryMethod === 'links') {
      parts.push(t('saViaLinks', 'found by following links (no sitemap)'));
    } else if (audit.discoveryMethod === 'single') {
      parts.push(t('saSinglePage', 'only this page could be found'));
    }
    el('qasa-coverage').textContent = parts.join(' · ');

    var groupsEl = el('qasa-groups');
    groupsEl.textContent = '';
    var groups = audit.topFindings || [];
    if (!groups.length) {
      var none = document.createElement('p');
      none.className = 'qasa-h2-sub';
      none.textContent = t('saNoIssues', 'No issues were found on the pages we could check.');
      groupsEl.appendChild(none);
    } else {
      var frag = document.createDocumentFragment();
      groups.forEach(function (g) { frag.appendChild(groupRow(g)); });
      groupsEl.appendChild(frag);
    }

    renderDiff(audit.comparison);
    renderPages(el('qasa-report-pages'), audit.pages || []);
  }

  function renderRecent(audits) {
    var wrap = el('qasa-recent');
    var list = el('qasa-recent-list');
    list.textContent = '';
    if (!audits.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';

    audits.forEach(function (a) {
      var row = document.createElement('div');
      row.className = 'qasa-recent-row';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      var host = document.createElement('span');
      host.className = 'qasa-recent-host';
      host.textContent = hostOf(a.startUrl);
      row.appendChild(host);

      var score = document.createElement('span');
      score.className = 'qasa-page-score';
      score.textContent = (a.status === 'done' && a.score != null) ? String(a.score) : a.status;
      row.appendChild(score);

      var when = document.createElement('span');
      when.className = 'qasa-recent-when';
      when.textContent = timeAgo(a.createdAt);
      row.appendChild(when);

      var open = function () { remember(a.id); watch(a.id); };
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });

      list.appendChild(row);
    });
  }

  // ── polling ───────────────────────────────────────────────────────────────

  function stopPolling() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  function finish(id) {
    stopPolling();
    // Findings are fetched once, at the end — megabytes for a large audit,
    // and the progress view has no use for them.
    api('GET', '/site-audits/' + id + '?findings=1').then(function (audit) {
      renderReport(audit);
      show('report');
    }).catch(function (err) {
      show('start');
      showError(err.message);
    });
  }

  function watch(id) {
    stopPolling();
    show('progress');
    clearError();

    var tick = function () {
      api('GET', '/site-audits/' + id).then(function (audit) {
        if (audit.status === 'done') { finish(id); return; }
        if (audit.status === 'failed') {
          stopPolling();
          show('start');
          showError((audit.error && audit.error.message) || t('saFailedRun', 'The audit could not be completed.'));
          forget();
          loadRecent();
          return;
        }
        renderProgress(audit);
        pollTimer = setTimeout(tick, POLL_MS);
      }).catch(function (err) {
        // A transient blip must not abandon a 30-minute run; only a definitive
        // "this audit is gone" sends the reader back to the form. A 403 means
        // the WP nonce aged out — say so, because reloading fixes it and
        // nothing else will.
        if (err.status === 404) {
          stopPolling();
          forget();
          show('start');
          loadRecent();
          return;
        }
        if (err.status === 403) {
          stopPolling();
          show('start');
          showError(t('saNonceExpired', 'This page has been open too long. Reload it to continue.'));
          return;
        }
        pollTimer = setTimeout(tick, POLL_MS * 2);
      });
    };
    tick();
  }

  // ── wiring ────────────────────────────────────────────────────────────────

  function loadRecent() {
    api('GET', '/site-audits?limit=8').then(function (data) {
      // The hint stays hidden until the plan limit is actually known: with no
      // API key this call fails, and "Up to — pages on your plan" reads like a
      // bug on the first screen a new install shows.
      if (data.planPageLimit) {
        el('qasa-budget').textContent = String(data.planPageLimit);
        el('qasa-hint').style.display = '';
      }
      renderRecent(data.audits || []);
    }).catch(function () { /* the form still works without the list */ });
  }

  el('qasa-form').addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    var url = el('qasa-url').value.trim();
    if (!url) { showError(t('saNeedUrl', 'Enter the address of the site you want to audit.')); return; }

    var btn = el('qasa-submit');
    btn.disabled = true;

    api('POST', '/site-audits', { url: url }).then(function (audit) {
      btn.disabled = false;
      remember(audit.id);
      watch(audit.id);
    }).catch(function (err) {
      btn.disabled = false;
      showError(err.message);
    });
  });

  el('qasa-back').addEventListener('click', function () {
    // Leaves the run going — it is a server-side job, not a page-side one.
    stopPolling();
    show('start');
    loadRecent();
  });

  /**
   * The PDF is the artifact that leaves the tool, so it is fetched through the
   * site's own REST route rather than linked at the API: the API key lives in
   * PHP and must not reach the browser.
   */
  el('qasa-pdf').addEventListener('click', function () {
    if (!currentId) return;
    var btn = el('qasa-pdf');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('saPdfBuilding', 'Building the report…');

    fetch(restUrl('/site-audits/' + currentId + '/report.pdf'), {
      headers: { 'X-WP-Nonce': qaproof.nonce },
      credentials: 'same-origin'
    })
      .then(function (res) {
        if (!res.ok) throw new Error(t('saPdfFailed', 'The report could not be generated.'));
        var name = 'qaproof-accessibility-report.pdf';
        var cd = res.headers.get('content-disposition') || '';
        var m = cd.match(/filename="([^"]+)"/);
        if (m) name = m[1];
        return res.blob().then(function (blob) { return { blob: blob, name: name }; });
      })
      .then(function (out) {
        var url = URL.createObjectURL(out.blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = out.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoking immediately can cancel the download in some browsers.
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      })
      .catch(function (err) { showError(err.message); })
      .finally(function () { btn.disabled = false; btn.textContent = label; });
  });

  el('qasa-new').addEventListener('click', function () {
    forget();
    show('start');
    loadRecent();
  });

  // Resume: ?audit= wins over the remembered id, so a shared link opens that
  // audit rather than whatever this browser looked at last.
  var resumeId = null;
  try { resumeId = new URL(window.location.href).searchParams.get('audit'); } catch (e) {}
  if (!resumeId) { try { resumeId = localStorage.getItem(LAST_KEY); } catch (e) {} }

  loadRecent();

  if (resumeId) {
    api('GET', '/site-audits/' + resumeId).then(function (audit) {
      remember(audit.id);
      if (audit.status === 'done') finish(audit.id);
      else if (audit.status === 'failed') {
        show('start');
        showError((audit.error && audit.error.message) || t('saFailedRun', 'The audit could not be completed.'));
        forget();
      } else watch(audit.id);
    }).catch(function () {
      forget();
      show('start');
    });
  }
})();
