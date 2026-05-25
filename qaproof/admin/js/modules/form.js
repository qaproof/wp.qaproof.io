/* global qaproof, qaproofAdmin */
(function () {
  'use strict';
  var Q = window.QAProof;
  var S = Q.state;

  // Hoisted so the test-type handler can re-position the source slider
  // after figmaFields becomes visible (getBoundingClientRect returns 0,0 when hidden).
  var moveSourceSlider = null;

  // Single source of truth for the submit-button label per test type.
  // Used by both the test-type click handler and the initial-state setter
  // below; previously duplicated in two slightly-different inline literals.
  function submitBtnLabelFor(testType) {
    var labels = {
      fidelity:       (qaproof.i18n.btnAnalyzeFidelity   || 'Analyze Design Fidelity'),
      responsive:     (qaproof.i18n.btnTestResponsive    || 'Test Responsive'),
      accessibility:  (qaproof.i18n.btnRunAccessibility  || 'Run Accessibility Audit'),
      'design-audit': (qaproof.i18n.btnRunDesignAudit    || 'Run Design Audit'),
    };
    return labels[testType] || (qaproof.i18n.btnRunTest || 'Run Test');
  }

  // ============================
  // Test Type Selector
  // ============================
  if (S.testTypeSelector) {
    // Create sliding indicator
    var ttSlider = document.createElement('div');
    ttSlider.className = 'qaproof-test-type-slider';
    S.testTypeSelector.appendChild(ttSlider);

    function moveTestTypeSlider(btn) {
      var navRect = S.testTypeSelector.getBoundingClientRect();
      var btnRect = btn.getBoundingClientRect();
      ttSlider.style.width = btnRect.width + 'px';
      ttSlider.style.height = btnRect.height + 'px';
      ttSlider.style.transform = 'translateX(' + (btnRect.left - navRect.left - S.testTypeSelector.clientLeft) + 'px) translateY(' + (btnRect.top - navRect.top - S.testTypeSelector.clientTop) + 'px)';
    }

    // Initial position without transition
    requestAnimationFrame(function () {
      var activeBtn = S.testTypeSelector.querySelector('.qaproof-test-type-btn.active');
      if (activeBtn) {
        ttSlider.style.transition = 'none';
        moveTestTypeSlider(activeBtn);
        requestAnimationFrame(function () {
          ttSlider.style.transition = '';
        });
      }
    });

    S.testTypeSelector.addEventListener('click', function (e) {
      var btn = e.target.closest('.qaproof-test-type-btn');
      if (!btn || btn.classList.contains('active')) return;

      S.testTypeSelector.querySelectorAll('.qaproof-test-type-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      moveTestTypeSlider(btn);

      S.testType = btn.dataset.type;

      if (S.figmaFields) {
        S.figmaFields.classList.toggle('hidden', S.testType !== 'fidelity');
      }
      var vpRow = document.getElementById('qaproof-fidelity-viewport-row');
      if (vpRow) {
        vpRow.classList.toggle('hidden', S.testType !== 'fidelity');
      }
      // Re-position the source-toggle slider now that figmaFields is visible.
      // When hidden, getBoundingClientRect() returns 0,0 so the initial
      // positioning is wrong — fix it on the first frame after reveal.
      if (S.testType === 'fidelity' && moveSourceSlider && S.sourceToggle) {
        requestAnimationFrame(function () {
          var activeSrcBtn = S.sourceToggle.querySelector('.qaproof-source-btn.active');
          if (activeSrcBtn) moveSourceSlider(activeSrcBtn);
        });
      }
      updateFigmaPreviewVisibility();
      updateSavedDesignVisibility();
      // Show/hide figma upload for non-fidelity test types
      var figmaUpload = document.getElementById('qaproof-figma-upload');
      if (figmaUpload) {
        figmaUpload.classList.toggle('hidden', S.testType !== 'fidelity');
      }

      if (S.submitBtn) {
        S.submitBtn.textContent = submitBtnLabelFor(S.testType);
      }
    });
  }

  // Apply default test type from settings
  if (S.testTypeSelector && S.testType !== 'fidelity') {
    var defaultBtn = S.testTypeSelector.querySelector('[data-type="' + S.testType + '"]');
    if (defaultBtn) {
      S.testTypeSelector.querySelectorAll('.qaproof-test-type-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      defaultBtn.classList.add('active');
      if (S.figmaFields) S.figmaFields.classList.toggle('hidden', S.testType !== 'fidelity');
      var vpRowDefault = document.getElementById('qaproof-fidelity-viewport-row');
      if (vpRowDefault) vpRowDefault.classList.toggle('hidden', S.testType !== 'fidelity');
      if (S.submitBtn) {
        S.submitBtn.textContent = submitBtnLabelFor(S.testType);
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
  var savedDesignWrap   = document.getElementById('qaproof-figma-fields');

  /**
   * Format a saved-image age into a short human string. Returns '' for the
   * legacy "no timestamp" case (0) so we can hide the suffix entirely
   * rather than show "unknown age" — non-staleness on old saved designs is
   * not a problem we need to flag in the UI, just a fact we don't know.
   */
  function formatSavedImageAge(ts) {
    if (!ts || typeof ts !== 'number') return '';
    var ageSec = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (ageSec < 60)      return 'cached just now';
    if (ageSec < 3600)    return 'cached ' + Math.floor(ageSec / 60) + ' min ago';
    if (ageSec < 86400)   return 'cached ' + Math.floor(ageSec / 3600) + ' h ago';
    var days = Math.floor(ageSec / 86400);
    if (days < 30) return 'cached ' + days + ' day' + (days === 1 ? '' : 's') + ' ago';
    var months = Math.floor(days / 30);
    return 'cached ' + months + ' month' + (months === 1 ? '' : 's') + ' ago — refresh from Figma';
  }

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
    savedDesignWrap.style.display = S.testType === 'fidelity' ? '' : 'none';
  }
  updateSavedDesignVisibility();

  if (savedDesignSelect) {
    savedDesignSelect.addEventListener('change', function () {
      if (typeof window.QAProof.updateDetectBtnLabel === 'function') {
        window.QAProof.updateDetectBtnLabel();
      }
      var designId = savedDesignSelect.value;
      if (!designId) {
        S.savedDesignImageBase64 = null;
        return;
      }

      var designs = qaproof.savedDesigns || [];
      var found = null;
      for (var i = 0; i < designs.length; i++) {
        if (designs[i].id === designId) { found = designs[i]; break; }
      }
      if (!found) return;

      // Auto-fill form fields (figmaUrl only — the API uses its own service token)
      var figmaUrlEl = document.getElementById('qaproof-figma-url');
      if (figmaUrlEl && found.figmaUrl) figmaUrlEl.value = found.figmaUrl;

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
            S.savedDesignImageBase64 = json.imageBase64;
            // Capture Figma version token alongside the bytes — sent back to
            // the backend on test submit for the staleness handshake.
            S.savedDesignFigmaLastModified = json.figmaLastModified || '';
            showPreviewResult({
              imageBase64: json.imageBase64,
              fileKey: 'Saved',
              nodeId: found.name || found.id,
              sizeKB: Math.round(json.imageBase64.length * 0.75 / 1024),
            });
            if (previewMeta) {
              // Surface staleness: a cached design image that's months old
              // can silently produce false-positive diffs because Figma has
              // moved on. We tell the user in the same line where they see
              // "Saved image \u00B7 No Figma API call".
              var stalenessText = formatSavedImageAge(found.imageFetchedAt);
              previewMeta.textContent = (qaproof.i18n.previewSavedNoApi || 'Saved image \u00B7 No Figma API call') +
                (stalenessText ? ' \u00B7 ' + stalenessText : '');
              // Mark stale (>30 days) so CSS can colour it; default to neutral.
              previewMeta.classList.remove('qaproof-stale', 'qaproof-fresh');
              if (found.imageFetchedAt) {
                var ageDays = (Date.now() / 1000 - found.imageFetchedAt) / 86400;
                if (ageDays > 30) previewMeta.classList.add('qaproof-stale');
                else if (ageDays < 7) previewMeta.classList.add('qaproof-fresh');
              }
            }
          } else {
            // Image missing — fall back to Figma preview
            S.savedDesignImageBase64 = null;
            triggerFigmaPreview(true);
          }
        })
        .catch(function () {
          S.savedDesignImageBase64 = null;
          triggerFigmaPreview(true);
        });
        return; // Don't trigger Figma preview — we're loading from WP
      }

      S.savedDesignImageBase64 = null;

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
  if (S.sourceToggle) {
    // Create sliding indicator
    var srcSlider = document.createElement('div');
    srcSlider.className = 'qaproof-source-toggle-slider';
    S.sourceToggle.appendChild(srcSlider);

    moveSourceSlider = function (btn) {
      var navRect = S.sourceToggle.getBoundingClientRect();
      var btnRect = btn.getBoundingClientRect();
      srcSlider.style.width = btnRect.width + 'px';
      srcSlider.style.height = btnRect.height + 'px';
      srcSlider.style.transform = 'translateX(' + (btnRect.left - navRect.left - S.sourceToggle.clientLeft) + 'px) translateY(' + (btnRect.top - navRect.top - S.sourceToggle.clientTop) + 'px)';
    };

    // Initial position without transition
    requestAnimationFrame(function () {
      var activeBtn = S.sourceToggle.querySelector('.qaproof-source-btn.active');
      if (activeBtn) {
        srcSlider.style.transition = 'none';
        moveSourceSlider(activeBtn);
        requestAnimationFrame(function () { srcSlider.style.transition = ''; });
      }
    });

    S.sourceToggle.addEventListener('click', function (e) {
      var btn = e.target.closest('.qaproof-source-btn');
      if (!btn || btn.classList.contains('active')) return;

      S.sourceToggle.querySelectorAll('.qaproof-source-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      moveSourceSlider(btn);

      var source = btn.dataset.source;
      if (S.sourceSaved) S.sourceSaved.classList.toggle('hidden', source !== 'saved');
      if (S.sourceUpload) S.sourceUpload.classList.toggle('hidden', source !== 'upload');

      // Update preview based on source
      if (source === 'saved') {
        var designSel = document.getElementById('qaproof-saved-design');
        if (designSel && designSel.value) {
          designSel.dispatchEvent(new Event('change'));
        } else {
          setPreviewState('empty');
        }
      } else if (source === 'upload') {
        S.savedDesignImageBase64 = null;
        if (S.uploadedFileBase64) {
          showUploadedImagePreview(S.uploadedFileBase64, '', 0);
          if (previewMeta) previewMeta.textContent = qaproof.i18n.previewSavedNoApi || 'Uploaded image';
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
  var figmaRateLimitUntil = 0;

  function updateFigmaPreviewVisibility() {
    if (!figmaPreviewWrap) return;
    var show = S.testType === 'fidelity';
    figmaPreviewWrap.style.display = show ? '' : 'none';

    if (previewEmpty) {
      var emptyText = previewEmpty.querySelector('p');
      if (emptyText) {
        emptyText.textContent = qaproof.i18n.previewSelectDesign || 'Select a saved design or upload an image to preview.';
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
      previewErrorMsg.textContent = errorText || (qaproof.i18n.previewCouldNotLoad || 'Could not load preview.');
      var existingRetry = previewError.querySelector('.qaproof-preview-retry');
      if (existingRetry) existingRetry.remove();
      if (showRetry) {
        var retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'qaproof-preview-retry';
        retryBtn.textContent = qaproof.i18n.previewRetry || 'Retry';
        retryBtn.addEventListener('click', function () {
          triggerFigmaPreview(true);
        });
        previewError.appendChild(retryBtn);
      }
    }
  }

  function mapFigmaErrorMessage(code, fallback) {
    // Backend message ("fallback" arg) is preferred for FIGMA_NOT_SHARED because
    // it differs between OAuth and service-PAT auth modes. The i18n string only
    // covers the PAT case; using it always would mis-advise OAuth users.
    if (code === 'FIGMA_NOT_SHARED' && fallback) return fallback;
    var map = {
      'FIGMA_NOT_SHARED':           (qaproof.i18n.figmaNotShared || 'Share this file with figma@qaproof.io (Can view) and try again.'),
      'FIGMA_FILE_NOT_FOUND':       (qaproof.i18n.figmaFileNotFound || 'File not found. Check the URL.'),
      'FIGMA_RATE_LIMITED':         (qaproof.i18n.figmaRateLimited || 'Figma temporarily throttled our requests. Try again in a minute.'),
      'FIGMA_RENDER_TIMEOUT':       (qaproof.i18n.figmaRenderTimeout || 'Design too complex to preview.'),
      'FIGMA_EXPORT_FAILED':        (qaproof.i18n.figmaExportFailed || 'Figma could not export this design.'),
      'FIGMA_NODE_NOT_RENDERABLE':  (qaproof.i18n.figmaNodeNotRenderable || 'This node cannot be rendered. Try a different frame.'),
      'FIGMA_NO_FRAMES_FOUND':      (qaproof.i18n.figmaNoFramesFound || 'No frames found. Add a node-id to the URL.'),
    };
    return map[code] || fallback || 'Could not load preview.';
  }

  function isRetryableError(code) {
    return code === 'FIGMA_RATE_LIMITED' || code === 'FIGMA_RENDER_TIMEOUT';
  }

  // When the Figma preview fails because the user hasn't shared the file with
  // figma@qaproof.io, auto-pop the step-by-step guide. Without this prompt the
  // inline "Share this file..." red message gives no path forward — users
  // typically don't know what to do next. The modal is exposed by init.js as
  // window.QAProof.showFigmaShareGuide. Small delay lets the inline error
  // render first so the modal feels causal.
  //
  // Skip when OAuth is connected — the guide teaches sharing with
  // figma@qaproof.io, which is wrong for OAuth users (they need to grant
  // their CONNECTED Figma account access to the file in Figma directly).
  function maybeOpenFigmaShareGuide(code, figmaUrl, retryFn) {
    if (code !== 'FIGMA_NOT_SHARED') return;
    if (!(window.QAProof && typeof window.QAProof.showFigmaShareGuide === 'function')) return;
    if (window.QAProof.isFigmaOAuthConnected && window.QAProof.isFigmaOAuthConnected()) return;
    setTimeout(function () {
      window.QAProof.showFigmaShareGuide({
        figmaUrl: figmaUrl || '',
        onRetry: typeof retryFn === 'function' ? retryFn : null,
      });
    }, 600);
  }

  function triggerFigmaPreview(manual) {
    var url = '';
    var designSelect = document.getElementById('qaproof-saved-design');
    if (designSelect && designSelect.value) {
      var designs = qaproof.savedDesigns || [];
      for (var i = 0; i < designs.length; i++) {
        if (designs[i].id === designSelect.value) {
          url = designs[i].figmaUrl || '';
          break;
        }
      }
    }

    if (!url) {
      setPreviewState('empty');
      return;
    }

    if (!/figma\.com\/(design|file|proto|board)\//.test(url)) {
      return;
    }

    if (!manual && Date.now() < figmaRateLimitUntil) {
      return;
    }

    var cacheKey = url;
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
      body: JSON.stringify({ figmaUrl: url }),
    })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.success && json.data) {
        figmaPreviewCache[cacheKey] = { data: json.data, ts: Date.now() };
        figmaRateLimitUntil = 0;
        showPreviewResult(json.data);
      } else {
        var code = json.error && json.error.code ? json.error.code : '';
        var msg  = json.error && json.error.message ? json.error.message : '';
        if (code === 'FIGMA_RATE_LIMITED') {
          figmaRateLimitUntil = Date.now() + 60000;
        }
        setPreviewState('error', mapFigmaErrorMessage(code, msg), isRetryableError(code));
        maybeOpenFigmaShareGuide(code, url, function () { triggerFigmaPreview(true); });
      }
    })
    .catch(function () {
      setPreviewState('error', qaproof.i18n.previewCouldNotLoad || 'Could not load preview.', true);
    });
  }

  function showPreviewResult(data) {
    if (typeof clearElementOverlays === 'function') clearElementOverlays();
    if (previewImage) previewImage.src = data.imageBase64 || '';
    if (previewMeta) {
      var parts = [];
      if (data.fileKey) parts.push((qaproof.i18n.previewFileLabel || 'File: ') + data.fileKey);
      if (data.nodeId)  parts.push((qaproof.i18n.previewNodeLabel || 'Node: ') + data.nodeId);
      if (data.sizeKB)  parts.push(data.sizeKB + ' KB');
      previewMeta.textContent = parts.join(' · ');
    }
    setPreviewState('success');
  }

  // Debounced input listeners (1200ms) — wait until the user stops typing
  // before triggering a Figma preview request.
  function attachPreviewListeners() {
    var urlEl = document.getElementById('qaproof-figma-url');
    if (!urlEl) return;

    function onInput() {
      clearTimeout(figmaPreviewTimeout);
      figmaPreviewTimeout = setTimeout(triggerFigmaPreview, 1200);
    }
    urlEl.addEventListener('input', onInput);

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
      var designSel = document.getElementById('qaproof-saved-design');
      var url = '';
      if (designSel && designSel.value) {
        var ds = qaproof.savedDesigns || [];
        for (var i = 0; i < ds.length; i++) {
          if (ds[i].id === designSel.value) {
            url = ds[i].figmaUrl || '';
            break;
          }
        }
      }
      if (!url) return;

      var cacheKey = url;
      delete figmaPreviewCache[cacheKey];

      setPreviewState('loading');
      refreshFigmaBtn.classList.add('spinning');

      fetch(qaproof.restBase + '/figma-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce':   qaproof.nonce,
        },
        body: JSON.stringify({ figmaUrl: url, forceRefresh: true }),
      })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        refreshFigmaBtn.classList.remove('spinning');
        if (json.success && json.data) {
          figmaPreviewCache[cacheKey] = { data: json.data, ts: Date.now() };
          figmaRateLimitUntil = 0;
          showPreviewResult(json.data);

          var designId = savedDesignSelect ? savedDesignSelect.value : '';
          if (designId && json.data.imageBase64) {
            S.savedDesignImageBase64 = json.data.imageBase64;
            fetch(qaproof.restBase + '/save-design-image', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce':   qaproof.nonce,
              },
              body: JSON.stringify({ designId: designId, imageBase64: json.data.imageBase64 }),
            })
            .then(Q.safeJson)
            .then(function (saveJson) {
              if (saveJson.success) {
                var designs = qaproof.savedDesigns || [];
                for (var i = 0; i < designs.length; i++) {
                  if (designs[i].id === designId) {
                    designs[i].imageBase64 = json.data.imageBase64;
                    break;
                  }
                }
                if (previewMeta) previewMeta.textContent = qaproof.i18n.previewRefreshedSaved || 'Refreshed & saved \u00B7 No API call needed next time';
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
          maybeOpenFigmaShareGuide(code, url, function () {
            if (refreshFigmaBtn) refreshFigmaBtn.click();
          });
        }
      })
      .catch(function () {
        refreshFigmaBtn.classList.remove('spinning');
        setPreviewState('error', qaproof.i18n.previewCouldNotRefresh || 'Could not refresh preview.', true);
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
    // Small helper to ensure the button has a dedicated "working" class so
    // CSS can show a spinner / disabled state distinct from a normal hover.
    function setSaveBtnState(state, text) {
      if (saveDesignLabel) saveDesignLabel.textContent = text;
      saveDesignBtn.classList.remove('is-working', 'is-done', 'is-error');
      if (state === 'working') {
        saveDesignBtn.classList.add('is-working');
        saveDesignBtn.disabled = true;
      } else if (state === 'done') {
        saveDesignBtn.classList.add('is-done');
        saveDesignBtn.disabled = false;
      } else if (state === 'error') {
        saveDesignBtn.classList.add('is-error');
        saveDesignBtn.disabled = false;
      } else {
        saveDesignBtn.disabled = false;
      }
    }

    function flashSaveBtnDone(text) {
      setSaveBtnState('done', text);
      setTimeout(function () { setSaveBtnState('idle', qaproof.i18n.saveBtnSave || 'Save'); }, 2500);
    }

    function flashSaveBtnError(text) {
      setSaveBtnState('error', text);
      setTimeout(function () { setSaveBtnState('idle', qaproof.i18n.saveBtnSave || 'Save'); }, 2500);
    }

    // Broadcast saved-design status to other tabs (Settings page listens via
    // the `storage` event in init.js). Also updates the current tab in case
    // Tests + Settings are rendered on the same page in the future.
    //
    // We stamp the Figma `lastModified` token captured at cache time onto
    // the payload so the receiver can detect a stale entry: when the design
    // image gets refreshed against a newer Figma version, the elements cache
    // signalled here no longer corresponds to that image (B14/B15).
    function broadcastDesignStatus(designId, state, count, source) {
      if (!designId) return;
      try {
        var payload = { state: state, ts: Date.now() };
        if (typeof count === 'number') payload.count = count;
        if (source) payload.source = source;
        var ver = '';
        var allDesigns = qaproof.savedDesigns || [];
        for (var i = 0; i < allDesigns.length; i++) {
          if (allDesigns[i].id === designId) {
            ver = allDesigns[i].figmaLastModified || S.savedDesignFigmaLastModified || '';
            break;
          }
        }
        if (ver) payload.figmaLastModified = ver;
        // Always set a fresh value so the `storage` event fires even when the
        // state repeats (localStorage only dispatches when the value changes).
        localStorage.setItem('qaproof:design:' + designId, JSON.stringify(payload));
      } catch (err) { /* storage may be disabled; ignore */ }
      if (typeof window.QAProof.updateDesignStatus === 'function') {
        window.QAProof.updateDesignStatus(designId, state, count, source);
      }
    }

    saveDesignBtn.addEventListener('click', function () {
      if (!savedDesignSelect || !savedDesignSelect.value) return;
      var designId = savedDesignSelect.value;

      var imageData = previewImage ? previewImage.src : null;
      if (!imageData || !imageData.startsWith('data:image')) return;

      setSaveBtnState('working', qaproof.i18n.saveBtnSaving || 'Saving image...');
      broadcastDesignStatus(designId, 'saving');

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
            if (typeof window.QAProof.updateDetectBtnLabel === 'function') {
              window.QAProof.updateDetectBtnLabel();
            }
          }
          return saveJson;
        });
      }

      // Helper: run background detection and save results.
      // Returns a Promise that resolves when detection + saving is done (or failed).
      // While it's running, the Save button stays in 'working' state so the user
      // clearly sees that the operation is not finished yet.
      function bgDetectAndSave(bgDesignId) {
        var bgSd = null;
        var dsList = qaproof.savedDesigns || [];
        for (var di = 0; di < dsList.length; di++) {
          if (dsList[di].id === bgDesignId) { bgSd = dsList[di]; break; }
        }

        var bgRequestBody;
        if (bgSd && bgSd.figmaUrl) {
          bgRequestBody = { figmaUrl: bgSd.figmaUrl };
        } else if (imageData && imageData.startsWith('data:image')) {
          var bgParts = imageData.split(',');
          if (bgParts.length < 2 || !bgParts[1]) return Promise.resolve({ ok: false });
          bgRequestBody = { figmaImageBase64: bgParts[1] };
        } else {
          return Promise.resolve({ ok: false });
        }

        setSaveBtnState('working', qaproof.i18n.saveBtnDetecting || 'Detecting elements...');
        broadcastDesignStatus(bgDesignId, 'detecting');
        if (previewMeta) {
          previewMeta.textContent = qaproof.i18n.savedImageDetecting || 'Saved image \u00B7 Detecting elements...';
        }

        return fetch(qaproof.restBase + '/detect-elements', {
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
            var elCount = json.data.elements.length;

            detectedElementsSource = bgSource;
            S.elementsDetectedForCache = 'saved-elements|' + bgDesignId;
            renderElementOverlays(json.data.elements);
            if (elementControlsDiv) elementControlsDiv.style.display = '';

            return saveElementsToDesign(bgDesignId, json.data.elements, bgSource)
              .then(function () {
                if (previewMeta) {
                  previewMeta.textContent = qaproof.i18n.savedImageElements || 'Saved image + elements \u00B7 No API call needed';
                }
                broadcastDesignStatus(bgDesignId, 'ready', elCount, bgSource);
                return { ok: true, count: elCount };
              });
          }
          if (previewMeta) {
            previewMeta.textContent = qaproof.i18n.savedImageNoApi || 'Saved image \u00B7 No API call needed';
          }
          broadcastDesignStatus(bgDesignId, 'partial');
          return { ok: true, count: 0 };
        })
        .catch(function (err) {
          console.warn('[QAProof] Background element detection failed:', err && err.message);
          if (previewMeta) {
            previewMeta.textContent = qaproof.i18n.savedImageDetFailed || 'Saved image \u00B7 Element detection failed';
          }
          broadcastDesignStatus(bgDesignId, 'error');
          return { ok: false };
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
        var json = results[0];
        if (!json.success) {
          flashSaveBtnError(qaproof.i18n.saveBtnError || 'Error');
          broadcastDesignStatus(designId, 'error');
          return;
        }

        var designs = qaproof.savedDesigns || [];
        for (var i = 0; i < designs.length; i++) {
          if (designs[i].id === designId) {
            designs[i].imageBase64 = imageData;
            designs[i].hasImage = true;
            break;
          }
        }
        S.savedDesignImageBase64 = imageData;

        // Case A: elements already existed and were saved alongside the image.
        if (hasExistingElements && results[1] && results[1].success) {
          if (previewMeta) {
            previewMeta.textContent = qaproof.i18n.savedImageElements || 'Saved image + elements \u00B7 No API call needed';
          }
          flashSaveBtnDone(qaproof.i18n.saveBtnSavedElements || 'Saved + elements \u2713');
          broadcastDesignStatus(designId, 'ready', detectedElements.length, detectedElementsSource || 'ai-vision');
          return;
        }

        // Case B: no existing elements — run background detection and keep the
        // button in 'working' state until it finishes so the user waits.
        if (!hasExistingElements) {
          bgDetectAndSave(designId).then(function (bgResult) {
            if (bgResult && bgResult.ok && bgResult.count > 0) {
              flashSaveBtnDone((qaproof.i18n.saveBtnSaved || 'Saved \u2713').replace('\u2713', '') + ' + ' + bgResult.count + ' elements \u2713');
            } else if (bgResult && bgResult.ok) {
              // Image saved, detection found nothing — still a successful save.
              flashSaveBtnDone(qaproof.i18n.saveBtnSaved || 'Saved \u2713');
            } else {
              // Image was saved but detection failed — communicate partial success.
              flashSaveBtnError(qaproof.i18n.saveBtnDetectionFailed || 'Saved (detection failed)');
            }
          });
          return;
        }

        // Case C: existing elements, but element-save failed — partial success.
        if (previewMeta) {
          previewMeta.textContent = qaproof.i18n.savedImageNoApi || 'Saved image \u00B7 No API call needed';
        }
        flashSaveBtnDone(qaproof.i18n.saveBtnSaved || 'Saved \u2713');
        broadcastDesignStatus(designId, 'partial');
      })
      .catch(function () {
        flashSaveBtnError(qaproof.i18n.saveBtnError || 'Error');
        broadcastDesignStatus(designId, 'error');
      });
    });
  }

  // ============================
  // Element Detection & Selection
  // ============================
  var detectedElements = [];
  var detectedElementsSource = '';
  var activeDepthFilter = 'all';

  var detectBtn = document.getElementById('qaproof-detect-elements-btn');
  var fullPageBtn = document.getElementById('qaproof-fullpage-btn');

  // Swap the detect button label between "Detect Elements" and
  // "Show detected elements" depending on whether the currently-selected
  // saved design already has cached pixel-perfect elements.
  function updateDetectBtnLabel() {
    if (!detectBtn) return;
    var labelEl = detectBtn.querySelector('.qaproof-detect-btn-label');
    if (!labelEl) return;
    var selected = null;
    if (savedDesignSelect && savedDesignSelect.value) {
      var list = qaproof.savedDesigns || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === savedDesignSelect.value) { selected = list[i]; break; }
      }
    }
    if (selected && selected.hasElements) {
      labelEl.textContent = qaproof.i18n.detectBtnShowLabel || 'Show detected elements';
      detectBtn.setAttribute('title', qaproof.i18n.detectBtnShowTitle || 'Load cached elements detected in Settings — no API call needed');
    } else {
      labelEl.textContent = qaproof.i18n.detectBtnLabel || 'Detect Elements';
      detectBtn.removeAttribute('title');
    }
  }
  // Make it reachable from other handlers (e.g. after saveElementsToDesign).
  window.QAProof.updateDetectBtnLabel = updateDetectBtnLabel;
  updateDetectBtnLabel();
  var overlaysContainer = document.getElementById('qaproof-element-overlays');
  var detectingDiv = document.getElementById('qaproof-element-detecting');
  var selectedElementDiv = document.getElementById('qaproof-selected-element');
  var selectedElementLabel = document.getElementById('qaproof-selected-element-label');
  var clearSelectionBtn = document.getElementById('qaproof-clear-selection');
  var elementControlsDiv = document.getElementById('qaproof-element-controls');

  // Type color map for element list dots
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

  // Type icon emoji map
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
    S.selectedElement = null;
    S.elementsDetectedForCache = '';
    activeDepthFilter = 'all';
    if (selectedElementDiv) selectedElementDiv.classList.add('hidden');
    if (fullPageBtn) fullPageBtn.classList.add('active');
    var elList = document.getElementById('qaproof-element-list');
    if (elList) elList.innerHTML = '';
    var depthFilters = document.getElementById('qaproof-depth-filters');
    if (depthFilters) depthFilters.classList.add('hidden');
    var detectError = document.getElementById('qaproof-detect-error');
    if (detectError) detectError.classList.add('hidden');
    var countBadge = document.getElementById('qaproof-element-count');
    if (countBadge) { countBadge.textContent = ''; countBadge.classList.add('hidden'); }
    if (detectBtn) {
      detectBtn.classList.remove('is-showing');
      detectBtn.removeAttribute('disabled');
    }
    updateDetectBtnLabel();
  }

  function selectElement(element) {
    S.selectedElement = element;
    var overlays = overlaysContainer.querySelectorAll('.qaproof-element-overlay');
    for (var i = 0; i < overlays.length; i++) {
      overlays[i].classList.toggle('selected', overlays[i].dataset.elementId === element.id);
    }
    if (overlaysContainer) overlaysContainer.classList.add('has-selection');
    var listItems = document.querySelectorAll('.qaproof-element-list-item');
    for (var j = 0; j < listItems.length; j++) {
      listItems[j].classList.toggle('active', listItems[j].dataset.elementId === element.id);
    }
    if (selectedElementDiv) {
      selectedElementDiv.classList.remove('hidden');
      selectedElementLabel.textContent = (qaproof.i18n.testingElement || 'Testing: ') + element.label;
    }
    if (fullPageBtn) fullPageBtn.classList.remove('active');
    if (S.submitBtn) S.submitBtn.textContent = qaproof.i18n.btnAnalyzeElement || 'Analyze Element Fidelity';
  }

  function clearSelection() {
    S.selectedElement = null;
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
    if (S.submitBtn) S.submitBtn.textContent = qaproof.i18n.btnAnalyzeFidelity || 'Analyze Design Fidelity';
  }

  function applyDepthFilter(depth) {
    activeDepthFilter = depth;
    var depthBtns = document.querySelectorAll('.qaproof-depth-btn');
    for (var i = 0; i < depthBtns.length; i++) {
      depthBtns[i].classList.toggle('active', depthBtns[i].dataset.depth === depth);
    }
    var overlays = overlaysContainer ? overlaysContainer.querySelectorAll('.qaproof-element-overlay') : [];
    for (var j = 0; j < overlays.length; j++) {
      var elDepth = overlays[j].dataset.depth || '0';
      var show = (depth === 'all') || (elDepth === depth);
      overlays[j].style.display = show ? '' : 'none';
    }
    var listItems = document.querySelectorAll('.qaproof-element-list-item');
    for (var k = 0; k < listItems.length; k++) {
      var itemDepth = listItems[k].dataset.depth || '0';
      var showItem = (depth === 'all') || (itemDepth === depth);
      listItems[k].style.display = showItem ? '' : 'none';
    }
  }

  function sanitizeElementCoordinates(elements) {
    if (!elements || !Array.isArray(elements)) return [];

    var result = [];

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el || !el.region) continue;

      var r = el.region;
      var top = parseFloat(r.top);
      var left = parseFloat(r.left);
      var width = parseFloat(r.width);
      var height = parseFloat(r.height);

      if (isNaN(top) || isNaN(left) || isNaN(width) || isNaN(height)) continue;

      top = Math.max(0, Math.min(100, top));
      left = Math.max(0, Math.min(100, left));
      width = Math.max(0.5, Math.min(width, 100 - left));
      height = Math.max(0.5, Math.min(height, 100 - top));

      if (width < 0.5 || height < 0.5) continue;
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

        if (cr.left < pr.left) cr.left = pr.left;
        if (cr.top < pr.top) cr.top = pr.top;

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

    var maxDepth = 0;
    elements.forEach(function (el) {
      var d = el.depth || 0;
      if (d > maxDepth) maxDepth = d;
    });

    var validElements = sanitizeElementCoordinates(elements);

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

      if (el.region.top < 2.5) {
        overlay.classList.add('label-inside');
      }

      var label = document.createElement('span');
      label.className = 'qaproof-element-overlay-label';
      var icon = typeIconMap[el.type] || '\u25A0';
      label.innerHTML = '<span class="type-icon">' + icon + '</span>' + Q.escapeHtml(el.label);
      overlay.appendChild(label);

      overlay.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        selectElement(el);
      });

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

    var countBadge = document.getElementById('qaproof-element-count');
    if (countBadge) {
      countBadge.textContent = validElements.length;
      countBadge.classList.remove('hidden');
    }

    if (detectBtn) {
      detectBtn.classList.add('is-showing');
      var labelEl = detectBtn.querySelector('.qaproof-detect-btn-label');
      if (labelEl) labelEl.textContent = qaproof.i18n.detectBtnDetected || 'Elements detected:';
      detectBtn.setAttribute('disabled', 'disabled');
    }

    var depthFilters = document.getElementById('qaproof-depth-filters');
    if (depthFilters && maxDepth > 0) {
      depthFilters.classList.remove('hidden');
      depthFilters.innerHTML = '';
      var allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'qaproof-depth-btn active';
      allBtn.dataset.depth = 'all';
      allBtn.textContent = qaproof.i18n.depthAll || 'All';
      allBtn.addEventListener('click', function () { applyDepthFilter('all'); });
      depthFilters.appendChild(allBtn);

      var depthLabels = [qaproof.i18n.depthSections || 'Sections', qaproof.i18n.depthComponents || 'Components', qaproof.i18n.depthSubComponents || 'Sub-components'];
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

    renderElementList(validElements);
  }

  function renderElementList(elements) {
    var elList = document.getElementById('qaproof-element-list');
    if (!elList) return;
    elList.innerHTML = '';

    var sorted = elements.slice().sort(function (a, b) {
      var da = a.depth || 0, db = b.depth || 0;
      if (da !== db) return da - db;
      return (a.region.top || 0) - (b.region.top || 0);
    });

    var tree = buildElementTree(sorted);

    tree.forEach(function (el) {
      elList.appendChild(createListItem(el));
    });
  }

  function buildElementTree(elements) {
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
    var result = [];
    function addWithChildren(el) {
      result.push(el);
      var children = childMap[el.id] || [];
      children.sort(function (a, b) { return (a.region.top || 0) - (b.region.top || 0); });
      children.forEach(addWithChildren);
    }
    roots.sort(function (a, b) { return (a.region.top || 0) - (b.region.top || 0); });
    roots.forEach(addWithChildren);
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

    item.addEventListener('click', function () {
      selectElement(el);
    });
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

  function triggerDetectElements() {
    var requestBody;
    var cacheKey;
    var detectError = document.getElementById('qaproof-detect-error');

    if (detectError) detectError.classList.add('hidden');

    var designSel = document.getElementById('qaproof-saved-design');
    var sd = null;
    if (designSel && designSel.value) {
      var dsList = qaproof.savedDesigns || [];
      for (var di = 0; di < dsList.length; di++) {
        if (dsList[di].id === designSel.value) { sd = dsList[di]; break; }
      }
    }

    // Saved design with cached elements
    if (sd && sd.hasElements) {
      cacheKey = 'saved-elements|' + sd.id;
      if (S.elementsDetectedForCache === cacheKey && detectedElements.length > 0) {
        renderElementOverlays(detectedElements);
        return;
      }
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
          S.elementsDetectedForCache = cacheKey;
          detectedElementsSource = json.source || '';
          renderElementOverlays(json.elements);
        } else {
          sd.hasElements = false;
          triggerDetectElements();
        }
      })
      .catch(function () {
        if (detectingDiv) detectingDiv.classList.add('hidden');
        if (elementControlsDiv) elementControlsDiv.style.display = '';
        sd.hasElements = false;
        triggerDetectElements();
      });
      return;
    }

    // Build a content-addressable cache key.
    //
    // Previous implementation keyed by base64 byte length ('upload|123456' /
    // 'saved|123456'), which collided for two different ≈1.8 MB designs that
    // happen to encode to the same number of bytes — the in-memory element
    // state from design A would silently render on design B. Now we hash
    // a short content slice OR use a stable identifier when one is available.
    function shortContentKey(prefix, dataUri) {
      // Sample 256 bytes from three positions (head/mid/tail) — cheap
      // collision-resistant fingerprint without needing crypto.
      var len = dataUri.length;
      if (len < 800) return prefix + '|' + dataUri.slice(-256);
      return prefix + '|' + len + '|'
        + dataUri.slice(0, 256)
        + '|' + dataUri.slice(Math.floor(len / 2), Math.floor(len / 2) + 256)
        + '|' + dataUri.slice(-256);
    }

    // Saved design with Figma URL
    if (sd && sd.figmaUrl) {
      // Include figmaLastModified (when known) so a Figma edit invalidates
      // the in-memory cache without waiting for page reload.
      cacheKey = 'figmaUrl|' + sd.figmaUrl + '|' + (sd.figmaLastModified || '');
      requestBody = { figmaUrl: sd.figmaUrl };
    } else if (S.uploadedFileBase64) {
      var base64Parts = S.uploadedFileBase64.split(',');
      if (base64Parts.length < 2 || !base64Parts[1]) return;
      cacheKey = shortContentKey('upload', S.uploadedFileBase64);
      requestBody = { figmaImageBase64: base64Parts[1] };
    } else if (S.savedDesignImageBase64) {
      var savedParts = S.savedDesignImageBase64.split(',');
      if (savedParts.length < 2 || !savedParts[1]) return;
      // Prefer the design id + lastModified — they're cheap, exact, and let
      // the cache survive base64 round-trips without false-hits.
      var savedDesignId = sd && sd.id ? sd.id : '';
      var savedLastMod  = sd && sd.figmaLastModified ? sd.figmaLastModified
                          : S.savedDesignFigmaLastModified || '';
      cacheKey = savedDesignId
        ? 'savedImg|' + savedDesignId + '|' + savedLastMod
        : shortContentKey('savedImg', S.savedDesignImageBase64);
      requestBody = { figmaImageBase64: savedParts[1] };
    } else {
      return;
    }

    if (S.elementsDetectedForCache === cacheKey && detectedElements.length > 0) {
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
        S.elementsDetectedForCache = cacheKey;
        var detectionSource = json.data.source || '';
        detectedElementsSource = detectionSource;
        if (detectionSource) {
        }
        if (requestBody.figmaUrl && detectionSource === 'ai-vision') {
          console.warn('[QAProof] Figma API detection failed, fell back to AI vision. Possibly rate-limited.');
          if (detectError) {
            detectError.textContent = qaproof.i18n.detectFigmaRateLimit || 'Figma API rate-limited \u2014 showing approximate detection.';
            detectError.classList.remove('hidden');
          }
        }
        renderElementOverlays(json.data.elements);

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
          .then(Q.safeJson)
          .then(function (saveJson) {
            if (saveJson.success) {
              var designs = qaproof.savedDesigns || [];
              for (var i = 0; i < designs.length; i++) {
                if (designs[i].id === autoSaveDesignId) {
                  designs[i].hasElements = true;
                  designs[i].elementsSource = detectionSource;
                  break;
                }
              }
              if (typeof window.QAProof.updateDetectBtnLabel === 'function') {
                window.QAProof.updateDetectBtnLabel();
              }
            }
          })
          .catch(function () { /* silent */ });
        }
      } else {
        var msg = (json.error && json.error.message) ? json.error.message : (qaproof.i18n.detectNoElements || 'No elements detected. Try a different design image.');
        if (detectError) {
          detectError.textContent = msg;
          detectError.classList.remove('hidden');
        }
      }
    })
    .catch(function () {
      if (detectingDiv) detectingDiv.classList.add('hidden');
      if (elementControlsDiv) elementControlsDiv.style.display = '';
      if (detectError) {
        detectError.textContent = qaproof.i18n.detectFailed || 'Detection failed. Check your connection and try again.';
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

  // No backdrop element — the expanded panel covers nearly the entire viewport
  // on its own. A backdrop caused stacking-context conflicts with ancestor
  // elements that made the panel appear blurred/dimmed. Keep a no-op stub so
  // existing references don't break.
  var inspectorBackdrop = { classList: { toggle: function () {} }, addEventListener: function () {} };

  if (expandBtn && previewPanel) {
    expandBtn.addEventListener('click', function () {
      var isExpanded = previewPanel.classList.toggle('inspector-expanded');
      document.body.classList.toggle('qaproof-inspector-open', isExpanded);
      inspectorBackdrop.classList.toggle('active', isExpanded);
      var labelIcon = expandBtn.querySelector('.dashicons');
      if (labelIcon) {
        labelIcon.className = isExpanded
          ? 'dashicons dashicons-editor-contract'
          : 'dashicons dashicons-editor-expand';
      }
      expandBtn.querySelector('span:last-child') ||
        (expandBtn.childNodes.length > 1 && expandBtn.childNodes[1]);
      var textNode = expandBtn.lastChild;
      if (textNode && textNode.nodeType === 3) {
        textNode.textContent = isExpanded ? (qaproof.i18n.btnCollapse || ' Collapse') : (qaproof.i18n.btnExpand || ' Expand');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && previewPanel.classList.contains('inspector-expanded')) {
        expandBtn.click();
      }
    });

    inspectorBackdrop.addEventListener('click', function () {
      if (previewPanel.classList.contains('inspector-expanded')) {
        expandBtn.click();
      }
    });

    document.addEventListener('mousedown', function (e) {
      if (!previewPanel.classList.contains('inspector-expanded')) return;
      if (previewPanel.contains(e.target)) return;
      expandBtn.click();
    });
  }

  // ============================
  // File Upload
  // ============================
  if (S.figmaFileInput) {
    S.figmaFileInput.addEventListener('change', function (e) {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });
  }

  if (S.uploadClearBtn) {
    S.uploadClearBtn.addEventListener('click', function () {
      S.uploadedFileBase64 = null;
      if (S.figmaFileInput) S.figmaFileInput.value = '';
      if (S.uploadPreview) S.uploadPreview.classList.add('hidden');
      if (typeof clearElementOverlays === 'function') clearElementOverlays();
      setPreviewState('empty');
    });
  }

  function handleFile(file) {
    var MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (!file.type.startsWith('image/')) {
      Q.showError(qaproof.i18n.errUploadType || 'Please upload an image file (PNG, JPEG, WebP).');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      Q.showError('File too large (' + (file.size / 1024 / 1024).toFixed(1) + 'MB). Maximum size: 5MB.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      S.uploadedFileBase64 = e.target.result;
      if (S.uploadPreviewImg) S.uploadPreviewImg.src = S.uploadedFileBase64;
      if (S.uploadPreview) S.uploadPreview.classList.remove('hidden');

      showUploadedImagePreview(S.uploadedFileBase64, file.name, file.size);
    };
    reader.readAsDataURL(file);
  }

  function showUploadedImagePreview(base64DataUrl, fileName, fileSize) {
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
  if (S.form) S.form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (S.testsPageBusy) {
      Q.showError(qaproof.i18n.errTestRunning || 'A test is already running. Please wait for it to finish.');
      return;
    }

    if (!qaproof.hasApiKey) {
      Q.showErrorHtml('API key not configured. <a href="' + Q.escapeAttr(qaproof.settingsUrl) + '">Go to Settings</a> to add your key.');
      return;
    }

    S.testsPageBusy = true;

    // Reset UI
    S.resultsContainer.classList.add('hidden');
    S.resultsContainer.innerHTML = '';
    S.errorDiv.classList.add('hidden');
    S.loading.classList.remove('hidden');
    S.submitBtn.disabled = true;

    // Loading text
    if (S.testType === 'responsive') {
      S.loadingText.textContent = qaproof.i18n.loadingResponsive || 'Capturing 3 viewport sizes and analyzing responsive behavior...';
      S.loadingSubtext.textContent = qaproof.i18n.loadingResponsiveSub || 'This may take 1-2 minutes (3 screenshots + AI analysis)';
    } else if (S.testType === 'accessibility') {
      S.loadingText.textContent = qaproof.i18n.loadingAccessibility || 'Capturing page and running accessibility audit...';
      var wcagLvl = (document.getElementById('qaproof-a11y-wcag-level') || {}).value || (typeof qaproof !== 'undefined' && qaproof.wcagLevel) || 'AA';
      S.loadingSubtext.textContent = 'Analyzing WCAG 2.1 Level ' + wcagLvl + ' compliance (30-60 seconds)';
    } else if (S.testType === 'design-audit') {
      S.loadingText.textContent = qaproof.i18n.loadingDesignAudit || 'Scanning page and extracting design tokens...';
      S.loadingSubtext.textContent = qaproof.i18n.loadingDesignAuditSub || 'Analyzing design system consistency (1-2 minutes)';
    } else if (S.selectedElement) {
      S.loadingText.textContent = (qaproof.i18n.loadingElement || 'Analyzing element: ') + S.selectedElement.label + '...';
      S.loadingSubtext.textContent = qaproof.i18n.loadingElementSub || 'Cropping design region, finding match on live page, comparing (30-60 seconds)';
    } else {
      S.loadingText.textContent = qaproof.i18n.loadingDefault || 'Capturing screenshots and analyzing design...';
      S.loadingSubtext.textContent = qaproof.i18n.loadingDefaultSub || 'This may take 15-30 seconds';
    }

    var pageUrl = document.getElementById('qaproof-page-url').value.trim();

    // Validate
    if (S.testType === 'fidelity') {
      if (!S.savedDesignImageBase64 && !S.uploadedFileBase64) {
        var designSel2 = document.getElementById('qaproof-saved-design');
        var hasFigmaUrl = false;
        if (designSel2 && designSel2.value) {
          var ds = qaproof.savedDesigns || [];
          for (var vi = 0; vi < ds.length; vi++) {
            if (ds[vi].id === designSel2.value && ds[vi].figmaUrl) { hasFigmaUrl = true; break; }
          }
        }
        if (!hasFigmaUrl) {
          Q.showError(qaproof.i18n.errNoDesign || 'Please upload a design image or select a saved design.');
          S.loading.classList.add('hidden');
          S.submitBtn.disabled = false;
          S.testsPageBusy = false;
          return;
        }
      }
    }

    // Build body
    var body = { pageUrl: pageUrl, testType: S.testType };

    if (S.testType === 'accessibility') {
      body.wcagLevel = (document.getElementById('qaproof-a11y-wcag-level') || {}).value || (typeof qaproof !== 'undefined' && qaproof.wcagLevel) || 'AA';
    }

    if (S.testType === 'fidelity') {
      if (typeof qaproof !== 'undefined') {
        body.ignoreText = qaproof.fidelityIgnoreText !== false;
      }
      var designSelect = document.getElementById('qaproof-saved-design');
      var selectedDesign = null;
      if (designSelect && designSelect.value) {
        var allDesigns = qaproof.savedDesigns || [];
        for (var di = 0; di < allDesigns.length; di++) {
          if (allDesigns[di].id === designSelect.value) { selectedDesign = allDesigns[di]; break; }
        }
      }
      if (S.savedDesignImageBase64) {
        var savedParts2 = S.savedDesignImageBase64.split(',');
        if (savedParts2.length >= 2 && savedParts2[1]) {
          body.figmaImageBase64 = savedParts2[1];
        }
        // Send the design's Figma URL alongside the cached bytes so the
        // backend has somewhere to re-fetch from on staleness, and the
        // version token captured at cache time so the backend can decide.
        if (selectedDesign && selectedDesign.figmaUrl) {
          body.figmaUrl = selectedDesign.figmaUrl;
        }
        var cachedToken = S.savedDesignFigmaLastModified
          || (selectedDesign && selectedDesign.figmaLastModified)
          || '';
        if (cachedToken) {
          body.cachedLastModified = cachedToken;
        }
      } else if (S.uploadedFileBase64) {
        var parts2 = S.uploadedFileBase64.split(',');
        if (parts2.length < 2 || !parts2[1]) {
          Q.showError(qaproof.i18n.errInvalidImage || 'Invalid image data. Please re-upload the design file.');
          S.loading.classList.add('hidden');
          S.submitBtn.disabled = false;
          return;
        }
        body.figmaImageBase64 = parts2[1];
      } else if (selectedDesign && selectedDesign.figmaUrl) {
        body.figmaUrl = selectedDesign.figmaUrl;
      }

      if (S.selectedElement && S.selectedElement.region) {
        body.elementRegion = S.selectedElement.region;
      }

      // Optional viewport selector — empty value means "auto from Figma frame".
      var vpSelect = document.getElementById('qaproof-viewport-preset');
      if (vpSelect && vpSelect.value) {
        body.viewportPreset = vpSelect.value;
      }
    }

    // Step-based loading status
    var checkSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var loadingSteps = S.testType === 'design-audit' ? [
      { time: 0, text: qaproof.i18n.stepCaptureScreenshot || 'Capturing page screenshot' },
      { time: 8000, text: qaproof.i18n.stepExtractTokens || 'Extracting design tokens from DOM' },
      { time: 18000, text: qaproof.i18n.stepAnalyzeDesign || 'Analyzing color palette & typography' },
      { time: 35000, text: qaproof.i18n.stepAuditConsistency || 'AI auditing design consistency' },
      { time: 70000, text: qaproof.i18n.stepBuildDebtReport || 'Building design debt report' },
    ] : [
      { time: 0, text: qaproof.i18n.stepCaptureScreenshot || 'Capturing page screenshot' },
      { time: 8000, text: qaproof.i18n.stepProcessImages || 'Processing images' },
      { time: 20000, text: qaproof.i18n.stepRunAnalysis || 'Running AI analysis' },
      { time: 50000, text: qaproof.i18n.stepGenerateReport || 'Generating report' },
      { time: 90000, text: qaproof.i18n.stepFinalizeResults || 'Finalizing results' },
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
        S.loadingText.textContent = step.text + '...';
        S.loadingSubtext.textContent = idx < loadingSteps.length - 1 ? (qaproof.i18n.loadingDuration || 'This may take 1-3 minutes') : (qaproof.i18n.loadingAlmostDone || 'Almost done');
      }, step.time);
    });

    var _pendingRetries = window.QAProof.__pendingRetries || 0;
    window.QAProof.__pendingRetries = 0;
    Q.saveActiveJob(null, body.testType, body.pageUrl, 'tests', 'submitting', _pendingRetries, body.wcagLevel);

    // Submit test via WP proxy
    fetch(qaproof.restUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': qaproof.nonce,
      },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    })
      .then(Q.safeJson)
      .then(function (data) {
        if (!data.success || !data.data || !data.data.jobId) {
          // Concurrency cap — server returns 429 with code:'CONCURRENCY_LIMIT'.
          // Surface a clear, actionable message instead of the generic
          // "Failed to create test job" so the user knows it's a "wait and
          // retry" situation, not a hard failure they need to debug.
          var errCode = data.error && data.error.code;
          if (errCode === 'CONCURRENCY_LIMIT') {
            var active = (data.error && data.error.activeJobs) || 0;
            var limit  = (data.error && data.error.limit) || 2;
            throw new Error(
              'You already have ' + active + ' test' + (active === 1 ? '' : 's') +
              ' running (limit ' + limit + ' per workspace). Wait for one to finish ' +
              'before starting another.'
            );
          }
          throw new Error((data.error && data.error.message) || 'Failed to create test job.');
        }

        var jobId = data.data.jobId;
        Q.saveActiveJob(jobId, body.testType, body.pageUrl, 'tests', 'polling', 0, body.wcagLevel);

        Q.startJobPolling(jobId, {
          page: 'tests',
          onPoll: function (status, elapsed) {
          },
          onDone: function (resultData) {
            loadingTimers.forEach(clearTimeout);

            // Inject pageUrl and wcagLevel so PDF always has correct metadata
            resultData.pageUrl = resultData.pageUrl || body.pageUrl || '';
            if (resultData.testType === 'accessibility' && body.wcagLevel) {
              resultData.targetWcagLevel = body.wcagLevel;
            }

            // Staleness handshake — if the backend detected that our cached
            // saved-design image was outdated against Figma and re-fetched
            // mid-test, push the fresh bytes + version back into WP so the
            // next run starts current. The screenshot returned from the
            // backend IS the fresh design (compressed for display); we save
            // a fresh fetch via the design-image endpoint so the full-quality
            // bytes are stored, not the JPEG-compressed display version.
            if (resultData && resultData.testType === 'fidelity'
                && resultData.cacheWasStale && designSelect && designSelect.value
                && resultData.figmaLastModified) {
              var designId = designSelect.value;
              // Refresh the cached image AND its version token through the
              // dedicated save endpoint. Fire-and-forget — failure to write
              // back doesn't invalidate the test we just ran.
              fetch(qaproof.restBase + '/figma-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce },
                credentials: 'same-origin',
                body: JSON.stringify({ figmaUrl: body.figmaUrl, forceRefresh: true }),
              })
                .then(function (r) { return r.json(); })
                .then(function (preview) {
                  if (!preview.success || !preview.data || !preview.data.imageBase64) return;
                  return fetch(qaproof.restBase + '/save-design-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': qaproof.nonce },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                      designId:     designId,
                      imageBase64:  preview.data.imageBase64,
                      lastModified: preview.data.lastModified || resultData.figmaLastModified,
                    }),
                  });
                })
                .catch(function () { /* best-effort */ });
              // Update in-memory state immediately so the user can re-run
              // without round-tripping the WP REST.
              S.savedDesignFigmaLastModified = resultData.figmaLastModified;
              // Force the result UI to surface the staleness signal.
              resultData._cacheRefreshedNotice = true;
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
            S.submitBtn.disabled = false;
            S.testsPageBusy = false;
          },
          onScreenshotsDone: function (resultData) {
            Q.saveTestHistory(body.testType, body.pageUrl, jobId, resultData)
              .then(function (saveResp) {
                if (Q.testsHistoryMgr) Q.testsHistoryMgr.load(true);
              })
              .catch(function (err) {
                console.error('[QAProof] Failed to save history:', err.message);
                if (Q.testsHistoryMgr) Q.testsHistoryMgr.load(true);
              });
          },
          onFailed: function (errorMsg) {
            loadingTimers.forEach(clearTimeout);
            Q.showError(errorMsg);
            S.loading.classList.add('hidden');
            S.submitBtn.disabled = false;
            S.testsPageBusy = false;
            // The job-queue stores failures as a plain message string, not a
            // structured code. We sniff the well-known FIGMA_NOT_SHARED
            // marker ("figma@qaproof.io") to surface the share guide so the
            // user can recover without leaving the page.
            if (errorMsg && typeof errorMsg === 'string' &&
                errorMsg.indexOf('figma@qaproof.io') !== -1 &&
                body.figmaUrl) {
              maybeOpenFigmaShareGuide('FIGMA_NOT_SHARED', body.figmaUrl, null);
            }
          },
        });
      })
      .catch(function (err) {
        loadingTimers.forEach(clearTimeout);
        if (err.message === 'Failed to fetch') {
          Q.showError(qaproof.i18n.errNoConnection || 'Could not reach the server. Check your connection. Reload the page to retry.');
        } else if (err.message && err.message.indexOf('Rate limit') !== -1) {
          Q.clearActiveJob('tests');
          Q.showError(err.message);
        } else {
          Q.showError(err.message + ' Reload the page to retry.');
        }
        S.loading.classList.add('hidden');
        S.submitBtn.disabled = false;
        S.testsPageBusy = false;
      });
  });

  // ============================
  // Email Report — Inline Confirmation
  // ============================
  function toggleEmailConfirmation(emailBtn) {
    if (emailBtn.classList.contains('qaproof-email-expanded')) {
      collapseEmailBtn(emailBtn);
      return;
    }

    var userEmail = (qaproof && qaproof.adminEmail) ? qaproof.adminEmail : 'your account email';

    emailBtn._originalHtml = emailBtn.innerHTML;
    emailBtn.classList.add('qaproof-email-expanded');

    emailBtn.innerHTML = '' +
      '<span class="qaproof-email-confirm-text">' + (qaproof.i18n.emailSendTo || 'Send to ') + '<strong>' + Q.escapeHtml(userEmail) + '</strong>?</span>' +
      '<span class="qaproof-email-confirm-actions">' +
      '  <button type="button" class="qaproof-email-confirm-cancel">' + (qaproof.i18n.emailCancel || 'Cancel') + '</button>' +
      '  <button type="button" class="qaproof-email-confirm-send"><span class="dashicons dashicons-yes"></span>' + (qaproof.i18n.emailConfirm || ' Confirm') + '</button>' +
      '</span>';

    emailBtn.querySelector('.qaproof-email-confirm-cancel').addEventListener('click', function(ev) {
      ev.stopPropagation();
      collapseEmailBtn(emailBtn);
    });

    emailBtn.querySelector('.qaproof-email-confirm-send').addEventListener('click', function(ev) {
      ev.stopPropagation();
      var sendBtn = this;
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="dashicons dashicons-update qaproof-spin"></span>' + (qaproof.i18n.emailSending || ' Sending...');

      // Generate PDF and send to WP REST endpoint
      var lastResult = window.QAProof && window.QAProof.state && window.QAProof.state.lastResult;
      var pdfBase64 = null;

      if (!lastResult) {
        console.warn('[QAProof] Email: lastResult is null — no active test result in state');
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span class="dashicons dashicons-warning"></span> ' + (qaproof.i18n.emailErrNoResult || 'Run a test first.');
        setTimeout(function() { collapseEmailBtn(emailBtn); }, 2500);
        return;
      }

      try {
        if (window.QAProof && typeof window.QAProof.generatePdfBase64 === 'function') {
          // Strip screenshots before email generation to keep payload small
          // (screenshots are base64 images that can be 5-15 MB each)
          var emailData = Object.assign({}, lastResult);
          if (emailData.screenshots) emailData.screenshots = {};
          pdfBase64 = window.QAProof.generatePdfBase64(emailData);
        } else {
          console.warn('[QAProof] generatePdfBase64 not found on window.QAProof:', window.QAProof);
        }
      } catch(e) {
        console.error('[QAProof] PDF generation error:', e);
      }

      if (!pdfBase64) {
        console.warn('[QAProof] Email: PDF generation returned null — jsPDF may not be loaded');
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span class="dashicons dashicons-warning"></span> ' + (qaproof.i18n.emailErrPdf || 'PDF generation failed. Refresh the page.');
        setTimeout(function() { collapseEmailBtn(emailBtn); }, 2500);
        return;
      }

      fetch(qaproof.restBase + '/send-report-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': qaproof.nonce,
        },
        body: JSON.stringify({
          pdfBase64: pdfBase64,
          fileName: 'qaproof-report-' + Date.now() + '.pdf',
          testType: (lastResult && lastResult.testType) || '',
          pageUrl: (lastResult && lastResult.pageUrl) || '',
          score: (lastResult && lastResult.score) || 0,
        }),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          sendBtn.innerHTML = '<span class="dashicons dashicons-yes"></span>' + (qaproof.i18n.emailSent || ' Sent!');
          sendBtn.classList.add('qaproof-email-sent');
          setTimeout(function() { collapseEmailBtn(emailBtn); }, 1200);
        } else {
          sendBtn.disabled = false;
          // data.error is API-supplied — escape before injecting into innerHTML.
          sendBtn.innerHTML = '<span class="dashicons dashicons-warning"></span> ' + Q.escapeHtml(data.error || 'Failed');
          setTimeout(function() {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<span class="dashicons dashicons-yes"></span>' + (qaproof.i18n.emailConfirm || ' Confirm');
          }, 2500);
        }
      })
      .catch(function() {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span class="dashicons dashicons-warning"></span> Error';
        setTimeout(function() {
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<span class="dashicons dashicons-yes"></span>' + (qaproof.i18n.emailConfirm || ' Confirm');
        }, 2500);
      });
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
    if (e.target.closest('.qaproof-email-confirm-actions') || e.target.closest('.qaproof-email-confirm-text')) return;
    var btn = e.target.closest('#qaproof-email-btn');
    if (btn) {
      e.preventDefault();
      toggleEmailConfirmation(btn);
    }
  });

  // ============================
  // Expose on namespace
  // ============================
  Q.updateFigmaPreviewVisibility = updateFigmaPreviewVisibility;
  Q.updateSavedDesignVisibility = updateSavedDesignVisibility;
  Q.clearElementOverlays = clearElementOverlays;
})();
