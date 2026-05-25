(function () {
  'use strict';
  var Q = window.QAProof;

  /**
   * Fetch screenshots for a completed job and inject into existing DOM.
   * Screenshots are fetched separately to avoid multi-MB responses
   * through the WP proxy during polling.
   *
   * Retries up to MAX_RETRIES times with a 2-second delay between attempts.
   * Handles transient PHP memory limits, network hiccups, and in-memory job
   * expiry after API restarts.
   */
  function fetchAndInjectScreenshots(jobId, resultData, onComplete) {
    var MAX_RETRIES = 3;
    var RETRY_DELAY_MS = 2000;

    function attempt(retriesLeft) {

      fetch(Q.buildScreenshotsUrl(jobId), {
        method: 'GET',
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin',
      })
      .then(Q.safeJson)
      .then(function (resp) {
        if (!resp.success || !resp.data || !resp.data.screenshots) {
          console.warn('[QAProof] Screenshots fetch returned empty/failure, retriesLeft:', retriesLeft);
          if (retriesLeft > 0) {
            setTimeout(function () { attempt(retriesLeft - 1); }, RETRY_DELAY_MS);
            return;
          }
          // All retries exhausted — remove placeholder silently
          var placeholder = document.getElementById('qaproof-screenshots-loading');
          if (placeholder) placeholder.remove();
          if (onComplete) onComplete(resultData);
          return;
        }

      var screenshots = resp.data.screenshots;

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
              Q.waitForImage(imgEl).then(function () {
                var markersLayer = document.getElementById('qaproof-markers-' + device);
                if (markersLayer && markersLayer.children.length === 0 && resultData.differences) {
                  Q.renderMarkersIntoLayer(markersLayer, resultData.differences, function (diff) {
                    var diffDevice = diff.device === 'tablet_portrait' ? 'tablet' : diff.device;
                    return !diffDevice || diffDevice === device;
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
        var loadPromises = markerImgs.map(function(el) { return Q.waitForImage(el); });
        Promise.all(loadPromises).then(function () {
          if (resultData.differences) {
            var markersFigma = document.getElementById('qaproof-markers-figma');
            var markersLive = document.getElementById('qaproof-markers-live');
            if (markersFigma && markersFigma.children.length === 0) {
              Q.renderMarkersIntoLayer(markersFigma, resultData.differences);
            }
            if (markersLive && markersLive.children.length === 0) {
              Q.renderMarkersIntoLayer(markersLive, resultData.differences);
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
              Q.waitForImage(imgEl).then(function () {
                var imgId = imgEl.id; // e.g. 'qaproof-screenshot-da'
                var suffix = imgId.replace('qaproof-screenshot-', ''); // e.g. 'da', 'a11y', 'fidelity'
                var markersLayerId = 'qaproof-markers-' + suffix;
                // For fidelity, markers use 'figma' and 'live' layers, not 'fidelity'
                if (suffix === 'fidelity') return;
                var markersLayer = document.getElementById(markersLayerId);
                if (markersLayer && markersLayer.children.length === 0 && resultData.differences) {
                  Q.renderMarkersIntoLayer(markersLayer, resultData.differences);
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
      console.warn('[QAProof] Screenshots fetch error:', err.message, '— retriesLeft:', retriesLeft);
      if (retriesLeft > 0) {
        setTimeout(function () { attempt(retriesLeft - 1); }, RETRY_DELAY_MS);
        return;
      }
      // All retries exhausted — show error
      var placeholder = document.getElementById('qaproof-screenshots-loading');
      if (placeholder) placeholder.textContent = (qaproof.i18n.screenshotsLoadError || 'Screenshots could not be loaded.');
      if (onComplete) onComplete(resultData);
    });
    } // end attempt()

    attempt(MAX_RETRIES);
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
    var done = false; // guard against duplicate responses when polls overlap
    var consecutiveErrors = 0;
    var MAX_CONSECUTIVE_ERRORS = 5; // give up after 5 errors in a row (~25s)

    var pollInterval = setInterval(function () {
      if (cancelled || done) return;

      fetch(Q.buildPollUrl(jobId), {
        method: 'GET',
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin',
      })
        .then(function (res) {
          // 404 = job no longer exists (API restarted, job lost from memory).
          // Tag the error so the catch handler can stop immediately.
          if (res.status === 404) throw new Error('JOB_NOT_FOUND');
          // 502 = WP got an error back from the API — also non-retryable for poll
          if (res.status === 502) throw new Error('JOB_NOT_FOUND');
          return Q.safeJson(res);
        })
        .then(function (pollData) {
          if (cancelled || done) return;
          consecutiveErrors = 0; // reset on success
          if (!pollData.success) {
            clearInterval(pollInterval);
            Q.clearActiveJob(page);
            onFailed((pollData.error && pollData.error.message) || 'Polling failed.');
            return;
          }

          var job = pollData.data;
          onPoll(job.status, job.elapsed);

          if (job.status === 'done' && job.result) {
            if (done) {
              console.warn('[QAProof] Poll "done" received but already handled — skipping (jobId=' + jobId + ')');
              return;
            }
            done = true;
            clearInterval(pollInterval);
            Q.clearActiveJob(page);

            // Isolate render failures so they don't block the rest of the
            // completion pipeline. A throw inside onDone() used to silently
            // swallow into the outer .catch() (guarded by `done === true`),
            // leaving the loader visible and skipping the screenshots fetch +
            // history save. Now: log the error, then continue so screenshots
            // and history still happen.
            try {
              onDone(job.result);
            } catch (renderErr) {
              console.error('[QAProof] onDone threw — continuing with screenshots/history (jobId=' + jobId + ')', renderErr);
            }

            // Fetch screenshots separately if they were stripped from poll response
            if (job.result.screenshotsAvailable && !job.result.screenshots) {
              fetchAndInjectScreenshots(jobId, job.result, function (resultWithScreenshots) {
                if (onScreenshotsDone) { try { onScreenshotsDone(resultWithScreenshots); } catch (ssErr) { console.error('[QAProof] onScreenshotsDone threw', ssErr); } }
              });
            } else {
              if (onScreenshotsDone) { try { onScreenshotsDone(job.result); } catch (ssErr) { console.error('[QAProof] onScreenshotsDone threw', ssErr); } }
            }
          } else if (job.status === 'failed') {
            clearInterval(pollInterval);
            Q.clearActiveJob(page);
            onFailed(job.error || 'Test failed on the server.');
          }
        })
        .catch(function (pollErr) {
          if (cancelled || done) return;

          // Job not found (API restarted) — stop immediately, don't retry
          if (pollErr.message === 'JOB_NOT_FOUND') {
            console.warn('[QAProof] Job not found (API may have restarted) — stopping poll (jobId=' + jobId + ')');
            clearInterval(pollInterval);
            Q.clearActiveJob(page);
            onFailed('Test session lost — the server was restarted while your test was running. Please run the test again.');
            return;
          }

          consecutiveErrors++;
          console.warn('[QAProof] Poll error ' + consecutiveErrors + '/' + MAX_CONSECUTIVE_ERRORS + ' (retrying):', pollErr.message);

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            console.error('[QAProof] Too many consecutive poll errors — giving up (jobId=' + jobId + ')');
            clearInterval(pollInterval);
            Q.clearActiveJob(page);
            onFailed('Lost connection to the server after ' + MAX_CONSECUTIVE_ERRORS + ' retries. Please check your connection and try again.');
          }
        });
    }, 5000);

    // Fire cancel only for explicit user-initiated cancellation (e.g. a Cancel
    // button). We intentionally do NOT hook beforeunload/pagehide because
    // WordPress admin navigation triggers those events on every menu click,
    // which would cancel in-flight tests whenever the user navigates within WP.
    // Instead, jobs run to completion on the server. If the user returns to the
    // Tests page within the localStorage TTL (10 min), the recovery preflight
    // picks up the running or completed job automatically.
    function fireCancel() {
      if (cancelled || done) return;
      try {
        fetch(Q.buildCancelUrl ? Q.buildCancelUrl(jobId) : Q.buildPollUrl(jobId), {
          method:      'DELETE',
          headers:     { 'X-WP-Nonce': qaproof.nonce },
          credentials: 'same-origin',
          keepalive:   true,
        }).catch(function () {});
      } catch (_) {
        // ignore — best-effort
      }
    }

    return function cancel() {
      cancelled = true;
      clearInterval(pollInterval);
      if (!done) fireCancel();
    };
  }

  /**
   * Save a test result to WP history.
   *
   * Screenshots are NOT sent from the browser. Instead we pass `jobId` so the
   * PHP handler can fetch full-quality screenshots directly from the API
   * (server-to-server), completely bypassing admin-ajax.php POST size limits.
   *
   * @param {string} testType  e.g. 'responsive', 'accessibility'
   * @param {string} pageUrl   URL that was tested
   * @param {string} jobId     API job ID — PHP uses this to fetch screenshots
   * @param {object} resultData  Result object (score, categories, differences, etc.)
   */
  function saveTestHistory(testType, pageUrl, jobId, resultData) {

    // Strip screenshots from the payload — PHP fetches them server-to-server.
    var payload = Object.assign({}, resultData);
    delete payload.screenshots;

    var saveData = new FormData();
    saveData.append('action', 'qaproof_save_history');
    saveData.append('nonce', qaproof.ajaxNonce);
    saveData.append('testType', testType);
    saveData.append('pageUrl', pageUrl);
    if (jobId) saveData.append('jobId', jobId);
    saveData.append('result', JSON.stringify(payload));

    return fetch(qaproof.ajaxUrl, {
      method: 'POST',
      body: saveData,
      credentials: 'same-origin',
    })
    .then(Q.safeJson)
    .then(function (resp) {
      return resp;
    })
    .catch(function (err) {
      console.error('[QAProof] saveTestHistory FAILED — ' + err.message + ' jobId=' + (jobId || '(none)'));
      throw err;
    });
  }

  Q.fetchAndInjectScreenshots = fetchAndInjectScreenshots;
  Q.startJobPolling = startJobPolling;
  Q.saveTestHistory = saveTestHistory;
})();
