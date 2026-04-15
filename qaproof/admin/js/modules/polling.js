(function () {
  'use strict';
  var Q = window.QAProof;

  /**
   * Fetch screenshots for a completed job and inject into existing DOM.
   * Screenshots are fetched separately to avoid multi-MB responses
   * through the WP proxy during polling.
   */
  function fetchAndInjectScreenshots(jobId, resultData, onComplete) {
    console.log('[QAProof] Fetching screenshots separately for job:', jobId);

    fetch(Q.buildScreenshotsUrl(jobId), {
      method: 'GET',
      headers: { 'X-WP-Nonce': qaproof.nonce },
      credentials: 'same-origin',
    })
    .then(Q.safeJson)
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
              Q.waitForImage(imgEl).then(function () {
                var markersLayer = document.getElementById('qaproof-markers-' + device);
                if (markersLayer && markersLayer.children.length === 0 && resultData.differences) {
                  console.log('[QAProof] Rendering markers after screenshot load for:', device);
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
                  console.log('[QAProof] Rendering markers after screenshot load for:', markersLayerId);
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

      fetch(Q.buildPollUrl(jobId), {
        method: 'GET',
        headers: { 'X-WP-Nonce': qaproof.nonce },
        credentials: 'same-origin',
      })
        .then(Q.safeJson)
        .then(function (pollData) {
          if (cancelled) return;
          if (!pollData.success) {
            clearInterval(pollInterval);
            Q.clearActiveJob(page);
            onFailed((pollData.error && pollData.error.message) || 'Polling failed.');
            return;
          }

          var job = pollData.data;
          onPoll(job.status, job.elapsed);

          if (job.status === 'done' && job.result) {
            clearInterval(pollInterval);
            Q.clearActiveJob(page);

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
            Q.clearActiveJob(page);
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
    }).then(Q.safeJson);
  }

  Q.fetchAndInjectScreenshots = fetchAndInjectScreenshots;
  Q.startJobPolling = startJobPolling;
  Q.saveTestHistory = saveTestHistory;
})();
