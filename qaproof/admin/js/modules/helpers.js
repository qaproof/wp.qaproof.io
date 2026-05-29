/* global qaproof */
(function () {
  'use strict';
  window.QAProof = window.QAProof || {};

  // ============================
  // Safe JSON parsing helper
  // ============================
  function safeJson(response) {
    if (!response.ok) {
      // Try to parse the JSON error body first — the API returns structured errors
      // like { success: false, error: { code, message } } even on 4xx responses.
      // If JSON parsing succeeds, resolve (not reject) so callers can handle the
      // error gracefully via the normal `resp.success === false` branch.
      return response.json().then(function (data) {
        if (data && (data.success === false || data.error)) {
          return data; // pass through to .then() handler
        }
        // Unexpected non-error JSON on a failed status — fall back to generic message
        var msg = (qaproof.i18n.errHttp || 'Server returned HTTP ') + response.status;
        throw new Error(msg);
      }).catch(function (err) {
        // JSON parse failed — build a generic error message
        if (err && err.message && err.message.indexOf('HTTP') !== -1) throw err; // re-throw our own
        var msg = (qaproof.i18n.errHttp || 'Server returned HTTP ') + response.status;
        if (response.status === 404) msg = qaproof.i18n.err404 || 'REST API endpoint not found (404).';
        else if (response.status === 403) msg = qaproof.i18n.err403 || 'Access denied (403).';
        else if (response.status === 500) msg = qaproof.i18n.err500 || 'Internal server error (500).';
        throw new Error(msg);
      });
    }
    return response.json().catch(function () {
      throw new Error(qaproof.i18n.errInvalidJson || 'Invalid JSON response from server.');
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
  function saveActiveJob(jobId, testType, pageUrl, page, phase, retries, wcagLevel) {
    try {
      var data = {
        jobId: jobId, testType: testType, pageUrl: pageUrl, page: page,
        phase: phase || 'polling', startedAt: Date.now(),
        retries: retries || 0,
        // API key fingerprint — used to discard the job if the key changes.
        apiKeyFp: (typeof qaproof !== 'undefined' && qaproof.apiKeyFp) ? qaproof.apiKeyFp : '',
      };
      // Store the user-selected WCAG level (A/AA/AAA) so recovery flow can
      // inject targetWcagLevel into resultData and PDF shows the correct level.
      if (wcagLevel) data.wcagLevel = wcagLevel;
      localStorage.setItem(JOB_KEY_PREFIX + page, JSON.stringify(data));
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
      // Discard if the API key changed — the job belongs to a different workspace.
      var currentFp = (typeof qaproof !== 'undefined' && qaproof.apiKeyFp) ? qaproof.apiKeyFp : '';
      if (job.apiKeyFp && currentFp && job.apiKeyFp !== currentFp) {
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
   * Build a cancel URL for the in-flight job. Same WP REST proxy as polling
   * — the proxy translates the WP-side route into a DELETE call to the API.
   * Used on tab close (beforeunload) and explicit user cancel.
   */
  function buildCancelUrl(jobId) {
    var url = qaproof.restBase + '/cancel-job/' + jobId;
    if (qaproof.restBase.indexOf('rest_route=') !== -1) {
      url = qaproof.restBase + '%2Fcancel-job%2F' + jobId;
    }
    return url;
  }

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

  /**
   * Announce that a result container has just been populated, so screen
   * reader users learn the test finished and can navigate to it without
   * blindly Tab-hunting.
   *
   * Mechanics:
   *   - `role="region"` + `aria-label` makes it a navigable landmark.
   *   - `tabindex="-1"` allows programmatic focus without breaking Tab order.
   *   - The first <h1>/<h2> inside the container receives focus so screen
   *     readers announce "<heading text>, heading level N".
   *   - Falls back to focusing the container itself if no heading exists.
   *   - A live-region nudge (`aria-live="polite"`) is set once on the
   *     container so any future content swaps inside it are also announced.
   */
  function announceResultsReady(container, ariaLabelText) {
    if (!container || typeof container.querySelector !== 'function') return;
    try {
      container.setAttribute('role', 'region');
      container.setAttribute('aria-label', ariaLabelText || 'Test results');
      // aria-live on the wrapper so partial updates (filter changes, marker
      // re-render after image load) are also announced gently.
      if (!container.hasAttribute('aria-live')) {
        container.setAttribute('aria-live', 'polite');
      }
      var firstHeading = container.querySelector('h1, h2');
      var focusTarget = firstHeading || container;
      // tabindex=-1 lets the heading take focus without inserting itself into
      // the natural Tab order.
      if (!focusTarget.hasAttribute('tabindex')) {
        focusTarget.setAttribute('tabindex', '-1');
      }
      // Defer focus until after scroll lands so a Chrome/Firefox auto-scroll
      // doesn't fight our scrollToElement().
      setTimeout(function () {
        try { focusTarget.focus({ preventScroll: true }); } catch (_) {
          try { focusTarget.focus(); } catch (__) {}
        }
      }, 50);
    } catch (_) { /* DOM access can fail in weird iframe contexts */ }
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function truncate(str, maxLen) {
    if (!str || str.length <= maxLen) return str || '';
    return str.substring(0, maxLen) + '...';
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
  // Branded modal dialogs (replacement for native window.confirm / window.alert).
  // The native popups break out of the WP admin's visual style and look generic;
  // these match the rest of the QAProof UI (Kodchasan font, teal accents, pill
  // buttons, dark-mode aware via ancestor #qaproof-app.qaproof-dark).
  //
  //   QAProof.confirm(message, opts)  → Promise<boolean>
  //   QAProof.alert(message, opts)    → Promise<void>
  //
  // opts: { title?, okLabel?, cancelLabel?, danger? }
  // ============================
  function ensureModalRoot() {
    var root = document.getElementById('qaproof-modal-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'qaproof-modal-root';
    // Mount inside the QAProof app container when present so dark-mode +
    // scoped styles cascade. Fall back to <body> when invoked from a page
    // that doesn't render the app shell (e.g. settings without dashboard).
    var host = document.getElementById('qaproof-app') || document.body;
    host.appendChild(root);
    return root;
  }

  function openModal(opts) {
    var o = opts || {};
    var isConfirm = !!o.confirm;
    var root = ensureModalRoot();

    var overlay = document.createElement('div');
    overlay.className = 'qaproof-modal-overlay';
    if (o.danger) overlay.classList.add('qaproof-modal-danger');

    overlay.innerHTML =
      '<div class="qaproof-modal" role="dialog" aria-modal="true" aria-labelledby="qaproof-modal-title">' +
        (o.title ? '<h3 class="qaproof-modal-title" id="qaproof-modal-title">' + escapeHtml(o.title) + '</h3>' : '') +
        '<div class="qaproof-modal-msg">' + escapeHtml(o.message || '') + '</div>' +
        '<div class="qaproof-modal-actions">' +
          (isConfirm
            ? '<button type="button" class="qaproof-modal-btn qaproof-modal-cancel">' +
                escapeHtml(o.cancelLabel || (qaproof.i18n && qaproof.i18n.modalCancel) || 'Cancel') +
              '</button>'
            : '') +
          '<button type="button" class="qaproof-modal-btn qaproof-modal-ok' +
            (o.danger ? ' qaproof-modal-btn-danger' : ' qaproof-modal-btn-primary') + '">' +
            escapeHtml(o.okLabel || (qaproof.i18n && qaproof.i18n.modalOk) || 'OK') +
          '</button>' +
        '</div>' +
      '</div>';

    root.appendChild(overlay);
    // Trigger entry animation on next frame
    requestAnimationFrame(function () { overlay.classList.add('qaproof-modal-visible'); });

    return new Promise(function (resolve) {
      function close(value) {
        overlay.classList.remove('qaproof-modal-visible');
        // Wait for the fade-out so users see it dismiss
        setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 180);
        document.removeEventListener('keydown', onKey, true);
        resolve(value);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(isConfirm ? false : undefined); }
        else if (e.key === 'Enter' && document.activeElement === okBtn) { e.preventDefault(); close(isConfirm ? true : undefined); }
      }

      var okBtn = overlay.querySelector('.qaproof-modal-ok');
      var cancelBtn = overlay.querySelector('.qaproof-modal-cancel');
      okBtn.addEventListener('click', function () { close(isConfirm ? true : undefined); });
      if (cancelBtn) cancelBtn.addEventListener('click', function () { close(false); });
      // Click on the dim backdrop (outside the dialog) cancels confirm,
      // dismisses alert. Clicks inside the dialog itself are absorbed.
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(isConfirm ? false : undefined);
      });
      document.addEventListener('keydown', onKey, true);
      // Auto-focus the primary button so Enter / Esc work without clicking.
      setTimeout(function () { okBtn.focus(); }, 30);
    });
  }

  function qpConfirm(message, opts) {
    return openModal({ message: message, confirm: true,
      title:       opts && opts.title,
      okLabel:     opts && opts.okLabel,
      cancelLabel: opts && opts.cancelLabel,
      danger:      opts && opts.danger,
    });
  }
  function qpAlert(message, opts) {
    return openModal({ message: message, confirm: false,
      title:       opts && opts.title,
      okLabel:     opts && opts.okLabel,
      danger:      opts && opts.danger,
    });
  }

  // ============================
  // Expose on namespace
  // ============================
  QAProof.safeJson = safeJson;
  QAProof.saveActiveJob = saveActiveJob;
  QAProof.clearActiveJob = clearActiveJob;
  QAProof.getActiveJob = getActiveJob;
  QAProof.announceResultsReady = announceResultsReady;
  QAProof.buildPollUrl = buildPollUrl;
  QAProof.buildScreenshotsUrl = buildScreenshotsUrl;
  QAProof.buildCancelUrl = buildCancelUrl;
  QAProof.scrollToElement = scrollToElement;
  QAProof.getScoreClass = getScoreClass;
  QAProof.capitalize = capitalize;
  QAProof.escapeHtml = escapeHtml;
  QAProof.escapeAttr = escapeAttr;
  QAProof.truncate = truncate;
  QAProof.waitForImage = waitForImage;
  QAProof.confirm = qpConfirm;
  QAProof.alert = qpAlert;

  // ── Server-side PDF helpers ──────────────────────────────────────────────
  // Replaces jsPDF (browser-side) so all PDFs go through the same Playwright
  // renderer on the API — consistent output, screenshots always included.

  QAProof.downloadServerPdf = async function (data, filename) {
    try {
      var resp = await fetch(qaproof.restBase + '/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce },
        body: JSON.stringify({ resultData: data }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var blob = await resp.blob();
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url;
      a.download = filename || 'qaproof-report.pdf';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch (e) {
      console.error('[QAProof] PDF download failed:', e);
      QAProof.alert && QAProof.alert('Could not generate PDF. Please try again.');
    }
  };

  QAProof.sendServerPdfEmail = async function (data, filename) {
    var resp = await fetch(qaproof.restBase + '/send-report-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce },
      body: JSON.stringify({ resultData: data, fileName: filename }),
    });
    return QAProof.safeJson(resp);
  };
  // ────────────────────────────────────────────────────────────────────────

  // QAProof seal PNG for PDF reports — loaded from separate inline to keep helpers clean
  // This is set here so pdf.js can reference Q.cachedSealPng
  QAProof.cachedSealPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAYAAACAvzbMAAB+nElEQVR42u2deXhU1fnHP++9kwAJ4IL7CkgFBRTEBZdflbYWkklEMiHaam2tdWlt3Wqrra1irVtba7XaqnWpVqsNmQRMZoDaNmpdUDYVVKxs7hugIgkkmbnv7497EwLMlhAgwPt5Hh/DzF3O3HvO+Z73nPO+LxiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYRiGYWyviD0CY4eltraANeyG4/ZDZVecpCASAu0DgEpPv5Xo2qC5fIFqAs9VRFcScpfjNq+gtLTRHqZhAmIY24847EaT0x9HB+BJf4T+oP1B9gX6Bf/16qK7rQFWBP+9i7IMR5ehzjJUl9HDW0Zp6XJ7KYYJiGF0J+6enUe/5QfjeKNQDkV1KMKRwF7drKSfAa+CvIrqazjOHPISc816MUxADGNLEY3vBxy/7j89DAhto78mAbyE8hzwLJ73LBWl79lLNkxADKMrqIzvToivg45D+TJwwHb+i98Cngamk+/906a+DBMQw8iVSZMchh99NEIRqkXAKMDZwqVoAJo3+CwfKNzC5fCA2cA0lGksmDWLSZM8qySGCYhhtKIqVE87DtUKRMpB9+nCqzeDvg2yDFgG8jbox4h+As4K8FagoRU0yCrOGtuQ0xUfmlFIofZFEv1I6m6I0w+H3VHZHfQARAeg0h/YPxCeruI9hCrw/sGEkpmIqFUewwTE2DGJTjsK9b6BUB50tpvCWuBV4BWE+SSdV8hz/sdLz7+31UbtlZUu+TvtQ7JlMCLDUYYDhwFDgZ6bePW3QSfj8CgTSuZYZTJMQIztn5qandH8M1DOBQ7vrM0CLET0eZBnQGeSaPwfFRXJbeIZVFa60HswIT0G9ARUjgOGbMIV54HeS7LHI1Sc/LlVMsMExNjOrI348QjnolpB5/wvFqJMA6nHWfscZWUrtqvnU1u7G81yHDAGkSKUwZ24SiMik0l69zCx5DmrdIYJiLHtUl8fYuWaCOjlwJEdPLsB5N+ITkOc6UwoWrZDPbvKxwfgOkUg44Cv0PEF/Fkov8NriG4zlplhAmIYVNb3xmk8B+FS4MAOnLkW5V84MplEr2oqxqy2hwk8UN+TPmtORnQi6ASQ3h04exmidyEtdzNhwmf2MA0TEKObCscTO+E2XwpcDOyc41ktIHXAP2hw63LeCbWj8tCMQnq3lKJyGhAG8nI881NU/8Ba5w+cWbzKHqRhAmJ0p07th6j8FNg1x7PeRPQ+3ORfGT/+o61a/ofjfclP9INQL/I8f30moX1wxPdw9zRBSL7w5c5ZA4k1NIdWbPWOeOrUPWkJnY7ouSBDczxrJfBH1sjvTUgMExBjK1oclb0IFVwYCMfuOVobUfDuoSz85Gb3Y6isdKHnAbhOf9QZgHj9QfoDB4L2A2kNqpjXyTu0ACtAV4AsB95GZCmoH0Qx6S3jtblvbfZtxKpCzbQxqJ4HlOX4ez5GuInPC/7M2WPWWmU2TECMLUdVvBTR24ABORz9BcoDeN4tVJS+vXnE4omdCLWMwtPhCMPxtwgfChRs5SfViO+f8jLKAhyZTyJvzmbbblsZ2wuXC4CLgF1yOOMdRH7BhKK/mWOiYQJibF6itUeAcyvw5RyOfgvhNhrlvi6fLql8fACOczyIH1RRGEr6kCcKvA8sQ1gK8haefgK6AtdZAckV4K5A3S/Ib2kBYPbsz9ssh0mTHI48cicAmvPykGQfSPYDtx9Jz7dkHNkdbbVwZADo3hnalwcsAH0W5Tlc95ku32X2cLwvBd55qFxELk6aIk9C8hLKSl+2Sm6YgBhdS23tbjQ7NwFnkz021Tugv2b5Xg9w/pEtXSMY9b0JNX4Vj3EI44D+aYRiCcgroK+gzMdhPj3lLYqLm7bo84rHe7Ba+uMGFpHqYfhe6APStLuloNNRZxqN7n+6bDNBZWU+Tu9zEL0K2DfL0UmQ+0g6P6Ni3Eqr9IYJiLHpVNdNROUOYI8sR36C6C18Xnhbl8yrT526D8lQOcp44AQ2jiv1BcLzKM8hPIebmMn48V9062f5cLwvPRiNo8cBxwGjgT4bHNWE6DN4zhTEiRIZ90GXCIlb8B2QScDeWY7+CJGfUlb8kFV+wwTE6GSnU3sArvwZpDjjccoqRK4nP3nHJidImjp1TxJuBOS0QDTaWzsJ4FmU6SAz8Fa/ss07yVVWuuQVjMCTrwPjAlFpn9/EQ+RpPCpx3ChlYz/epPs9NKOQwsRFwM9SCNdGdifID4gUv2uNwTABMXJDVaiJ/wDlxiydjIfqfTh5v9ikjq2+PsSnjeEgPtY4wG337afAFETrSPT493Yf66nyiZ1wW04GDQPjWX8hPAnEQe9l18I4Y8YkOn+f2F6E9HpUvkOmKUllFciVRIruskV2wwTEyEz1jD3QxP34TmoZao48ieilTAi/1PlO7PEBhELnoJy9QQj3z4GpqPMPvC/+RUVF845pAVbmEyr8OkoFyniEvu2+fQ94AMe5b5MW4KviIxH9A9k3RTxBKPEdxo9/3xqJYQJibEy07hSQe8ns0/EJcAmR8N87L1K1x6LOj4EJ7Ua/HsK/UPkLvajd4ove3Z0H6nvSd8140O8BX23XdpOgNeDcQqR4ZueFpO5MRG4Fdstw1McI51AWrrMXYpiAGD61tQU0O78Hzs9y5N+Qpks7FQl30iSHYUeHEb0CP595Kx+CPAjePURKlmzW3zl1ah+S+YejyTyS+r+2/OOTJjkcdvSZKN8EHYjgoTob9PeIewiq3wFpBJrAawanAbwkSb1ps/m1ZBT6+H6IdwYqP2D9FL9zELmdxOpHOrU2VBnfHde7FeSMDEcp8GeSDZdTUbHGGo8JiLEjUzl9EE6yOnC+S8cyVC+gvGRGh6+vKkSnlSD6a/xtrK3d0Es4ciuf7PFol231TS+Qu9EsfwgW5kNtJVBqyEv8gEToLuDUFGe2AI8DkdQX9kYRKZ279d5dpYvTuzjYontMu29eR+SmTgtJdWwcyl1kDoT5Mo5EmFC82BqRCYixI1I1rRjxHiazx/LfSBb8oFORcaN1XwP5DTCy3ej136jcTqSorssWZSvre+M2jAYZDXwJIQ9kOmXFDwW7jmYCw4Ia/xpKT2BgUKS3QfxRvOj9iPwRZT+UO/3RvbSA5gFrEC4D9R0KVXYiye1UhD/sFu+yetoJeN4VCOF17VpfRbiWCeGqDj/rqVP7kMj7Heh5GWyRVSDfprx4ijUmExBjR0FVqIn9FJUbSL8D53OU71MefrTjnVn8RFRvAUa1E46pqHMN5UWvdN0IvL437pqnQA9j/a2vQe2WM1H2Bb3ZL4N8g0jxP/zptKN+F4Sbby3hfCLFh7d1tNXxr6D673ZX+4RIeI9u/25rYiPw5FrQ0nbt+0XE+TFlRc90fJARiyDcQ/ogmQryG+a/+POtljrYMAExthBTp/YhEXqUzLus/kPSO6ttjSBXpszYn2TieuDMdnXrXyg/ozw8e5PK/XC8Lz01DDoGkaEoHyLyW9DHgqmWlSgPIrIc9KfATqDPgDj4vhULiITXTdPF4z1Yq2+h7Bm0hN9SFv7p+hZU7BPWLSo3AA+DfBZ0m29RXvznbmxdHoboL0Antuvq6/CSF1FxytIOv1cv+RCqJ2XoSh4n2esMy+FiAmJsr1TW7ovrxEifi9wDmcT8F6/v0Giysr43buPPgUuBnsGnMxHvMspKn9+kMkfjp4GeAZzc7tqtrAWeAEqBj4iE9/Kth9gtKJcBb+H7lOwHUkOkuGyDa1f7CZoAkV9QVnz9BgIyk/XXFtqzviB1V6qnnYB6vweOCj5ZA/o78vWmDjl9TprkMPyoq4FfprdaZS6hllLb6rvj4Ngj2EGYEhuO6zyXVjyUVQhlRIqv65B4VMfG4TYuwPds7gnyPuj5zJ91fKfEQ1WIx3us65O0LBCInoFFcQVwoy929AT2Co7ck6raL6EqrAu58rTfYQJoCodIfbPd7z8gRYfYPiz6h4hcD3Izyu2oPrZNvPeyomcoKz4G0QrgbaAXyC9pdhYwOf71DgiIRyQ8CXVK8Z07U728I0jkzaIqPtIanFkgxvZCdexklMn+tE5KXgYt69A2Wj+44u+Bb62zBvS3NOTd3KlAgP5C+DdBfoTIcnoyjuLipiAOV6U/3JFiJhRPC6yH6aBjQd4BDaLN6jMg++EHWlyJul9GEr8JQrF8yvxZu60njtHYDYHwgfIK5eF14vrQjEIKWz5slz52NpHwUdu2BVrfG7fhZyA/Bnrgr009SNL9cYeCJ1ZOH4SbjNJ+V936QrIadU+jvChujc8sEGObFo/4GSjxtOIhPEqy4dgOiUd13USandfaxEP4L0lnBJGSqzsdRdZt/DHI3cAwVE9iDX9l0iSH1XnxNivC00iblYJX2GqyAJ8FP+YE1kXp3RVJPovKG8G/d2H40RPXs3R8h7zW53AY1bEL277rnfjV+rnHddtPulQxZjWRkqtIyhHAc8EA8ju4ydeorivL/TrjFpHvHYtQmWZc2hvxplBdd7o1QLNAjG1XPM5F9a60AwXldhbMujTnKasNt3Yqq4CrWTDrj5u8A6cq/n1E/wQ00xZ1V24mUnxlu7WK5QiTUM4Cjg46+2sQORY/htYHwLF4MhhHK4GdUD5BCOFvVf4U9CeIswjV7wJnBXf/hHXe90vxk1DtGZRhhZ+9kH8RCZ+83dQNVaE6di4qv20XIqVjW7ZVher4NcA1aY5IAhcQCd9rjdEExNiWiNb9AOSONO84gfAjysJ35S5GtceizsO0+U/IDOB7HYrU6nc43wDOAxkG2gD6OEnnV7icCDrZX0PxHg2mWUC5BOET4JENrrYS5bcsmPUbhh/1c+A6QMn39qC0dDmTp30Vx/sn4CDMR/kSGy/Cg8iDJJJX4Th3IpzS9rx8H4d7ED0W33M+RiRcst3VE3/n3P3A14JP3sTxzmRC6YsdEP/vInoXqVPpKsKPKQvfao3SBMTYJiyPuitQuSnNt1/gyGltawm5dfpXBaPMELAW5Uoixbd3yDnNTwgVRUm1cPsOoj9F5VEgSbKhALfwH/je4R7qfBvx7sWft1+K6tXkJae25f6I1o0B+U9Q4PFESh4PLLBrUb3an/7iRhzpB3pEcM/XEf5OWXh6Wynq6nahhYEkQ2vxVr25wwRxVBWqp10Gen3wjFsQ/SUTwr/J+R37TqNVpF1nC6xJwwTE6MZU1V2FyK/TfPsxDmNzjqD7cLwvvfjruq2uvIZwRqci8EZjjwDfBF0N/BJ1/wfeOQhlwTh1IcIQAEKJfWlq+hS38Cn87adrUeYiHAd8RLJh3/VCdPixvD4LRsC/IRK+whetShe31yngzrKcFrnUnelDkeTfaV0cV+pwm7/FhAmf5WiJjER0BumDcf6cSPhGe9AmIEZ3JFr3I5Db03z7IaInU1ayIEcrZhgq1cCXgqpyD6t6XdypTIO+/8nb+GsxZxMJ/7WddXM/8J0NquWxwH6BQ+BRQWfWgOAvnIucRFnxU+t3XrE7EJbjePEOTb8YG7yryl6ECu5A5btBD/EGCSmjovi1HOvNIag8Qdr0uXI5keJb7EGbgBjdierY2Sj3pXmnb5N0v0rFuEU5dgITUXkAKPRH/3Ih5cX3d7psNfEiPPW3dDqMXM+CeTjel176P2BPRNTfHaWr2+2A+gw05O/saf1e/kik+CJ76Zt1MHJeMBjpAXwB3reJlNbkJkKPD8B1/0Xbetl6KOgFRErusYe87WPbeLeLqYe6M1HuTSMeb+KGTshZPKpiF6PyWCAe7+J4J26SeAAkkuvCfqsOWe+7M4tXAfe3WST+uKY36KvABTSE9gNOx8978RlIHJFKe+mbmUjJPeAdBywD+oATJRqblNO5fqiUrwCLUw9a5U+2xdcsEKM74I/uHydVMEF4Czf0f5w69p2s16mvD7FyzZ1tW3SF/5LnlVFaunyTy+jH31qOvz23nkj4KxtYT+NRprT75G7Kir+/3gJuTfwgCx2+NSzbGXugiRr8eGIAfyLZcFFOYeKjsQPxowGk8PKnBSFMWfgJe8hmgRhbpXHXDcPTR9OIx0cknbE5icfUqX1YuaaunXg8Sk85uUvEAwh2S/0j+NcYqmLf2GAcs8e66Q0AQhvt/jHx2DqUjf2YVQVfBZkcfPID3MKpVNb3zm7FhN8i6X4V3z9nQ/JQolRNO8weslkgxpZm6tR9SIRmAvun+HY56p5E+bhXs1swNTvj9YiDHht04R1zLswVf158Ab6TXgPwffK9KGs5Gsd9JMiJvhRYhXANZeGp9pK7ERs7Dc4i6Y7LKQRK5bTBuN5TtDlnrsd7IKNtl5wJiLHlxKMPidB/SR0Y8XNUxlBePC97w47vjqP/RBgBJBH5PmXFf9mMFtPpqDyS1vIVPga5C7fl7q0a0bWy0iUU2hnN39inoQefUlLy6Q5b9/yIAXf471Dmkp8cm5OlWlM3iqT8p53Xe/sXP5dkrxMtFLwJiLG58cNqP07qfB65zytXxvbC5Qn8TH1JRL5LWfFDm738k+Nfx/F+DzI0+OQT4AH8nB4TAnG5h2TDpZvFka+yvjfu6oNRZzCODEF1MCJ7oroLsDPKLqk7ufXH4/gRaT8FloO+g8hSPFmKo0tJJN/ocM6NbUpEYt9AeAh/6nQhSe9rOeWOqaobi0gdqaZclalEiid0WZZKwwTESDWKb+ddvfHb/H5O4UmmTt2HhPsUyCCgCeG0LT5lFJ2+NyTzmT/rnbbpsuj0vZFkH8rC/+siS6IXbsFokC8jHIdyCKmn/DYHnwLzUJkLOpe8xFPbVZ6M6rqyIHJAPvAmuCcSGfdB9vdedw5ImthYcjWR4uuskZuAGJul0cZKUKaSegro10TCv8zeqcZ3x9WngEOARlTLKC+ZsV08nwfqe7JT40nAiSj/h++EmJ/m6M+ANxBZiOo7IJ+hfIokP8XjU1w+ReWLFMbHznihXXCTu6Kyq78BQA/A93kYEAhUKE1rewOPeqCenvrENj8V5u8AjAK9QF8lX0/KaTorGr8J9IoU33ioU2ph4E1AjC6fepk+CDc5C9g5xVt8lAnFZ2Q1/yuf2Am3+d/4ucqbUWfCNt9Y4/EeNPJ1HK3A45QU008KvAo8Dfoy4rwB7uuUjf14s5Snvj7E542HkNAjcGQkcATKERB40a+jBaEe1SiSN2WzlWfzD2pORqnFdzh8mR46Jqswqgo18cdQKlJ8u5Jk8sjtegrQBMTYotTWFtDkzETYOIWq8hJew3FUVKzJeA1/4f0J/BStLQgTt9mdTpWVLqHCoqADOoX1A/glgXkIT/ui0fQMZWUrtmp5756dx24fHw06Bt/B7ljWjwycBOoRvY+eTg3FxU2bv+Ov7of2/AsOP9nkLdL+dNY/AsvrORpCX8+aF+ahGYUUJJ7fpDptmIAYORCN3QWcn+KbT3HkqKwdQGWli1tYg58a1gO+RST8923QCtsVJ3kOwg9YlziqtQN+2k9wFKru9qP5h2YUUpgsAiKgYaBdul1ZgejDJOSenONPda5O3Qn8APgUdc7cZEu0qu5MRB4EHJRp9Cs4hTFjEhnPqZnWH09nB/lWNlSRO4iU/MgavwmIsSn488yxFO/Kw5GSnMKyR+N3r3MSlPM261bdzTJarhuGOj8CPRPfj8Qfp/rTUpWEklHGj/9om3y//rrNWDzORgizbv1EgTh+dOGnN899G+4MgiYqyG+Y/+LPN8n/x89Bc2dQ+jspD/8w+7tNu66nCKdQFq6zTsAExOhUg5y+NyRfJmV47Bx3rLTPDSJyPWXFv9hmfn9V7Eg/NL2ObffpFyB/RfSOLtut1Z3etya/jeg5wQ65VmYi3MSE4se7fJtrdewilN/hh8J/gWRDMRUVKzfher9B+UnQu1yWUyKp9DsLP0JCh22z60M7ABbKpLuiKpD8S2rx4Gnmv3h9DuIxEZUbgsb8KBOKfrlN/Paaaf2Jxu9GeGGdeOgiRK+khx5IpPii7U48ACLjPqA8fBPzZw9G5RT8vOUAo1GmUB2fSXX8K116z7Lw7cDXgjwtx+AWLmbSpFCnr/fKrCtBqwIb4ndUxU/Nfs6L1wL1Kb7ZE008uC7IpmEWiJHrSO5ClDtSfLOSpHdYVsetKbHhJHkeKAR9hlWFJ3cql8eWxA/PcjVwTttUjjIf0V8wf3Zdl4dX2SbqQfxEVK/Ez/keaCnTwLmS8qJXuu4+tcei7j/x9AYmbmLSpwfqe9K38d/AcaCr0dDorGF1KmsPwHVeJtUuQz+v+t3WKZiAGLngN6YFrLe42vbKTidS/I/MI/ianfHyX8RPBvUW+d6RXRYYcXNQXx9iReOlCJNYt8axDLia+bMe2SGFY0OisS+D3NQWswwSKH8kL3FNW2rfbiV8M/ZAE3OA/YCFrJFjgtD96amKRRCqNrbGWYXIUIuX1f2wKazuiOv+MaV4iN6fVTxUhWT+fYF4rEUp79biURMbwcrGmQi/CcTjE5RLSDYMJhL+m4lHQCT8NJHi41CZgPAGEEK4lEToNapikW5X3rKxH6OUA03AEHrqQ1mnosrDUeChFMPcvqB3WSUwC8TIPtL8JvBIim+WkSwYnjXgXDT2C8BfXFc5Z5OTQW02K6uyF6HCq1Eux5+uUtC7SPb4GRUnf24VIeOzy8cp+AkiVwG9glF6NT2887vdYKE6dgHKn4Pu5goixb/JeLyfoXI+KXOIyEQixVVWAUxAjJSNrbof2uM1YI8UlsW4rCFHqmuPRZ2n/Q5Z7iFSfH73FMlpR4H3MHBw8MlCPD2PiSX/tUrQkedYNxD4I0hx8MmHqHNOt4suEI09gJ/3vgWc44kUzcpslbZLgbw+H9JDD92hoyF3M2wKqzuhPW5KKR7wt6ziUVnfG3Ue9MVDXyW5+pJu+Rur4t8H77+BeLQAv2ZVwUgTj04QKVlCpCSM6ndQVgF7IV4d0bo/8UB9z25TzlUF30eZD+SB9yhTp/bJePyE4mkgj6X4Zi+auN5evAmIsXHHOhL4bopvlpOUH2c9P7TmDvx1jybU/Wa3CwPx0IxConUPI/onoAfCG4h3FJHwL7v97rDuTnnJg7jO4fjpYwXk+/RtfJopM/bvFuU7e8xaHP0msBY4iEQou29IfvJH+KH+N5w0Oc+yGJqAGBu1C/1DyvehXERF8ScZz62um4jqt4Pjr+jS7Z1dIo61QyhseQHkjODHTsZNHEVZ6cv24ruICUXLmD9rDKq/wA/tchTJxByidWO6RfnKShaAtDqxnkN1XVnG40tLl6P6kxTfuIh3q73wbtJt2SPoDh1srAJh491VIk9SVpy5A6it3Y1m51VgD5AZlBUVdaukPH4Socn4u8paUH5Cefg2e+mbkcnxr+Pw9yDGVALhEsrCd271cvnJ0GYAXwM+IukemjUlbnXs6SA0/wZ4ZURKa+xlmwWyY/NAfU+Em1N84yHe5VnPb3Z+D+wRzIF/r5uJx5mI1Abi8S6enmTisQWYWPxPkomjgHlACOUOovGbtrpH96RJHknvHOALYE9Cid9mPceTi/EDgG7Ydf2uW63zmIAYW4WdGn7I+pFlfVTvY0LJnMyjs/hXgDODN3lFt3K0qopdHERnzQN9FTd0HBNLnusORevf/6SeAw4ZcfKAwSMmDho8YvzAIYcfvN3Vq4pTlrKq4Li2sCLoFVTHKrd6p1tR+jboVX6R5GyqYydnPL68eB6pfENgIH0bLrAOxARkx6WyvjcqqeZ5v8CTq7Ofq/cBgvBfXpl1T7f4TapCdewWhD8E9espnJYTOHXsO93lsS9b9uRakvo5ImFP5DFw3hg4ZORbAw8ZecU+o0YVbDf16+wxa0k2ng4EYUCknL5rplBZ2Wurlmv+7DtBngcE5c/U1mZ+5qHElYGFvQHycyrre1tHsvWwNZCtSTT+c9AU2xJzcLiKxm4AfgY0kZQjNmvuiI6IR03s3iBEOECUVQVnbuldVv37n9RTeq46GfRrAsOAnUXohfKxwkIVnpUm5/ElS+Z8PmjQyN29kPwG9DvB6R+KyCWLX5/7j+2qrlXVXYXIdUGbf4Jkw/itulOvqnYI4rwE9EDkV5QVX7PZ2ophArL9WR9P7ITbvATYdYNvPiTfO4jS0sb05z4+ANd9DegJeh2Rkqu7xW+qjv0B5eJATf5MsvFHVFQkt9Tt9xk1qqDXau8yFS4Gdsty+BqEB1s8rnvnjXnvDzhk5LdEuRvfs1tVuH7p6/Ouxs/LsZ2ISOxihFu7jYhUx25EuRJoJOkd4k9vpeGhGYUUJhYDe27Qha0g1DKgW8YD2wGwKaytRajlshTiAegNGcUDwHV/64sH79GQd3P3EI/4tW3iodxFWfjCLSkeAwePPLJngzdPhetyEA+AXigX5AmvDxwy8htLX5/3N0Qn4js3iii/GDhk5O+2qzpXHr4N5dJAFE/G7V3D3bPztlp5EgXXg7wPFOC6mevxWWMbUFJYGtqPFvci61BMQHYcpk7tg+rFKb55h17OPVlM+eMBfw+9yBVZc09vmZHtZesSAukjLJh14ZbcDTbgkBEnIzzJutAorXwCRAVuEbhFlX8AG2Yu7Av8fcCQET9f8vpLMRXOaffdZQMOGfmt7U5EhEuCdzWW3T+6f6vtzqoYs7ptQR09ncl1/5fxeK/hz4HgbGCEyGU8NKPQOhYTkB2DltC5wE4pRlO/pri4Ke15qgJ6WzAFMZMJRVs/r3lV/LsIrSP1WpbvdfaWjKA7YPARh4lKDdDWgSi6RIRvHLDXTvssWTivfPHCeZcvXjjv8qVvzDt9ycJ5+yhyCrCes6Ug1x805Ijzlr4+72/i+634nyt37T945D7bVf0rC9+O6jXBwzqT6vhNW60s82c9BMz2eyPJvK23omINojek+GZXClu+ax2LCcj2T319CCGVyf0Wy/d6IOO51XWnAqP8ns27bKv7fEyu+z9E7woErZ5VBRWcf2TLlrr9fvsd20tEo+3FA+SRArfl8MWvz3vs7Q8+HzFkyNH9fKEZMXHgkJF3DRo8onTpwoPivdzmo4T1E3YpetugoSMPTTruRSifBR8X5AlXb3f1sLzkVyCt1u5PqYr/cKuUY9IkD08vC/51DFXx0ozH95R7gRTJ1OQSKitd62BMQLZvVjROBA7cuP5zW8bOV1XAad2pEqOs9Pmt+jui8f1wZDKtfh6hxPgtvduqR5+1lwOD2inAfUsWzv3W2rVuwcDBR9QA1y5c+OKKgw4eWSQijwHneyJTBg5Z/NKaZM/BixfO+xGqf2jfPXlJvXnZq7M+FOG+dp9/9+CDD993u6uLydU/AHk8MLVuZXLtSVulHBNL/ovwz+AlXs+kSen7peLiJpDbU3wzkFBBmXUwJiDbN23zz+sNfVeRyM+ct6MmdhpwOKDgXLtVf0M83gM0ir8j5lOSoVO39C6Y/fY7tpf6C8JtkyFO8osLDz748H00z30B0VNVvWv3GTWqQB3+sn5d12HgPXnwwUcNXPLGly5HeLHdCyo58EtHHJJISnsByUuIU7rd1cWKiiTJ1aeDzAVCOG4VNdP6b5WyeFwFKMJwhh01IeOxa7gL2DhnTGqfKsMEZDvBXwA/OoWq3JMxiVJlpYtKq/UxNWs+hc3NGr0j+B0e6LeoGLdoSxehR5+144Fd2iqy6i8XLVrUlHScR4D+CIuX/u/lF3s2JE8FUlkPuyacRDVMVoX1Oh4npN986825r9N+nUQo3i7rZEXFGhyJAMtB++F51VvF0bA8PBslFlhD12a0Qs4sXoWSasB1FNW1x1pHYwKynaLnpfiwBS/5x4ynhQrGA0MARZ1rtupPqI6fC3wv6FV/SaQktlWepHJSOwvus/323jnWf8jIExVO9Pt7DcLAyKgMlzl84CEjipa+Pu9pkDfatMIj6IRkbrtjj9huq+WEomUI3wKSKE/iR/PdCta5d41vYctQDjsqs8Un8nv8LdcbVAznXOtnTEC2P2pqdgbKU7SEaEYHKr9RXB50lLGtGqq98vEBqPf7oCzVlBXduLWKIv50Xus/Zj355JMJV/hy24yIyofBn/0z91lyWnC9p9tdL0jqpR+0O3T37bp+loWnk3SHUB6+jIqK5q1ShkjpXJBgLYTMOXAixe8ipIrGW8HD8b7W4ZiAbGfGR/4ZQIqYP15mv4/JdceB+iNi9W7ZauWfNMkhFLofpDfwAT11q0b+1XZOmKJ8GFglQ9od0TMQg48yXkc4yL+et3SdgOjnwU3at4/kdl9Ht8JU5MaKrrcEz/7/iMZHZzFD/5Li00J66TeswzEB2c4EZD0HtVYWUxZ+Moup/uO26ZSJpU9utfIPO+pHqJ4UWETf6wZ5qb12f+QHQtK47rFxaPDgF2S5To82GWrrw5yZAOLogHbHLbFKvEUsoSfww9ADXJbl2H+DphI9m8YyAdmOqIodCYxMoQ73ZBzFVz4+AGF8MJL+/VYrf7RuIKK/DnrX+ykvineDp/pxO7EYGFgT77QzLY4ZNGjk7olQ8lEgU2iY//mPVwa2Sb0kHjzppJNCqnJiu3s4WOy4LUWQcVDLiMYOzDC4UnBS+U6NoiY2wh6jCcj2wjdTfNYCzt8ynhUKnQO4wAd8skdlxzv+2P1EY/+murpf5y0nFUT+GkxdvUuix2Xd4omKzGv3r8OGDh3aG0+ntfsszwvJhW/Pn/+pqtyQ9ueJ/icQxhN89dC/LH79lQXvfLQqQrvAfaocctAhI39hVXkLsHzPx4AP/bqv52Q8Nqn3k3IxPWWbM0xAtjFUBUm5eF5HZNwHac+rrw+hnB10lvd32MPb3wZ5BvAV6Pm9Tpe/JnZaW0pR4dyM24236HPlX+3+1WOtl1+y5H8vzWq1KIKDfnLgl444ZOkbc28I4mBtcAldomt2fvigIUeMUuUQ4F9Nhe6lBwwfvouq3rTxq+TagYOPONsq9Wbm/CNbQB4M2snZGT3MK8IfAtNT1I+JWz0DowmIscnUTD8e2H9j/fAezXjeijUloPv4Uyo80OH7DjtmHP7awEomFP22U2V/oL4nKsFOK6mhLDy9uzzWXQplBu2msVT5oa+1cmW7wwpcV6ccfPDh+yx9Y9438Xf2LA/O+EJUTlu27Mkm0KuBa3q5zeFkS4uEWvKipN69JYjeM/CQEWGr2Jsb7x78qMH74RaMy3LwYyk+6080frQ9RxOQbd0CqUjxaSOr8zKvI4h3btBlPcGE4sWdaICBz4n+EpHOBTfs03hJ0JG2IHpld3qsc+bMaVHWC+99/IAhR5Qufn1uDWhdu88PTjjOswMPHnXckoXzft/Lbd7XQceIeMcteWPe7KFDh+Yl1+502pKF837VpKEvFTa7T4GOaXf+a4iGHdVTVfieoj/DY5C1nc1MpGQJUO9XYcm8KJ4seBxIldfkNHuQmxcz8TYnkyY5DD/6ncCSaM8/iIRPT3ve1Kl7kgi9B7iIVlBWMrlD962M7YXL20CCHrpvp3ZMVcZ3x9U3gZ1QbqU8fFl3e7z9+5/U0+31+dxg+gngAw21jHTXFq7xQs1P095XBDwRiaro3b2k+b+vvvpq4Osw0R148JtHqMP3BPk2bbuy/Os5ieTRixa98q5V5q1Add3pqDwKJMj39qa0dHnaY6OxKiCywafvMn/WgVsyOrRZIEbXcdioY1KIByiZBaElbyLgoqzi88LaDt/Xle8CeYhUdnq7retdix9yfiWe++vu+HiXLXtyrYh3BtCaE2VvSeQ/umjRAQ1JcYqAOe3ruqpOxONfa5L5XwwcMvLNgYeMXDRwyKLPcORFQc7bQDzeTCblqyYeW5HPC6cEudBDNDuRzJY+qTaZ7Mfho460B2kCso3ippi71dV4DZmnr5xg2suRmk5FuBU9I2hUf+lUsaPx/UDOCa7xKyrGreyuT3jRay/PE5VyIHhOOmbgkEUP57V8vtJJfHE8Kn+inc9IQD4wCOUgoHeqJ5DISxwTxMMythZnj1mLUBfU6YkZj20MxUi1XTsp4+xBbj5C9gg2I6pFKdThPxnzUEen740mjw8mXSo7+VrHQMtpRMLPdup00UtR8oGP+KLg7u7+mBe/MXd6/0NHneR4XhQ/cOLpXqjPPs1u84R3X5174UGHHPZnVfcqYMIGVsZ6dp/Af1C9bvEbLz1rlTcHKqfviuhIHB2B6gDgQITdgLzAKnwLeBYJ1VA29uNONqJ/gHwTlTFEp++ddufiWWMbiNY9CbJ+0EtxxgG/spe1ebA1kM1Fbe1uNDsfbWTlCd+nLHxX2vOqYhcj/AH4lGTDXls8LtHD8b700rfxp69+TiR847byyAcNOqavF2q+BjgfP8nUh4Jeuf9eOz/y5JNPJvYZNaqg1xfeiepwOLC7QL6i76s6i5P5LU+8PX/+p1Zx03D37Dz2+GAk6oxGOQYYDQzM8ewmVB/Cc66ioviTDt03Hu/BGv3Ir496IZGSP6VvO/EfIrphYNIk0rQnZWUr7CWaBbLt0CTjkBRThKr/zCLppwR/TdkqQe16cUEgHg1I0z3b0iNftOiFVcCP+48YcZ00US4qX1GVS97+8LPvDzhk5J1NEF38v3nTgGlWQXMkGvsecDZ8dASe07OTV+mByLm4lFFVdwblJTNyPrO4uIlo7HHgW4iMB9ILiJeI4bobCoiL9vwabOwHZJiAdF8cGcvGQUoWBtsTU/PQjEJI+NNXst5W1C03yuSjHwZCdu+2Ompb9tJLnwH3Bv8Zm4LqPogc10UX64dIjGjsbCLhv3VgoiQG+i2UL1NbW0BpaerQNBWnLCUaexP40gb3HWcCYgKyjTU8TkzxWeaRb+/E11B6AAkSPf69xcvc78PTQPYHEojzB3uJ2ylTp+5D0j0eT05AGAUsIRI+K83RL3Tx3V3gAaLxNUSKq3KzX7x/0iQJoCdNoZOADJtQZDroBgKyLsy/YQLS/ams3ZdU3ucO/8kiOq2L7s9ulZAhDt8JrKapTChaZi9yuxCLPiTzD4dkq2AcQyLIbbJuBXS/9N19ywt4+R5du2PTBf0bNXVLmVAyJ+vRJSWfEo29CByHJIsyCojyH4QfbfDpQKZO3Yfx49+3CmECsg08Vfm/FNNXSp43M8uZY4Mjp2+FjmYfEnKSf//WOETGtjVwqXRx+g7B8Ubh6SiE40kwEjwHJNOWmQPTdrATJnxGNPYGtDlrdhU98eR+7p59ZI5x3qYBx4EUZbZWks/Q7Cgb/tpE3nFAlVWSrh5zGl2PcnyKTxdm9KStfHwAbfGXZMYWL3NL6IxgemEl3uoZ9hK3EaqmHUZ17Eaq4/W4BZ8hyQWoPohwETAq5zbekpcpblSmgc/riN6P8H2EIpBjQceD3gKSbcR/GLt9fGmOXVVrnTyIytoD0h7mt7EUOUK8462ymAWyjSCpKmtm3wLXPSEQn1V4q7d82lqh1fnw0a2W0tToxHvzhqFc6ccdlE15/6OBKWm+fQFIHYVYnPMoK3omxTeP89CMayhI3IxwYYbR1i94OH4XZxavyli+XXvOY2XDapDeOM7xQKY00M+y0UK6nGCVxSyQbWEaoRcwPEUDfS7LmccHb2QmFRVbNn1q1fShtMaNcrxH7CV2A6KxA6muO51o3a1EY+dn6IBnds0NdXQGkcpwj2T6884a20B5+IfAtRlu3Ieemj1E/pgxCZAX12srmQVkQ0bwQH1Pq1gmIN38iRYOTW3ZZW3ogfe5bnkvaEm0Jt9ZzISSmfYStxLV8XOJxmqIxt4HlvmBBOUSIH2Ob39b+MddcPe90+bPSKxZALo6te7I6KxXjoQngdRksH4uDPLXZBO5Z3MSEHWfTznb0nf1oVbJTEC6+ZSCHp7i0zUkGv+X9pyamp0hyOGt7lYIoyFfDxpydcYUu8bmRTkZOBXYe4NvjqS+PsN0s3RU9FuAOSi3I/Jt1B1GJDw47buvqEiCzEpzrdE53dF1L2Zd0MsN+RLDjzohh+fzbFBPD6PyiZ3SHtevxxu0xUZbT+yGWyXrWmwNpMv7YhmeYgfWqxmnpbTHEaAO4NGks7ZoeevqdqEpyNeelH/ZC9wMz7dZjkEZDRyDMp3y8G1pjn4BSBU0sJDPGocBL2U475QMpfgAZQ6OPgPus/TUWRQXN3Xwl8wExqT4fF+i8f2IFGeOWnzq2HeIxh4EfpCmEYwFns54Da/HTNxmBRxk7UjgyZTHjRmTIBp7HYJ6vc7SMQExAen2o8jDUlglmRfF1TvMXwDVJZwZXrVFy9vkfBXUBZpZ41oQwU2h/TZa5XhET6CJIRtY+gngtgyddLp6NTqtgAgzSWs3ZokflfPAiBfS34PR5LJFVvTPqKQREGcccFXG8ytO/pxobBkwAEeGpxUQn/kbCQhymFVSE5DuzrAUjX9+lsbpWy0qW373Ffq14I9nOGtsg72+jghGbC8cOQrRUSijEE6A5M5tHa2mtFCPRVVSThet6jWHvo3N+OHmN6xDxwCpg3C6LbNIhJL427DZLJ2mm5hJIl134eUmIGUlC4jGFgJDUtTDkUyduifjx3+UZYD2CsIANIs1ITqfjZd0TEC6GFsD6Upqa3eDwMt3vfblZhYQDRq5ZBGazUMgIPJve4FZqK4bRrTuEqKxx4jGluHyAaKPA9cglAA75yDY/Zg846CUX/m5X17OMMpPzfjxXwCvdvi8juB37EvTfHtMByz0f6YdRrXkj8rBEpofCHFmMUg6qQZje1JXt4tVZBOQ7klzaEDqp6xvZJz2aF1AzzbV1fVTLr3w58+XomoCkrXzk2+C3Iqfa/vAzre6RIZOPe2C+GAqp+/aifOG8XC8b9c8AEkTF0tG+YE4c7mE92QGqyG7t/s6a35Yxp1bIUm9aWWt098qctdhU1hdiST7pzCbm5n/YgaP3J4HAAUAJNxXt2h5/cRWZ+zw762yvjey+kgc51hEnqOs+Kk0o99M6wAdqCccAzyc4R4/SvlNKHk0pAlzo7yAcF6Kb1x6eaOA+vSWVXU/NH80IgdRFr49feetMxFOT/FNL/p9dDgwO+tvT4Zew02XojwHAfFkAa4CFHLoqP1I51C4c893WdmY2KiPc7wBwDzrrExAuuEI1Rmw8cS3vs2kSV76NxAagCqAR29dZg9xC1FV923EOc53oGscCo6/fqDeHUBqAcm4DtAhBTkig7ikXxD3F9LTxElzXoB0G/1kdJuApFroVw4BBMWj8okHMwTyzLBdWEbnJCC791zMysYmUmeGHJL92a1eCoW+273r9E8rIP5OrHdpCw/UJkBmgXQhNoXVtQqSYlpDMouCeq3TXh90Ymul0ek+XK4APQ9/YbXd4rOkn8/PvA6QiQ9AJqNcgjj/Ry/5StojJxQvJr1jYPqyLZj5OpCu4z+VqvhvqY49jVu4qi1eFnoeyqGsi4Hi4DYdlX703zAPSF1HHc1tHWTMmETacirZp9p8q/mjwCIakOXopSneuwmICUi3FZD+Kcz+bB1OIDq61J7fFiXdaHpEsDaU3kLIzBfAs76TnlaQlD2IhPchUlxBefg2yoqeyTpQUF5M883otPP+vpWb7ryjEb0c5f9onS5N3yUcm6Hzbibd9I9qRxbrG9M82x45nr8sJzGQFG0qu+gYJiBbSz9knxQjnrezjIQHBP9fZg9wi5IuUVIebu8jOiE8oJzG/Fk7EwmfQHn4YspKJnc4B7jfkaYr284MG3VwhgrYBWFoslkS6e4hB1EZ3z3Hm6QTsR45Pp+l67WdtBYTb6Vob/tY1e86bA2kS6dFUmzhRT/OMtrcPxgZvW0PMAMP1Pekd8MRuHJM4Kx5COu2TH+B6ByQxygLP5Hbu/Jm+s7/aUb66aIne7yQPuit7JFxvSv3Tnxm2si64owGFnZQFDtSiUen9VPxx5wzUzu4IIT0GCBzKmbfutu9Q5bJxrwVtJkDsoyPP0mxJrmbNSYTkO5KvxTNanlW0VFA5CN7fO2I1g30F2ZltD8qbhwJkpd+gVkOB75LNFZPvleRMfcK+AECncJVSMp59/SjcK9hHm7hWmDjyK7+OsAdm94qky+kdQz0HQr/mrouNc9Ee2xiXHftR7RuEPBm6j5ZXsDTdIOh7AIS6n1s2qCNsCTHQn4c3C+zGDje8hS7IvtZ4+o6bAqrq6is752yU8FZkcUCCSq0rNjhn2FV3ZlEY48TjX0Eshh4BPRHwNFAXo5XGUOz89+svg8VFUmENOlUM8znV1Q0g3TFOkB6fMfA1zNYR6kpK1tBymRK2VUD4Q3gIVR+gNOyMu2RfqrjDztctrY7eeUZSrE4RyvJbysiWcQgZdsrzLjGZZiAbBXcxtSV2XPSj4T9kVjgHKYmIDiHA6XAHpt4oSEUcHsOx6VbM9g/yGuf7r11fh3g7tl5VMWOpDo2rlNlE4YHg5WO/qb2+Av9yM2onEK+twdl4SFEwt+mvPjPgRB1vGzK0Rmd+yqnDQb5bobe6KXc5M4LypdlOsqT1G3P7W1WSBdhU1hdhtcvpR4L6UdzU6bsBPn+yNrLMtW1rVJd3Q+v1zFIcjQix+DxKuXhy9L0DF2Xi0T121RN+z3lRem9+zM5BjrOaCCa+jx5Ied1gKlT96ElbxSio4Dj4aPjgAKUt9jQR2F9XgC+l6r7Q1YfSbpAgv5v+laah3IDwsNMCC/cpLD9ojNROTXFvfsybPQhpAqrUjl9V9zko6RfKE9A0+O5vVtZHkzS5TN1ap/AYkvRJBMrcFO0SUd3A961PssEpDuNnlOPCvNbPk97Sou7S9sst+jKbf4RpHNSE09AWrOupt8F43kzUzb4Tnd03kVpOuHW6v+8Hxw35Wj4mLQCkknolAqi8cGgxwLHkGA/UvfVBxKdvjeRcR9k6KTT/C5ndHoByXAefEJZyeub/FyT+gJOurIlRm8kINW1x6KJv4AMzXDV+hwsn6CeuCtwA6fJRGjXwKJKQe/PU67Lq9Pb+qsu6vXsEXRVZ5VmZLVmTfo9/07+uu2MSWnc5n5zdPreVMVLicYmEY09kcVJrZVD0yYDqih9D3inC0tYFsQaS/Pt2I9J7xiYfj4/En4LJF14mm+B/g6IAPtlmYpJv1j/yuzXSOdwJxkW+T/e6xXS7mZyjumSp7omfxZplTfIUFgTP4ho7HyisX+izrNZxANE/5Lz/Xs0NbZ7hunXMz7tk6btab51WCYg3QtNWSkTmfObe+3OcZu7v4UxbTBVscuI1k0mGnsHku+3RaP1o/oW5FTnMnk7o5m2oj6EyHmoczjJhh6EEn1R+RF+hr1U7IIUZOk00wQIVI7MEiBw07fMZvLe9rcDp0sudlza884/sqVTmwM6wlljG1AWpLfAYh/j6SL88PMnk3VXmMxlQrgq9+fmNLerTT0yPgvwch7sGSYg3cwCac79nB7dS0Aqpw8iGl9/BO16JyHcAlKedXSd+Ydn6MicmRlq662UFf+F8qJXqKhoZvz4LygvvgP4VYbOJkuqVC+dEPRijw/ThwwXr2t8LjKT7lnsQc20/p04rz9Tp3aVI126Rf6+pPfzSEUTKmd3aE3G89ZZFhrKZk1s3K6SJiAmIN2P/A4LyHqm9CdbT0Aq63tTPe0EqmIXE41XEo19hJt8E9X/26DT7JpFbs2YPyJbVr4UT967K+2UigSh8jsjWNpJocvdaj0qY65zyWDlaDJ92bwM57XkHd1FA6YuEFA8kG9n3OiQiry85pytCU3VBm0KywSk+z3KTREQZeLElq1SbFXBbfwM9f6L8AfQibRuo3U2mEtPrFkAuroLOp9hab9Lrp5L2impNB16aelyRJ9K8wP3zliWXqQPEJhJ6Fa7s9OKVnY+xY+q+1s+SeU71DY4f540270yli0v8Xz6apph2qy+PkTV9KFUx88iGr+b6tirVNelDrGumzyYaECpIFL8jw6fWVTU3PZcslkTkuLd2hSWCYjRRUye3JOUqVCBDRdjKyqSILM6cZf1o9EmGwanPdKPtvpyGrE7JsNIc36aczKvy/iBDdPlh0g/yvfT/+aSQTKJ8BrwN9DzUXcY82ftRiRcRCR8LRVj0gtyWdkK0MUdElOA8ePfJ+1mhHbnTZ26z3qbIFY2fr7RJggvTXDFSMkbgRB23P5EanDkcMrDUWuA2za2jbfL8JpTrBVmMZWluW1MNHlyXnaLJQt3z87jvFGJDs0n5+X1IG1+n5Q7w2YCYzJc8QvgFZBnUJ6lR/L5rGFFNr7xTJAjU3wxmLq6XSgpSdFxOe+mGayvyvF+qTrkQdTW7pa2/H4Sp5Fprnkd4vyb1e7sTco1LzITZVCKb0YSj/dIH9lXXwDZP4WgHkU0VgWMJsG+ZKsq/o6v+1OUS4nGXwQdm/MgQpkM3p8pL124SfV82rR8WhubS7bIxj02apaKpU0wAel2pOr887NU7qZ1lXv3/A4LSContZr4N4Gpueter15pExFpiu2gGbPy6UWUhe/YJCc1AHFmovrDlN1ZsxxD6qRKBWlE8I3s90v7m1rvF8sgPBekfq7uU0wsemrTxyXyAqJnpvimB2sYSdo1I2cmaKqwIYX4W4xzFfPRmYWXdAKyFn+n2pN4+k9enT2zawJNAi0t+W1dVzYxkFRtUJqtuzIB6V6krsg5WCCtPVdT7gt7NdP643nPpBxBqlyN6uM5d+KOprdAvFQWSAbnO3UO2GTx8Bt9pqx8GwtIfX2IlY1pYizpjOz3c2eiafu29ALiuTPTpmeV5GigC/LMZ/LO90anFRCRF4JMl5uKn1P9zOJVWd7TByhzcPQZcJ/l856zOXvM2s3S1hxn3RqGJLKJwcbtyjULpMtehT2CLkJSjmpCGR3ZaLefnWTuAjKhaBlCmvzpegTVsdLc+6dkekesfGdjAcnkfCde1/gZnFq0BEiXR2P9e0yJDWflmjr8zIIb/rhX8Rr/ldPzTOsYmGGtYeK4/6UNginSNU57K/Z8mc44Bia+mMOmTom29hF+TvWNaZTnEE4lyd5EwvtQHi6lrORmyoqe2WziAeC185/yMoiB78fj5DjYM0xAup0FAr16pd/x4TWv6xhcLehYI+Iq0u3QQSZlCJm9wXWc9LuAvIbGtBZC6i+OpLJy07dIiiiadpvoMVTHLiIae4RobClJXkkzD9+E6LmZHTnXe4EvprV40gUIFFFU02UBPDbnd5CJ849sAZ3b4eklfzPCK11Ss9VJnav8zOJVlIWnUhH+cIu2taYe69qKOGvSHrfLFz3SW/6GCUi3wku9m6Y5b6e0pzSH2o1e3Y5FCC0PzwadlubbkTlbIU4yvYAkEo1pxCtd594Tp/CwjPe7e3YeNbVHU113eienbnZBuQ34JumDETYinEZZ6fMd6CZfSCOWrQEC0/RFaZ/FbkyZNrBrBidOesfAythenXiGmZ7DKjaM1Fte/Odu1dRcb10U3mRB+vhZ7pqd05ln1l91DbYG0lUkWZ5yM6yb3A34IO0ILhprBvKDCKEdlf+r8SgiZagImYRqbdY1iSQ90gwjPCZOTDcNkaFjktHA7LZ/brzQfzye0wto5oH6KWmnOtSdiXR6zVVQvkNV7D1faHPpOL2ZSJrxVKoAgW3n6UxE0nXGoyHXHBcZf80LGVrwMaTbNOHvEvthxrcvvIEyB/QZNPQsC2a+3mWL3ZsL0d0C27sp4zZoR3dLub6X2E4jX5uAbMP0YnnKGecWL5tlsRLYi6TX8RwFE0rmEI3Xgp6S0gqJTisBajOP5pyeqSfCtDGt+BTIS6zRJlKF5hYdTzReAIwGHU2CvdNsFc2n75oRacWoSWfRC6+TVnIv4FSEYqKxC4mE7816xpr8WRQmEinbhL9wf1/q59fyAl5+6nL65z2y6a205TkSoXQilV5AvNDMtqi1Pv5CtzAHlTm4Tf9lwoTPtj1jX/sFop0l66TTDyeFgjT0ttw7XYRNYXUVpaWNwMbzsY6bxbIIEkkJncvVrEyCtJtQs6+FeJJmCitDdODi4iaQNPPyfA30ZtAJwN5ZeoL0c/j+rp/XNvGt5AN3E62dkPXITAECMy2k+x1wmq3CXZah8H3S56/IsMg/djFwI8ppJL0D2xa6I+FJlBfXbpPiASBOa1vJLAQprXpdvVkX+E1AjE0gxYhI+2VpDK27jXbv1B3Li+eBTEnTgR1BTTycuQZ46dZAMoeX165I/pQ1vPjMrqnjzt+oiR+Uw7HpAgQOzZIiN105R3Rd+tS0z/votPG0RJRI+OeUhyupKH17u2ll0iYMWaaiUln1YtNXJiDdFE05Ito9S0f8TtDYD+h8g/KuhjTeHCrXZrRCNI0FIlkERKQLgullG6FnFKn3QB5D5FfAJEhnPQBQiKf3Z0y36v/mF9K2kx6SIQR92vPycHsf0TWd5nr3+AKoB70B9Jv8r49slfpeXTeMaGwF0djz1NTsvOXamfQP/no7S3tMYYHISowuw9ZAunZk9D7IiA0+PTBLa1gWZOsb0On7lpUsIBqPBoEQ01khdWk6ptRrIJpFQLom/awfXtyfokndaaZ3KLyD8uKb2v49adJ1DDvyLkTOTXPGlxl29A+AO9L/pEwL6RkcAx1eIP2y82jg2U1+Ugm3lpB+jqMzaW54LfftyZt1/Hk46K7AIZx66udbcKTWKiDLsgxy+qc49z3rqMwC6a4KsixlJ5mxLTjLcjouG0kmdcoKUe3cFFYk/BbpdpdlZzlKHfBLmvLSRyF+ZfZrwbbSVOKy/vTXpEkekfD5ZNw0oNcTnZ5+XcYPELgyTWeUfrqtpWF+hijFXeNQWFH0BmXFf+HU8PzuIR6AMjx4F690SQSC3BkQvJOlWQcoubVRwwSkWzSoZRlGS2k0x2ttBPvwQH3Pzncwxa8hpAmNrUdQHStOIy6dExC/8LlYIYmNotGWFe8RLOb+moriT9KeOWmSh5DOUe+4FJ28kpRzgA/TiE5fJHlLhhGrZog2nMlpL4k4abYLd9FCevdkRDAIWbDF7uivKe0R3DebGAxIMWAyATEB6a5PM1XllAMzhjNx3KVt3Vvh2gM36f6edw3pc1WntkIkTT4KzUFAMmXlU24NQrf3pSw8lEj4LCIl91A+7tUOjlY7lpWvovgTlIszlOsbROu+lmEUkO5+u2deiE973v5U1u67/Q2WVED95FTizNxybazvQFr9npJeejHwNxbsl2HAZpiAdDO8lCZ1Hvk7pU8j+vILbwN+uG9Xh2/S/ctL3wQeTfPtqJRWSLrkOk4uFkiGjkN4jbKiZ4KQGp2nM1n5ysOVKNMyXPRPaa09RzKJ4ugOCN0a4FmE32+XdT0641BgF7/eJ5/fYvcVrzUZ2RdMLHkn7XGffLE/KX16XLNATEC6KT3SjIiSLYMzTtO0ejkLwze5DEn3Vx2yQtKtgahkF5C85Kz09+qiuf/OZuXDuxjSBs37En0bL+/S+7mJmaCPgF4EztEs33MnIuETKAv/mIrS7W/h1vGCKURZQaRk0ZYTkNY2IgsyWrKOc3DKz3t6JiAmIN0UP/HQxyk648OynDk/6MwP2+QyVIxbBPwtrRUSnV60QdnSrIF4jTn83kbSZ+Xrmrn/zmblKy99E/SWDFf+OdG6jWNVTZjwGcL/0pggmbIAfkSk5EwiJX8kUjTLD4K4PaNfC+rsU1t0Ab2tjWiWQJEp29wHqZORGSYg3QXR+elHTWmnRlrPOayLSnEt6UJ5i/er9awQYRMW0SHD3P+hWZzvOvBM0y7W+1n50lpjjb8mXeh56AXOn9LcsP39PNBXEb0f1TutggOTJjkoXwl6kCe28N0PC+rt/NwslfU+fMVenglI98ZLWUmHZxGd1nMGdEmnGwm/5ee1zsUKkc4vovvHddb5riPPNN09WrPypbHGKtYgXJqh8GNThjnxd7P9EvRk1sguREqGUVZyDuUlD1oFB4YfMwoCJ72E+68tdl/fWTFwuJVsO78OyzBQM7oIcyTsekmen2IGfRj19SHGjEm9XrDGmUMvTQIuBXoMdMGoztNf48pZpAx46P0K1Wn+1IOmW0zOTUA2JStfzbT+JL1jcTjGX1+QiUSK3+2AlQOqx5Ap5ElZeCpVsTqEkhTftoD7LaBmvU8nFE+DTIvwO7yVPT6o428GU6ZbiB7HggqQpJF5aQ/zM1QOSdk2DbNAunnjeiXlSPmTNQenPccPHPhqMEo6vkvKUVH6Nuj9aa2QKdPGBX9vmgWSa1a+h2YUUj3tBKpiFxONPUQ0tgzPW4rw92Db7WjEOzbldTJl5RPJvtbieRfi73T7IHBgvBb0ZPK9nYkUl1ml7SCqwTOT6i1739a2IS+nTLHbyqcNQ1IOnDwTELNAujstja/hFm4cFtxhNBmjy+qzwcLf8V33dpO/JhH6Dn548w0tlOtQnU7NtJ5pcmfnJiAiSjQ2CxiX4tvjqYr9GeFYSAxDcckYtUlGA5M3+vj8I1uI1s0FOSHFc8suIBWlb1P5xL5UnPz5tly1Ro0alfdpY/LrS15/KWWO9oFDRx0gSW+8CgWe6j+WLXxpWZcXoqp2CNCaYGvKFn4ErW0jS2gY59gUG+la+KLX69ZBmQXSvfH9Hl7e+El7mYVBnGfbOsR00VU7yvjx74Pcm9YKqYmPRdP4geRqgfikm0LaFeEC4HDAzWGEmX6bbKez8rW+l21XPAYcPPJwwFm7dm0PVQ4HGDTomL6DBo06aMAhI68bePCIowCHpHefON5/8Dh5s4gHgLjfCf56m/kvvtjh86Px6Uyuu5W7Z3cshfPds/PQwHExm4CophhoMM/CuJuAbCMmfqoKLlkERIJzpDcrVx/Wha/4xrTWhHIdqqnDjbuSu4Bkcvbr4CA7bU719vfw42P9C/g1Qik0fL49VydxGD9gyOFfW0PPXUVpGDRo5O7JUPOvPTd5nuPIgzjyZ0BB16onR0r6nWebRn19CPSs4F/3dzhz4eRpXwUdi8hFfFDXsbzke3wwEijIzQJJYcVrFwS0NExAthDPpqjAB1MZTx/afULRMtoavjO2y0oSGfcByt1pvj0SYegmWyDSPBPoijSoPXH7HJ5m5Ps0Kueg7jAWzNqFSPhkIuFfUhau22Rv9y3Mfvsd22vgwaNOOGjwiJ8MGHxEysHCQYOP+MqAISMu79//qL1QGemI+z1B8xEKki7HCjpTRN5d/OrcRYi+PmjQqIEKjytyIA7/HnDIiJO7vOArGsfjJwnzgL92vLfRrwQv82kmTUp06FzPbW0Tb6beaBEwdeqewEE5tUnDBKRbkpd4JuUY2k2zSLyu154e/DGuS8vjyY0ZosXmpS5KBywQP7Pd/7pmuO2NSvl52diPKS++n/Jxr3b7nN1p6D9ixM4DhxxRl9d7bRzXuyUp8mJLQ483AQYMHlk+cMjIWwYNGXls/4NHDVFHz3BavIf69fNWOCG9StEvFr86d5EDz4twbFK95xVa69PzSVePFeE9gb4k+VzU+dmoUaPyutYUag2Vr9ODaMwdPF9PDd7xrzpx96JgYJN5d1xL6IQ0A5DnrGMyAdk28PNbpGpgY7Kc2Sogx3Vpgp6K4k9Q564OndMRAfHpTEC9IFKv3IPIt1F3GBOK796WX/1JJ53Utn41aNCgHgOHjHy89d/LXnrpsyUL55Y0FTphFHfZwnlPvfvu82sOGnz4GMfREQ35yasVbnSTLStRdvfy3Xs+bUyeu+jVeQtFORQmul/ke7NQjnrrjVeWiqgLoG4iiqP/RdlZobeKnoRQO2fOnK7zhp8yY/913ufOXzp8fnTaUSiHAm8xf/ZTHTq3rm6XtsCNrkzPcnSqNraYyLgPrGMyAdmWeDrFCK4o4xkNef/Gj98UIpn/1S4tTY/kzfiZ7HK0Wpo7JiC5rYOsv422LVJv8fmUFT/UiUi93YoDDxm199sffr5i0KGHjwRYtGhRkyL7DR06tHf7496fM6cR8AYNOqZvMDr+kqoMLmh2LxB00uLFg1csWTjvlKWvzytTlVLAQ/TfA4cseqxPo1sg6DUAi19/6TSApQsWfLT09XlvLVn40t9pdq5wkquvXvL63Fu79MclE+fhb4T4gH696jp+Af1W8MffOmxBNjM2uPdaQsmnstTDcTm1RaNLsG28mwuRGWhbownaEIOJ1g0kUrIk5TlnjW2guu4ZVL4aOL5Fu6w8paXLqY7diXJlboKjHRWQmRvsnGwBXkF5FkfmkEj8l4pTtutQ2q54h4I84HnOHwYNGvT1RYsWNYE3qyGZPwrYoOPTF7385qOAf6sr0yWpZSEvVJOQxNcPOuSN5eqNPEGEQZ4jNwRi8Yt2J6fNobJkyZyu31BQ+cRO0Hxh8K/70jrEpsN37Kvwhch5uBONKRz8/6kg/lpqqmMHoynWP5Tp1iGZgGxb5CVn0Ox4G1l56owF/px+5O9MQfSrwKnE4xdQXNzUdYVq+h3a4wcIuYRL6ZiAtDTMxy18AGEO6j3Prr1f6XBHs62PGTwOVXhaVWZ7bu9fAVeIOjNF9NiNBER5XpIcC/x7yatz3h50yKifJ93EGeLJrMWvv7KAzDnet/A8RdPFILsADUjojx0+/5NPFOl9Fg5HUlH0RofOfaC+J9pYGjy0mixHp7I+knhbMNyKCYjRZSP+aGw2cPT6vYwWZRYQrcLlD8DOrNWTSZfLvDOUla0gGrsd+EV2rWnqmID4aVa/u72+zgHDhu3p0Ct/8YJZ7ww45IjfCOQ7qv9YtHBeWy4MVRmCowWI9BOVMw4aMmJq0pPnXdGbN+rVHPc/rmrbhoFFr8+ZC8ztdj+88omdkOZLAivzj5SN/bjD1/Drxj+D/zpG39VF4OwEJJFQZgHxGJfCUfUFKsattA5pM40t7BFsVlLtGPkKtbXpnagqwh8i8t9glFrR9W+8+RYgW0jrpm6Td3szcfDBh+/bf+iIEUOHDk3pdzJwyKjhAw4Z+WVABg4ecYYkQld4LckTYaIr6ImeMi3hhjaYktPBoAuSoZYbm5WjVOTWhry173opnvdbr8/5YMnCuXXd/kG5zZfgJ45qgNCtW6EArW3gPxnF66EZhQgnpbALbfrKBGQbJfWWw0Ka3eIsI6nK4K9TgxzQXYe/5fa2DEd8jDB1e3sVgwaN3H3A4BETATnokJGvJR3nUklI2ZpE/r8AZ9DQkYcOHDzy+wcNHnH8gCFH/FBJjnWUwwcOGXkpInuCs4ugvQcOXNIbdb7niHeQ4yWmtl8gF6Fwyesvxd6eP//Td96Y9740J0uH7r772qUL531nm3xolU/sBEF64M5aH5tCbW0BeK1BMCszHluYLCFVyB5VC4ppArKNsmDWLCBVNrrMloXjRvEz/fXBKSzt8nIl8/8ArCTVNtqy4r0oC5+2vb2KtWt7rhaRCwBV5RNakr9Z+sa8q9Vh5aBBowZ4SblDHW3Zubf7ImjEUenpoX1EWL5k4bzfI94NgJCvlzp4vVE+E+Stnj17tq1RSYJT2t9z8eJXPn7yySe33XWgUMtPfOtDV5OQLZ+at9k5FaQ30II0ZVn/0NNTfPgOkeI51hGZgGybTJrkgU5OUdnDVNb3Tnte2diP23aOCOd2ebkqTv6cZPJIVhX02Z620aa1Pg4ZdUReYdNlwH5Dhw7NR3WmhtySAYOPOFNU+i5aNHAZyusu7tw5c+a0CPqqqvPk0oUv3YDnvbPffsf2wuMHwChU67xm5zXH0dd7Ok1ntve1WLRo3ifbzUOrqh2Camva39upKN7yv63NcVHq/MyUaZg6tQ+wcfQGlX9sj/W5W40x7BFsZjwm43DJBp8WEGooAR5L33j0LyAlwFepnD6oy/MubONbavfb79hePXqv/c3ihfN+tOF3Bx1y2DBVdzhwSrPbfGEy6V1PXst3NJF38JqWvMPF5XlVfolys7e2bzFMTipHPO+RHA3MbXZbrs7HuWXg4JHfUeTZd999vh42Skw1b7uut+LciR8S/W0a8m7Y4veviR+EpycGQnBvxmNb3PFIiukrkUrrgExAtm3Kw89THX+btkxqrcIip2cUkF0L46xsfA/YFzdxNnDVjmghDxh8xLClb8x9BWDAkJE/RmTPpa/P/Wlen7V7eLA/wIDBRxwm6EUKvR3kHi+ZXC0OP1yycN4Jgw49fISHLl6yYMFHBx0ychoix9KcfEzz3FVL35hbuW6w6j0jnu/o+e6rr64Ezt5h62x1/Cw0iFul8kPOGtuw5Qdeeh4gwLt4X8zIonapplyXUjZutnVAm7mB2iPY7Ga4ppzGEsJEp++d9jzfh+KB4OCzuXt23g749DxBf99/yMgT/UfJQageNejQw4e64u3qeIFDnejNDT2SFzf1dr6rjt5YkJd4SXxHRk007vI6yOj+I0bsjMceKhyzePErHwuyrP2Nli18admSN+b9eYevr5XTd0X1t8G/opQX1275MlTmA98O2s/9GXcEVsb2Sul9Ltj0lQnIdvOUH01p/Wny25nPc+4DksDe9PvwtB3y0YW4yIHfAg6e7O1p8rvqObckVXbD0Y/8voKCXqt2Tb4/Z04jKp81NOzuKOLtM2pUwbJlT6510MudtXInyAIPvQpgycK5Z1vFTPXAEzcBewBfgFyydeZFep8O7Akk0bRZNYPy6jmpZ1K8x+xlmoBsH0womUOqOXPhXFTT5+ibULSszftW5CcZj90iUxux8VTHv7Ilb7no1XmvIcweOHjEN0TUeeuNV5Yq+ryoXKA4y/3HqA9Iz89uO2jIEecr+sGyZU+uRbxbQs3NPQAWLXzpySUL552x+I25/9lsiZa2B6ripyLyPQCUX2YMm75Z7U5tXW+qyhj1V1UQSTUQmEVZ6cv2Qk1AtiM01ULgQKpjJ2U+z/1N8MdhVE3/ylYrfjT+U5QpqD4S5FzYcgPSpHM1yOWKOgDe2p1vVnQE6n0MsHjhS391xPtjUnh56cJ5ZwO0+mNYvcv1/cYORPR+QBB5Eq/hjq00SBmHMCIQscyOizXxr5Ey94feay/UBGT7ItnjEVLGl3LOy3hepGgWrclwxPvx1vsBXhXwObAXibwHmTRpi9Wd//1vznIceRB/XYNly55cm+flnewkerR5ci9+/ZUFy16fO5MUybCNLPgplB/B9zj/hETyzK0WiUD5cWBxP0l5OHOEZ5VUW9wbWOPY9JUJyHZGxcmfI5LKJ6ScytoDsnTet/iNinHUxEZslfJHSpaAnB+UeSyHHfmTLXn7A/bse8cuhe5p60Rl1pJFi15YZRWrC1jZeD1+GlgP4SwqSt/bKuWoqRsF+GkMPDI7LtZM6w86IcU3j3FmsdULE5Dt0Qrx7knxaQhXLsp43vw5U32PcQRPrt1q5Y8U/wPVvwSjv+upjo3bUrd+8sknE12aIMkIOuJ4ERAMBuS3lIW3Xuwoj18BgjKfSFHmOGFe8mJSLp6LTV+ZgGynTCx5jpSZ++S8IO5QanyP9knB6P8UqmLHbL1G3ngxMAdwUR6juu4Qe7HbKFNiw/H0UXx/i+fYtdcvtlpZotOOgtaEa3J1xi24dXW7AN9L8c0sIsUz7cWagGy/pF4Y7EOoKXPIkgnhKpSX/PbFpK1W/oqKNSS98SDvAzuhPE51dT97sduaeMzYnyRxYCeQ93FDp2/V/C2SvNEXMplLpChzMM8muSCIkbXBNfQme7EmINs3/QqqgY3DiKhcFDhQpWlgojhtwjGO6mknbD0RKX0PJzkBWAMyCO0xNWOIeqN7UVOzM8mWacB+KKuQZDGnjn1nq5Vncu1JqHw1aAe/zGh9PFDfE+SHKb5ZTKJxqr1cE5DtmzFjEmjKcOr74/Q+J7MVUvw4MMtvaN7vt+ROqI3LUvoiot8FPOB4mt3qjAJodA/i8R54+VNAhgLNqFOWs8/E5NqTiMbO79LyTJrk4Li3BKOk5ykvimc8fqfG80D3SWHa/357z2FjAmL4eAX3kSqpk+hV/ggrgxUi3sX4W1WPYtiR39qqv6Os5DGEYAOAjsUteITKStdecDelvj7EGu9h4MSgDp3NxKJ/52a1xA/CcauAu4jGuq7eHXb0OaBHAIrITzMeW1tbgPKzFA1jBfn6V3vBJiA7BhVjVpM6qdO+9GnMPMIrK32e1uQ6IjfzcLzvJpenqnZI50UkfCeqweKrlBMq/GvgV2B0N8tj5ZpKkHJf77mCSPjvOZ37cLwvnk4B7QfMId+LdkmZpk7tg+qv/KrDI5QVPZPx+CbnQmCvFNbHLZSWNtpLNgHZcUgW3AJsnGNBuCpjrhCfK4A1wJ700is3qRzR2HcQ5xWided1+hrlJdej8rugYzqTFY3/sOmsbkRtbQFrmNrmNyFyPeXh3+Z0bmWlSy/9OzAM5H2S3vgu66yToV8GgtCAys8yl6O+N8LlKb5ZTihxh71kE5AdzwrRlM5Su+M2/ijjuX58oGDemB9TNX1o5wuinwAhkNsDR65OikjxT4BrAxEswy2cnoMQGpubyvreNDu1oH7CJdVrKCvOfbuu2/tWIBzUlV5IaEiXlGtKbDjamidHbs4ad8tdcyl+kMcNR1w3MX78F/aiTUB2PBpDfwQ+SvHNzzKGegfI924ElgD5SPKeTi+oR0piCL8DeuBJlMrpu3b690TCk0Ba85aMwW2cTmV8d3vRW4nq6n64jfXAVwAP9ELKS36V+/mxC0B/hL9eosAuON60TV5Ir6x0SXIvkAe8SXL17zIfX7sv6BUpvvmQ/KSF4DcB2UE5a2wDws0pvumDJH6d8dzS0kbQ7wUN+ziGHf2DTpdjl4Kfgz4DHIiTfBjVzteLSPENoBcF5ToeV2dSGT/UXvYWZkpsOJo/EzgSSCJyNpGSP+V8fjT25XW7BeUXIBX4sdzygLuIxu/u9FqXW/Aj4GhA8ZzvU1GxJvPxzo1AYQrr+QZb+zAB2bFJNNwJvLlx25Dv+N65Ga2HeuBBv43rDUyZsX+nyjBmTIKkno7ocoQiaqb9Z5N+U6Tkj+06nIG4+hxVdWPtZW8hovHTSPI8yCBgLcpplBU/lPP5vk/PlxEaQR6nrOhGIsVVOBwPBP4ieh6fNsaoqdm5Y9ZH7QHAdf4l9N6su8D8qAtnpvhmMb2ce+xlm4Ds2FRUNCMpF8Id8P6QNQdI0v0x/jRYH5KJ+zs9lVVR+h7IL/1/eMM2yQrxLZH2Hc5OiMSIxibZNt/NSGWlSzR+E+ijwYj9XRzvRMrDue+aqqr9Es3ObOA6lJ1BjyMa99fGJoRfAjkOZK4vAHwdzX+WaN3AnK49aZKD6zwQeJF/SE+uyHi8qiDcgh9qZcMB1qUUFzfZSzcBMcpKqhF5MsU3x1EdPzNzxz9uJaKt01dfY/jRl3a+HOG78PQqaB6MiLfJv2v9DscFrsEtnEb1jD3spXe1eMR3J1QwI1grEET/Tb43kgmlL3bgGocizjNA+/hmuyH8rW0gEyl+l/zk/wHRQEQOBXkmp0gEfgRnP6eNcAElJZnztUSnnY0fJXhDntgqqXaNjRB7BN2E6trDUWdO0NG2f0UrEPdQysZ+nPn8uvtQ+S7QhMNov/PuJjxQ35M+jbciXBB88gHCtykLP2EvvivqTl0ZKn/CTwOrqNyCt/rKDnlmV04bjOs9ib+t9glCiW+RCJUC9wBCsqBP4L+0zjqojl8DXA16AZGSzNNJ0dojwHkeyAfuJhK+IHN5Ynvh8hp+jpL1bG5cRnJqeL69eBMQY71GFr8bNIU/hj5CpCSzJfLQjEIKE3OBg4HXyfeO7HYLjNH4aajeg9AXf5H9PpL5l1Nx8uf28jtpdbj6R+C0wBpYBZxLebiyQ9d5ON6XXvoasC+giPPlNqe+aGwZ0Be4E3gXR/7FhOLFbedWxUdSXjwva93snZiDMhh0EcnCkeuJUUpRjP0DpSJFW7iDSMmP7OWbgBgbdQjTd8VNvhaMJDdoN3JKVrO9pm4UnjwP5CE8TFn4W93uN1bVfglxHwQ9NvjkXdQ5P2sMJGOD5xirQLgDCLZJywySyfOoKH27Q9epiY1A+Q6enAjeCEQAPsPxxuI5hwF/2bAmAs8Bf2WNVOaUvCkaewD4DtCC452QdVqtalox4sVSfPMBPXRo1qkvwwRkB7ZCTgNNlZLzLUKJ4VmdpqpiVyLcGPzrAiLhu7ufUFa6OIUXI1wHBHPnUgPe5X7mQyPDIGMQbvK3wKnBJ5+jchmRogcyRrFN3bEHU1Cp1kJ1NUgvv4+QqYjuhnIM/hQUwDugJ2V9X1XxHyL6x6C3uYyycOY855VP7ITbvADYb+PeSiOUlVRbJTABMTKLwBSE8Sm++SuR8NkZz1UVqmOtMY9aQMYQKX62G3eG9wFfDj5pQrgVN3GDeRdvQPWMPdCWXwZphfOCT2MkvfM7lYI2GvsZcENgUdSBNoGUABsE89QbiJT4zqGV8d1xvTNASkm651MxblHmMtceizpP+qIjNZQVRbKKXLTuYZAzNq7X1FEeLrWKYAJiZGPq1H1IhF4Fdk4xCvsGZSWPZTz/4XhfCvRFf86Zd5DQkVkX4bcW/mLsN4Cb2406PwS9mXy9Z4d3FKus743TcBkilwN92qxR+HnOwRA3rl97kgi97Xfs+j0iJfcFonIgMB1oH66kEZFSyoo75htUGdsLV+b4odf1VZKFo7Ove9RNRKUyhXiswvMO3Wq52g0TkG3PCol/H9FUnsOf4oYOz5oAqHLaYBzvxWDBehb53kndujOurS2gxb0C1Z8AvYJPP0L5DT28u3Y4IfEHAeeg/JR1EWhXgtxAL+7YJB+I6rrTUXkUSLJ8z16cf2TL+h0/L7H+Olwj6HgiJf/KTTwqe+H2/newzvUFosdQVvJ6xnNqpvXH814CNk7tLHIeZcV/sU7BBMToyMg8Gn8coSTFW/sviYYxWbdpRmsngFMFOCCTmf/i6X5+9W5MNL4f6M+Ac4AewaefgP4FN++urZo5b4sMHGq/hLg/Av1OO4tjDcjtOE03MWHCZ50U6N1ocb6FshOigsrVQUU7aKN1jOr4Gag+HNS1BEoIeJtecnBW4Zo0yWH40VVB5N8kKhOybv6YNMlh+FH/wc9TsqH1MY1IcbjD6zvGFsEcCbuttIuSl/ge8HGKRvV/hHpfnfUakdIaaE3SoxMZftSN3f53R4rfJRK+0E+Vy51AE7A7yM9JJpYQrZvsp0DV7Wfw469bnUw0Voc4C4MAhn2ABuBPIAcTKb6yU+IxaZJDdd3lNDtLgujP16C0i8brbOwNnpesAVoHJ38CPgJvQk5Wz/Ajb1kXNp7LcnL4G37kdSnFAz7Ek2+beJgFYnR6uiE2DiWe4l0peBFfJLKN6mN3Ar63usoPKC/ediKYRqfvDYnvg5y3wbTK2wh/x+Hv26RTmW9hHg1Sjmg50L/dt2+h3ElPvXeTtqz61tyDtHp/+2Fl9g0GjhrUKQW+TST8t7bz/GmsDwDwvDH05MWcphCrYxe1BWAUbqMsfEn2MtadAjIldf3WUiIlMesETECMTepE2wnA+nxG0j0q624Yf9tsNNjZpaDnti2cbivE4z1o9CYi8kPgmA26mvk48jhJL442vtBtc2NPmuQw9MjRiJQjRIADNmiN/8XjNryGKZv8GybHSnB4ENgV+BjhHMrCdUTrwiB1wf1ap6c84AZw/0SyuSeuezdwMsJrJBoOy6ks1fGzUH0gEKcYyYbxWc+rqv0S4swi1boH+gciJZda4zcBMTaVyspeuIXPA4en+PYVGkLHcdbYhszXqO+N2zgDOA5IIHraNrunvrruEFS+CXwT2CCQn6xA9J8o/0F0Jq/Mfm2rrfuoCtG6wYhzIjAGOIkNnUSF10CqwJtMWcmCrrHYkjeDjgQZiO9n8xbJ/MOpOPnzwPL5zN9coTGQr7NuW3B7VqLOGMqLXsnhfUwMFuVdhP+S543LarFU1vfGbZgJkioZ2hxWFZzA2WPWWuM3ATG6xAqpGwgym41jA4FQyYTi07POFftOWv/CzxHRAjphm54iUBVq6kajEkGkyA/st9FEyCqEF4FZqL4GshCvYGHWLaWdEXmn9xDQIQjDg2d8FKm2YivzQavwnCoqil/rkvvfPTuPfh9dgvBL/PUTD/RWkB8HR/yd+bO+xfCjrgV+QWvIEhJJPOdPCCPaXa0e9c6nvPTN7JZO/Os4+jjQA+UleupXsk67+YvmlUAkRZe0AnRUkHXTMAExum7kHTsZZRobBVwE4EYi4Z9nvUZt7W40y5PByG8NjkSYUDxtu3g+NdP6k9Qi0LEIx9EW5iMl7wT/fYzyHujHOPIx0OR7YZMMYkuBuvk4yUI8CeGwK8ouKLvisC8q+wMHgu5F2k0psgL0SYR6PO+fOXXMHaoX8a+g3u3tRvNzEO9HlJU+TzQ+FfSU4PMFwDDAQ7iQsvBd6wQwfiiutw+wJOdoAP50WBXQ059GbBpDWdmKrOdVxX+LaKr85h5CmLLwdGvsJiDG5qCq7mpErk0zJL8wp6xz/jTHU8CXgObAOXHzT2epCtXTKsA7C2RPkPf8kfGLkzfLNJPv6X4sMBoYge8gt+tm/pWfA6+jzAGdhcOLvDL7jc02jVYZPxRXFwRteS3CD5hQ/FdElMraA3DlYJC/sc6X5CMcOXuTBw3ReDnoI0A+whskOImK8Ic5iN25qKaO3Kv8jPLwTdbITUCMzYW/z76m3aiyPQlUSygvmZH1OlOn7klL6IlguiUJfI9I+K+brdz19SFWNj5Ma+TY9Wvhf8nzyigtXb7Zn58fwfYQ/KjF+4Luico+iOwBugcQwo8+67BucXctsAZIIKxEZSXoSkQ/QuVthLdB3sJtWcj48e9v9t8Qje+H6ERU9kT1ZRyK0SBrn8hXSax+Bqfw+4j+GuQDXPkxSZ0atPdnSTacuEmL9L6fyF+BEMJruImTc/rdfpDEqcEz3rAS5BbqxDABMTa1E6zvjbvmKdAjUoziVuHqV5hQMie36Sx3RnAdD/RHHcqb3aFOJ/YblJ8E/3ob5TZEegKXgfYDnsV1biAhb1E+7lV7yameYd0wVH4KfGP9TlguB70G6AO6CMRh3eaCp8E9HU1eiXBRcPzVRIqv6+R7vAjlD0HfMQtpKspp2io67ShI/ifIRrghs2gIjcm6EcQwATG6ahQ6fW9IzmTDraA+yxEdk9OuHn9hPUZr5jfldhbMurRLp1yqpg9Fki/jr90sJt8b3WZt+AH3ngvUbznIbsCzqNxMpKjORqSt76jlIdDSoM02I7yAMsIXDVmB6u/aRWEG+ACRK5lQ9DdElHi8B2v0ReAwIAHyf0SKZ+ZchnUJpK5psxobpSSncO5TYsNJSn0wUNiQZSQ5NqfpL6PbYZ7o2yqRcR+QlCLgsxTf7obKv6mqHZL1OhUnf05DaCxKq2/ARQw/8h9UVvbqumFK8hLWLfx/d72pqrLS54PpIQLxADge0cepjs8jWnceD9T33PFEozKf6lgJ1bE/MPFrX6B6QCAeCYThlIW/jMpZQe/ej7yCKmBhcLaHI/9HWfFDiCg1NTuzVm/GkSvxp+NeQ53cox3X1hZQPS3aJh7KVPK8cTmJR+X0QSSZkVI8lFW4nGLiYQJibA0qil9DqABaUny7B+LMCCKsZuassQ14DacGoUMAKcft/e8uzF1eFPz/OSLhpze2pGgvVu+B/DHYCXU4yN30bfwv0XglVfFS7p6dt92+z0mTHKqnnUBV7DbcwndQalEuZkrdkTh6Q3BUCNWx/p/J1qm+t2j6ZGkQAsVv155eFVgNZ+HlL0S5GI8LgLH0kqNzniasjO1Fs1PfLjzJbXgNkZw806OxA3GT/wH2TvFtM45MsNS0NoVlbG386KoPk3p772Lgqznvq6+KXYzw+2Bw8R7iTQyshM7hd2ItgIvI9ZQV/2L9+9Vdhciv21XJK4gU/4aH433pqWcjcgl4/UBaAwuuBKlC5G9MGPfsNj/FpSrUTD8eTZ4GMpH1HQ0/QJmM5/6R12YuYfhRr+LvJHsHuBL4FXAQ8Aro3cyffRfDjpqMUIYfomR+MGUF8DroRTlH1AWIxo8HKv2Q7CSDhFC353SuH133X0H5NiQZ7PybbI3XBMToDlTVfRuR+9NYlW8jnExZ+H+5XSt+KqIP4TukNSFcsp7PQEeJxt4CDkC5lfLwZetGt48PwHFfCkLOt05rTMNxbmjLyV09bSLqBTkidPX6i7DefxDnfVTqyE/WbhMh31WFqtgJuByHygCEI1FGpTjyIZIN311vt5T/jv+a4eLPkOQSXHkKKAw+bAB+R7LhBioqmnOvT/EfInoLkO/7w8iZOQVGBKiOHYzyL2D/VIUEziMSvtcarQmI0a1EpF360I35CHW+nlNoCt+qOQSVatYlF/oryYYfUFGxphMCcgPwM+Az0DIiJfXBwvpk4JA0Z70I+itUzg1ieH1KvrcfzXIcyFmgE1DnBUS/CiTJ9/aitHQ5U6f2IZl/OKqK0/Rqp8OfdyVTp/Yh2bMXkuyDp1Pwnfnai8oaRCbjyGN4ejUwGnQRkZIvrXfc3bPz2O2j/+EHXkwiWgG6GHWuA0rbprPQOMgFIFW47o87FAL/oRmF9E7c1bYtGH0VkbKcBx+V8UNxeSKwWlLJx48pD//eGqsJiNE9LZENpoTW41OUIsrDL+TWGdT3xl1zP+jE4JOF4J1BpHRuh8r00IxCCpNPBAmGwHe222mjaQ1HSkl6ExD5FtATT6/DkSuCUfA0Vuw5vi350dSpfUiEXvAFSJ8h2fhVnMKbEC5kXd7uFpQ4jtwK7IfHa6zYY8F6CZS6kkmTHA4bdRyeDMeRA/AYhjAMOBDhblS/BjII+Bj078CbqOMQkiWcWhT3xbbuRyDBNJFzNJGiWRuM7i9AaY2mfAaR8N+DacKr8Re5BfR1CF1IZFx9h8pfUzcKlUeCTJb+YvlaOSunxfLW8z2ZDuyWRjzMUdAExOj2VNddgUqahqqrEfkGZeG6nKdcovHLEa7HD7rXBHIVZUW/79D6Q2VlL0KFV6NcSGuiJGUNviezCzKZSHGFX/4Ze6CJ7yOsCnJYrBNAP3/3QyBvAsuCz3+Ocky7PPJNwHvAPvg5vtfSmus76QyhougN6up2oUnuB94H+ZDk6t9RUbEmCAvioO7HKa21mpqd0fzTUfZE2QvYO3BC3Ad//SL1jjGVfyL6df9v5/C0lqAfSv1dwAW9hUjJ+iE/HqjvSd81i9tSxc6ffVjbluuq2DcQLSDZ+LcOTVf5zqmXg14XiG8zwpWUhW/N+RqT419HdPJ605Hr16NrKC/5lTVOExBj25jO+j6id5B6TSQZLKjm7jQYnXYUeI/ghz8B+BdJ7xwqSt/usDXS2xsJ6gIlaGtMJDl2I7+EaOwp4MvASqCZdeE4PHCuAc93hhP9CSq/Db7zHeci4z4IHCUvR/R8lJ2BJnYt6M2YMQmisZ8BN7S724lEwk9TFXvF985vJ2jrl+nAdsKVSXkXAbcizqsknPmslSYKE1/4bU5uRr16hCQejbh5i9bLWV9d9y9Uvgq8y/xZB27kk1MVuwzhluBRlOWUEyb99OKBwP2syxnScSszGvse8GdSepijKJdSHr7NGuX2h23j3V4pL/4zqt8GEim+dUHupCp2G5Mm5VYHIkWzSDYcjtK6C+druM7rVNddQWWlm3O5zhrbQFnRM5QVP4XH08CLwLMbiUdl7QHACcEw5x6SDfvhyVjgIT+fhXd8cOTbwLjg7zUkpZzIOD8ZUmnpciLFV6K0jvbfYMyYBJWV+SA/XH8oFUyvSWtoc009zdVLPgR5HLgbuBZ/R5TvWOc4A4DpgcWxhkjJnygrfoqKcSvp05gH8s/g2lcgMh3kCRx5Fk28R3W83bSj84/gj/0YeuTxG5WhMXQ3sByYDfJZp6fbonXn4e/UahWPv9EQOjJn8VAVorFJwF/SiEcSle+ZeGy/hOwRbM8iUvIwVbEkwoOkyvkgXMRhR+3FQzO+m1MYCX8B/WKq655C5U/AnqjchFt4CpXxczscmtzf1VNLTc3OGw9tnG+2DXAc/h7sRvon8E9/TSWxPBjfxkHODn5PLRXFn6S40wHB977vg1v4zWDKqckXA52IJ63rM63PKZGyzH5a1/HtRt/HAPuj5FNWtIxo/GXQcQiDqY7dgjIcGIbHHrDmYKTXfaietFE7VL2KmroaJpTMId+roknu8Kf35DTgvxuJcM20o5hQtKxT9WJKbDhJ/sK6xFwfIHyfsvDU3Kck63tTHf8rKUOygz8NpmcSCdtWXbNAjG1XRMKP4jlF+AvXqSYYKihMzKa67pCcr1lWUk3SPRR4AH9b5nG4Oo9o7AYq63t3uIypd0p9M/j/yxs5m/VOfI22tQZnJtDDn83RV1N2dHDgBt9f4guKPObvWAKEYzcYVOW60N7qRe1Pr6nXGj4mH+Uy4GR8RzoHLehNWfEYkgV9QA9CGAxaAvhe4Z74ayR+Po0ngnJVUF+/8UCvM+LxcLwv1bHfkGROIB4K3IvTfGiHxKOq9ku4jc9nEI8vEMabn4cJiLE9MLHo36h7PJDOmXAInsykuq4s52tWjFtJJPxd4CSEN/AXX3+G2/g/onXndWhaK9XUCHI1EEW4f6PvPQ23TVl5iXU7jUQ2rs/u2kNoXesTfY3q2DhaMzuq3IlLa9DJPYKkXXmBsOYmINJOQFQFVxa0E+dpwLkoowkldmpbOK8Ys5pIyRLKwv+jLByHIP+4tNu9pPpYYCE9z6pV/Tbp/U+a5FAdP4te+kYQ0DIPWAL6dSLhczu01bk6VoI4L7LhVuR1vId4/2c5PXYMbBF9R2Lq1H1I5NWmjOLb2uWJXEdi9a86FO67traAZuenwE/wU6gCzMbTy5hY8t8u/Q3+ltV3gH2BWiLhU4jWvQkyCOUlVux59HrbdKOx7wSWEgiDg3AtX8MPq3I8lZUubuEqoACRM1G9Fdgd5I9Eii/KWp5o3SUg/m6lHrorjtPIGl3tWzJ6HZGSq9c/PvY9hD4oHyHsiTIeODEQuEhbXpbKyl7k5fXYZD+WybUn4bi3tHvnDSA3t+06y3nKqtLFLfgVyM8y9BuzSFpsKxMQY/ulsr43TuPD7ba8puIpkt5ZHd5hVVm7L65zI3Bmu7r1LPDzjWJgdZaH430p0LtQxgbXvZto3TkgrZ7NMTy9AUfew9MDcJzvgZ7lj+a948CZTWtEW3/66V38ZFMFKHcinAHsvJHXfNoRed3pQT5wED2UspLXicZew3eQnAJcgjpDER0GOswf+QdBCdexFpHfUFZ8TZe952h8NKpXIZS0DQ6QKtCfdDhdbM20/njJv4GckF7YqaYxdJaFZDcBMbZ3VIWa2E9RuZ7U8bP8SKnohZSXPNyJzut40FtYt0iLH+1Xrqa8eF7XCGGlS8PueZw9Zi3Qmib1xxvXaX0R5GjgZeAV4Fv4C+SpkhrNBR2MHwbkN0TCV+Q2wneCaTT9CpGSeqJ1k0HK05xxLnCcH5LF+wiYjzRHc8qpkQtVsSMRvRakuN3veh64rEPh29cJ5ERU7gZ2SXNEEvg182f9arNlXTRMQIxuSHVsHMojZE7z+jfWyA9z9kZef3rnayA3wXqxnjZfro+q2DGg5yAyEt/TfTFwKH4crikIxUA+yNUkV9+MW7g3nu6LK6cGawOJoEPsgTIfkXZBJPUdIuGNPfyraocgzuuBSH6T8vCjRGPXAJOCI1pA/weyANX5ODI557AgHXqX007A865ACLe1a2U+jl7HhHBVh5915RM74TbdCXJGhu5jhR8UMfyENSYTEGNHZMqM/UkmosBRGarJ+5D8Yacc1lSF6LQSf1TMyHbfvAJ6J6sKH2qzIjaLSNYNC6aQ9kU5DtgLCZWt57jnx+VqXfz2SL25ZAmR8MaRZWtqdsbL/xj4GPgpkfDfqa4bhifDCbGA5oY3OuQV3hHunp3H7h+eispP1n9/+irCtZ0SDl/4wyB/InWyslbmkUxGqDhlqTUiExBjR6ayshduwW9ALsxcJ+QxxL14vc43VyZNchh2dBjRi/AXsVv5EKUS3Hu2WipbfyH9bGBfVHsjvIcEW4MB1NkF8ZZTVvK7bvG+qmq/hDhnAN9l/Yi3zyJ6G4nG6k7lPK+M7UWI21AqMg0JEG7n84IrN6vwGyYgxjZG1bRixLuf9XNSbDxtod6PiYQf6vQUVFXsGER+DFrGujUYBepR7sVrmNKpqL/bvcgXTgC+B5zUru0mEaKo87uNAi92zEo8G9HfkX6tIxB7/Q7lJTPshRgmIEaKjiq+O67ex7rw4OmYhaeXMLHkuU7fKxo7EPScwJN8v3bffAHUIlTSU6YH3t87Hg/U96TPmnE4WoFq6fq5UHgHkQdIJO/r8G659cX8SIQ/AMdn6SpmgHN2W5gYwzABMdKOSKvj5wE3s3HY9fZ4wEPg/nyTOpbKSpdQYREq54IWs/4Oqc+Bx1Hq6KlPBF7a27GAT98V1zsZ0RI8Ttkgum0LSB0q9+J9MaNT01Rt90m55ToVnyPyEyYU3bvNZ380TECMLdmZ1e6L49yZxWcEP1OgcyMN7m2b7AdQW7sbzU4EqMB3sGu/zTgJzASmgzODXXvOY8yYxDb9jOvrQ6xoHIXI14Ei0KNT/OZ6RCphbfUmb/f1c7xcCnoF67IWpuseagi1/JDx49+3xmCYgBidnOaIlyL6J9afZkrFckR/R6Lx9i5Zw5g6dU8SbgSR8ShfZuNcGw3AC4g8g+c9h9djJhUnf969RfmJnQg1H4vqcYFj3tEpOvK1IE8hOgVC1Z3atLAh8XgP1njfBrmWdWHx0/EhohdZLCvDBMToGurqdqGJ60HOI53z4bpq9T7KjRTwly5bv6itLaApdBKSLAIpAg5KZQoBy1BewZEF4L1MwnmVhl5LtviOocrKXjh9B0JyKI4c5kfl1eHAgDRW3CJwpuEwjVDyqS7L7x6P92Ctno/ysxyEIwF6F8kev+j2QmyYgBjbIH4o8D+wLodEJt4DuZ1k3t1d3iFNmbE/icQJwPEIJ+AH98skbB+ALEN0GX5QyY+DHWUrwFmBJlfg0UiB+B13YeEXbdNj9fUhGhr8LIqNWoBDAeL2A68f4vQD7QfsARyIMgA/Z3mmzjrpOyrqMwjPos4zRIrf7dLnU1OzM5p3PupclDY/+fo8gbqXbrWt1IYJiLED4U9r3ZrGEthwdL0alfsRft/hOEy58nC8Lz2SR+DIcJThiBwGOnSDnUtbAV0NsgDkFd8znPm4LXMZP/6LzXK7mmn98fQC0POBnXMo3yKEn9t0lWECYmxZ/Hn174NcSUbfkXZTJEI1Seceysf9Z7Pv6pk0yeHQUfsRcgfgef0RGYA/hbQ/ym6ItFoPPTp5hybfitEVCMsReRvVpYgsRXUZSW8ZE0ve2SK/87CjvhrsYptAboniPgC9kWTj3ZvNU94wATGMrNTWFtDknIvwsxyFBOBdkEdIJv+0SX4MXUFlfW/y1u6GevmI+lNV6vRGvSA7oTTjqL+7TOULlCaSBSuoGLN6q5Y7On1vJHGWLxy5WIJA60aHPP1jl62zGCYghrHJTJ3ah0ToYuBSMgdoXN8qgWnAY4QStZttamd7esbJvFPw9HSEceSelno58HuSBX/c6sJnmIAYRloeqO/JTmsqQH+OMrgDZ65F+ReOTMZtqTExabWQKnvh9P4aohOBMrL6b6zHEpTbaQzda7k6DBMQY1vq+Fzc3hNAL6d9bpDcaAR9EnWm4TnTqRi3aId6dlW1X0JkHCpFCCcBvTp4hZkov2PBrBrL02GYgBjbNtH4aNDz8D3MCzt+AV0ETAf9DyHvOcaP/2i7ej5Tp+5JwjkOdb4aTE0d1ImrNCD6D9T5S6eSRxmGCYjRrXk43pde+g38zHyjNuFKb+Kny30WdZ+nX483tpmwJvX1IT5tGALOscDxvlc6X9qEK84G/QtrnMc6lfjLMExAjG2OmtgIlG+iTMR3vtsUmoDXgPmIzgd5GXHeZOee7241YamvD/HZ2v1I6MGIHo4wHN/hcSiQv4lXXwpSiSQfpaz0ZatMhgmIsWOiKkTjRwOnIZSzfpKkTSUBvAMsQ3QpHm+B8wnoCkQ/Qd0VeIkV0HN1zt7yNTU70xIqxAn1Q5L9UNkd0d0C35L+gRj2D35HqAt/y9ugk3G0kgmlL1rFMUxADKM9kyY5DD9mFJosQqQIP1Wru4VLsRbYMBhkLzYO5ri5SQIvANNQphMpnmMh1Q0TEMPIlerqfpB/MjjjUP0yaYMRbjcsBp5GmY7n/ouKcSutEhgmIIbRFUydug+JvOMQPQHlOGAkXTtNtCVJAHNBn0PlGTyepSL8ob1kwwTEMLYEd8/Oo9/yg3ESh6IyFGUUwqHAwG5W0k+B11DmIPoq4r5GXmKuhRMxTEAMo7tRV7cLTToAkf540h+R/qgOQNgX6Bf8V9hFd2sAVoAsR/X9tmCK4i1F3WX09JZt96l4DRMQw9ihqKzshds72Enl7ASaj4iA7gyAir9oLhoko5LPUFU8mnB1FequILl6RZdkXzQMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMwzAMoxvx/6ER4ptewVowAAAAAElFTkSuQmCC';
})();
