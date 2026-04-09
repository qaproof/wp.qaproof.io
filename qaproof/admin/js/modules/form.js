/* global qaproof, qaproofAdmin */
(function () {
  'use strict';
  var Q = window.QAProof;
  var S = Q.state;

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
      updateFigmaPreviewVisibility();
      updateSavedDesignVisibility();
      // Show/hide figma upload for non-fidelity test types
      var figmaUpload = document.getElementById('qaproof-figma-upload');
      if (figmaUpload) {
        figmaUpload.classList.toggle('hidden', S.testType !== 'fidelity');
      }

      if (S.submitBtn) {
        var btnLabels = {
          fidelity: 'Analyze Design Fidelity',
          responsive: 'Test Responsive',
          accessibility: 'Run Accessibility Audit',
          'design-audit': 'Run Design Audit',
        };
        S.submitBtn.textContent = btnLabels[S.testType] || 'Run Test';
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
      if (S.submitBtn) {
        var initLabels = { fidelity: 'Analyze Design Fidelity', responsive: 'Test Responsive', accessibility: 'Run Accessibility Audit' };
        S.submitBtn.textContent = initLabels[S.testType] || 'Run Test';
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

      // Auto-fill form fields
      var figmaTokenEl = document.getElementById('qaproof-figma-token');
      var figmaUrlEl   = document.getElementById('qaproof-figma-url');

      if (figmaTokenEl && found.figmaToken) figmaTokenEl.value = found.figmaToken;
      if (figmaUrlEl && found.figmaUrl)  figmaUrlEl.value = found.figmaUrl;

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
            showPreviewResult({
              imageBase64: json.imageBase64,
              fileKey: 'Saved',
              nodeId: found.name || found.id,
              sizeKB: Math.round(json.imageBase64.length * 0.75 / 1024),
            });
            if (previewMeta) {
              previewMeta.textContent = 'Saved image \u00B7 No Figma API call';
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
    S.sourceToggle.addEventListener('click', function (e) {
      var btn = e.target.closest('.qaproof-source-btn');
      if (!btn) return;

      S.sourceToggle.querySelectorAll('.qaproof-source-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');

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
          if (previewMeta) previewMeta.textContent = 'Uploaded image';
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
        emptyText.textContent = 'Select a saved design or upload an image to preview.';
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
      previewErrorMsg.textContent = errorText || 'Could not load preview.';
      var existingRetry = previewError.querySelector('.qaproof-preview-retry');
      if (existingRetry) existingRetry.remove();
      if (showRetry) {
        var retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'qaproof-preview-retry';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', function () {
          triggerFigmaPreview(true);
        });
        previewError.appendChild(retryBtn);
      }
    }
  }

  function mapFigmaErrorMessage(code, fallback) {
    var map = {
      'FIGMA_AUTH_FAILED':          'Invalid or expired Figma token.',
      'FIGMA_FILE_NOT_FOUND':       'File not found. Check the URL.',
      'FIGMA_RATE_LIMITED':         'Figma rate limit exceeded. This is often caused by Starter plan restrictions (very low API limits). Ensure your Figma file is in a Professional or higher workspace, or use "Upload Image" instead. Wait 1-2 minutes, then try again.',
      'FIGMA_RENDER_TIMEOUT':       'Design too complex to preview.',
      'FIGMA_EXPORT_FAILED':        'Figma could not export this design.',
      'FIGMA_NODE_NOT_RENDERABLE':  'This node cannot be rendered. Try a different frame.',
      'FIGMA_NO_FRAMES_FOUND':      'No frames found. Add a node-id to the URL.',
    };
    return map[code] || fallback || 'Could not load preview.';
  }

  function isRetryableError(code) {
    return code === 'FIGMA_RATE_LIMITED' || code === 'FIGMA_RENDER_TIMEOUT';
  }

  function triggerFigmaPreview(manual) {
    var token = '';
    var url   = '';
    var designSelect = document.getElementById('qaproof-saved-design');
    if (designSelect && designSelect.value) {
      var designs = qaproof.savedDesigns || [];
      for (var i = 0; i < designs.length; i++) {
        if (designs[i].id === designSelect.value) {
          token = designs[i].figmaToken || '';
          url   = designs[i].figmaUrl || '';
          break;
        }
      }
    }

    if (!token || !url) {
      setPreviewState('empty');
      return;
    }

    if (!/figma\.com\/(design|file|proto|board)\//.test(url)) {
      return;
    }

    if (!manual && Date.now() < figmaRateLimitUntil) {
      return;
    }

    var cacheKey = url + '|' + token;
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
      body: JSON.stringify({ figmaUrl: url, figmaToken: token }),
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
      }
    })
    .catch(function () {
      setPreviewState('error', 'Could not load preview.', true);
    });
  }

  function showPreviewResult(data) {
    if (typeof clearElementOverlays === 'function') clearElementOverlays();
    if (previewImage) previewImage.src = data.imageBase64 || '';
    if (previewMeta) {
      var parts = [];
      if (data.fileKey) parts.push('File: ' + data.fileKey);
      if (data.nodeId)  parts.push('Node: ' + data.nodeId);
      if (data.sizeKB)  parts.push(data.sizeKB + ' KB');
      previewMeta.textContent = parts.join(' · ');
    }
    setPreviewState('success');
  }

  // Debounced input listeners (800ms)
  function attachPreviewListeners() {
    var tokenEl = document.getElementById('qaproof-figma-token');
    var urlEl   = document.getElementById('qaproof-figma-url');
    if (!tokenEl || !urlEl) return;

    function onInput() {
      clearTimeout(figmaPreviewTimeout);
      figmaPreviewTimeout = setTimeout(triggerFigmaPreview, 1200);
    }
    tokenEl.addEventListener('input', onInput);
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
      var token = '', url = '';
      if (designSel && designSel.value) {
        var ds = qaproof.savedDesigns || [];
        for (var i = 0; i < ds.length; i++) {
          if (ds[i].id === designSel.value) {
            token = ds[i].figmaToken || '';
            url = ds[i].figmaUrl || '';
            break;
          }
        }
      }
      if (!token || !url) return;

      var cacheKey = url + '|' + token;
      delete figmaPreviewCache[cacheKey];

      setPreviewState('loading');
      refreshFigmaBtn.classList.add('spinning');

      fetch(qaproof.restBase + '/figma-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce':   qaproof.nonce,
        },
        body: JSON.stringify({ figmaUrl: url, figmaToken: token, forceRefresh: true }),
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
                if (previewMeta) previewMeta.textContent = 'Refreshed & saved \u00B7 No API call needed next time';
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
        }
      })
      .catch(function () {
        refreshFigmaBtn.classList.remove('spinning');
        setPreviewState('error', 'Could not refresh preview.', true);
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
    saveDesignBtn.addEventListener('click', function () {
      if (!savedDesignSelect || !savedDesignSelect.value) return;
      var designId = savedDesignSelect.value;

      var imageData = previewImage ? previewImage.src : null;
      if (!imageData || !imageData.startsWith('data:image')) return;

      if (saveDesignLabel) saveDesignLabel.textContent = 'Saving...';
      saveDesignBtn.disabled = true;

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
          }
          return saveJson;
        });
      }

      // Helper: run background detection and save results
      function bgDetectAndSave(bgDesignId) {
        var bgSd = null;
        var dsList = qaproof.savedDesigns || [];
        for (var di = 0; di < dsList.length; di++) {
          if (dsList[di].id === bgDesignId) { bgSd = dsList[di]; break; }
        }

        var bgRequestBody;
        if (bgSd && bgSd.figmaUrl && bgSd.figmaToken) {
          bgRequestBody = { figmaUrl: bgSd.figmaUrl, figmaToken: bgSd.figmaToken };
        } else if (imageData && imageData.startsWith('data:image')) {
          var bgParts = imageData.split(',');
          if (bgParts.length < 2 || !bgParts[1]) return;
          bgRequestBody = { figmaImageBase64: bgParts[1] };
        } else {
          return;
        }

        if (previewMeta) {
          previewMeta.textContent = 'Saved image \u00B7 Detecting elements...';
        }

        fetch(qaproof.restBase + '/detect-elements', {
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
            console.log('[QAProof] Background detection done:', bgSource, '(' + json.data.elements.length + ' elements)');

            detectedElementsSource = bgSource;
            S.elementsDetectedForCache = 'saved-elements|' + bgDesignId;
            renderElementOverlays(json.data.elements);
            if (elementControlsDiv) elementControlsDiv.style.display = '';

            saveElementsToDesign(bgDesignId, json.data.elements, bgSource)
            .then(function () {
              if (previewMeta) {
                previewMeta.textContent = 'Saved image + elements \u00B7 No API call needed';
              }
            });
          } else {
            console.log('[QAProof] Background detection returned no elements');
            if (previewMeta) {
              previewMeta.textContent = 'Saved image \u00B7 No API call needed';
            }
          }
        })
        .catch(function () {
          console.warn('[QAProof] Background element detection failed');
          if (previewMeta) {
            previewMeta.textContent = 'Saved image \u00B7 No API call needed';
          }
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
        saveDesignBtn.disabled = false;
        if (json.success) {
          if (saveDesignLabel) saveDesignLabel.textContent = 'Saved!';
          var designs = qaproof.savedDesigns || [];
          for (var i = 0; i < designs.length; i++) {
            if (designs[i].id === designId) {
              designs[i].imageBase64 = imageData;
              break;
            }
          }
          S.savedDesignImageBase64 = imageData;

          if (hasExistingElements && results[1] && results[1].success) {
            if (previewMeta) {
              previewMeta.textContent = 'Saved image + elements \u00B7 No API call needed';
            }
          } else if (!hasExistingElements) {
            bgDetectAndSave(designId);
          } else {
            if (previewMeta) {
              previewMeta.textContent = 'Saved image \u00B7 No API call needed';
            }
          }

          setTimeout(function () {
            if (saveDesignLabel) saveDesignLabel.textContent = 'Save';
          }, 2000);
        } else {
          if (saveDesignLabel) saveDesignLabel.textContent = 'Error';
          setTimeout(function () {
            if (saveDesignLabel) saveDesignLabel.textContent = 'Save';
          }, 2000);
        }
      })
      .catch(function () {
        saveDesignBtn.disabled = false;
        if (saveDesignLabel) saveDesignLabel.textContent = 'Error';
        setTimeout(function () {
          if (saveDesignLabel) saveDesignLabel.textContent = 'Save';
        }, 2000);
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
      selectedElementLabel.textContent = 'Testing: ' + element.label;
    }
    if (fullPageBtn) fullPageBtn.classList.remove('active');
    if (S.submitBtn) S.submitBtn.textContent = 'Analyze Element Fidelity';
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
    if (S.submitBtn) S.submitBtn.textContent = 'Analyze Design Fidelity';
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
    console.log('[QAProof] Detected elements after validation:', validElements.length, validElements);

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

    var depthFilters = document.getElementById('qaproof-depth-filters');
    if (depthFilters && maxDepth > 0) {
      depthFilters.classList.remove('hidden');
      depthFilters.innerHTML = '';
      var allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'qaproof-depth-btn active';
      allBtn.dataset.depth = 'all';
      allBtn.textContent = 'All';
      allBtn.addEventListener('click', function () { applyDepthFilter('all'); });
      depthFilters.appendChild(allBtn);

      var depthLabels = ['Sections', 'Components', 'Sub-components'];
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
          console.log('[QAProof] Loaded cached elements:', json.source, '(' + json.elements.length + ' elements)');
          renderElementOverlays(json.elements);
        } else {
          console.log('[QAProof] Cached elements empty, triggering live detection');
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

    // Saved design with Figma URL
    if (sd && sd.figmaUrl && sd.figmaToken) {
      cacheKey = sd.figmaUrl + '|' + sd.figmaToken;
      requestBody = { figmaUrl: sd.figmaUrl, figmaToken: sd.figmaToken };
    } else if (S.uploadedFileBase64) {
      var base64Parts = S.uploadedFileBase64.split(',');
      if (base64Parts.length < 2 || !base64Parts[1]) return;
      cacheKey = 'upload|' + S.uploadedFileBase64.length;
      requestBody = { figmaImageBase64: base64Parts[1] };
    } else if (S.savedDesignImageBase64) {
      var savedParts = S.savedDesignImageBase64.split(',');
      if (savedParts.length < 2 || !savedParts[1]) return;
      cacheKey = 'saved|' + S.savedDesignImageBase64.length;
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
          console.log('[QAProof] Detection source:', detectionSource, '(' + json.data.elements.length + ' elements)');
        }
        if (requestBody.figmaUrl && detectionSource === 'ai-vision') {
          console.warn('[QAProof] Figma API detection failed, fell back to AI vision. Possibly rate-limited.');
          if (detectError) {
            detectError.textContent = 'Figma API rate-limited \u2014 showing approximate detection. Try again later for pixel-perfect results.';
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
              console.log('[QAProof] Elements saved to design', autoSaveDesignId);
              var designs = qaproof.savedDesigns || [];
              for (var i = 0; i < designs.length; i++) {
                if (designs[i].id === autoSaveDesignId) {
                  designs[i].hasElements = true;
                  designs[i].elementsSource = detectionSource;
                  break;
                }
              }
            }
          })
          .catch(function () { /* silent */ });
        }
      } else {
        var msg = (json.error && json.error.message) ? json.error.message : 'No elements detected. Try a different design image.';
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
        detectError.textContent = 'Detection failed. Check your connection and try again.';
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

  var inspectorBackdrop = document.createElement('div');
  inspectorBackdrop.className = 'qaproof-inspector-backdrop';
  var qaproofApp = document.getElementById('qaproof-app');
  if (qaproofApp) {
    qaproofApp.appendChild(inspectorBackdrop);
  }

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
        textNode.textContent = isExpanded ? ' Collapse' : ' Expand';
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
      Q.showError('Please upload an image file (PNG, JPEG, WebP).');
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
      Q.showError('A test is already running. Please wait for it to finish.');
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
      S.loadingText.textContent = 'Capturing 3 viewport sizes and analyzing responsive behavior...';
      S.loadingSubtext.textContent = 'This may take 1-2 minutes (3 screenshots + AI analysis)';
    } else if (S.testType === 'accessibility') {
      S.loadingText.textContent = 'Capturing page and running accessibility audit...';
      var wcagLvl = (document.getElementById('qaproof-a11y-wcag-level') || {}).value || (typeof qaproof !== 'undefined' && qaproof.wcagLevel) || 'AA';
      S.loadingSubtext.textContent = 'Analyzing WCAG 2.1 Level ' + wcagLvl + ' compliance (30-60 seconds)';
    } else if (S.testType === 'design-audit') {
      S.loadingText.textContent = 'Scanning page and extracting design tokens...';
      S.loadingSubtext.textContent = 'Analyzing design system consistency (1-2 minutes)';
    } else if (S.selectedElement) {
      S.loadingText.textContent = 'Analyzing element: ' + S.selectedElement.label + '...';
      S.loadingSubtext.textContent = 'Cropping design region, finding match on live page, comparing (30-60 seconds)';
    } else {
      S.loadingText.textContent = 'Capturing screenshots and analyzing design...';
      S.loadingSubtext.textContent = 'This may take 15-30 seconds';
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
          Q.showError('Please upload a design image or select a saved design.');
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
      if (selectedDesign && selectedDesign.figmaToken) {
        body.figmaToken = selectedDesign.figmaToken;
      }

      if (S.savedDesignImageBase64) {
        var savedParts2 = S.savedDesignImageBase64.split(',');
        if (savedParts2.length >= 2 && savedParts2[1]) {
          body.figmaImageBase64 = savedParts2[1];
        }
      } else if (S.uploadedFileBase64) {
        var parts2 = S.uploadedFileBase64.split(',');
        if (parts2.length < 2 || !parts2[1]) {
          Q.showError('Invalid image data. Please re-upload the design file.');
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
    }

    // Step-based loading status
    var checkSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var loadingSteps = S.testType === 'design-audit' ? [
      { time: 0, text: 'Capturing page screenshot' },
      { time: 8000, text: 'Extracting design tokens from DOM' },
      { time: 18000, text: 'Analyzing color palette & typography' },
      { time: 35000, text: 'AI auditing design consistency' },
      { time: 70000, text: 'Building design debt report' },
    ] : [
      { time: 0, text: 'Capturing page screenshot' },
      { time: 8000, text: 'Processing images' },
      { time: 20000, text: 'Running AI analysis' },
      { time: 50000, text: 'Generating report' },
      { time: 90000, text: 'Finalizing results' },
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
        S.loadingSubtext.textContent = idx < loadingSteps.length - 1 ? 'This may take 1-3 minutes' : 'Almost done';
      }, step.time);
    });

    var _pendingRetries = window.__qaproofPendingRetries || 0;
    window.__qaproofPendingRetries = 0;
    Q.saveActiveJob(null, body.testType, body.pageUrl, 'tests', 'submitting', _pendingRetries);

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
          throw new Error((data.error && data.error.message) || 'Failed to create test job.');
        }

        var jobId = data.data.jobId;
        console.log('[QAProof] Job created:', jobId);
        Q.saveActiveJob(jobId, body.testType, body.pageUrl, 'tests', 'polling');

        Q.startJobPolling(jobId, {
          page: 'tests',
          onPoll: function (status, elapsed) {
            console.log('[QAProof] Poll:', status, elapsed);
          },
          onDone: function (resultData) {
            loadingTimers.forEach(clearTimeout);

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
            var historyData = Object.assign({}, resultData);
            delete historyData.screenshots;
            var saveData = new FormData();
            saveData.append('action', 'qaproof_save_history');
            saveData.append('nonce', qaproof.ajaxNonce);
            saveData.append('testType', body.testType);
            saveData.append('pageUrl', body.pageUrl);
            saveData.append('result', JSON.stringify(historyData));
            fetch(qaproof.ajaxUrl, {
              method: 'POST',
              body: saveData,
              credentials: 'same-origin',
            })
            .then(Q.safeJson)
            .then(function (saveResp) {
              console.log('[QAProof] History saved (with screenshots):', saveResp);
              if (Q.testsHistoryMgr) Q.testsHistoryMgr.load(true);
            })
            .catch(function (err) {
              console.error('[QAProof] Failed to save history:', err.message);
              if (Q.testsHistoryMgr) Q.testsHistoryMgr.load(true);
            });
          },
          onFailed: function (errorMsg) {
            loadingTimers.forEach(clearTimeout);
            Q.showError(Q.escapeHtml(errorMsg));
            S.loading.classList.add('hidden');
            S.submitBtn.disabled = false;
            S.testsPageBusy = false;
          },
        });
      })
      .catch(function (err) {
        loadingTimers.forEach(clearTimeout);
        if (err.message === 'Failed to fetch') {
          Q.showError('Could not reach the server. Check your connection. Reload the page to retry.');
        } else if (err.message && err.message.indexOf('Rate limit') !== -1) {
          Q.clearActiveJob('tests');
          Q.showError(Q.escapeHtml(err.message));
        } else {
          Q.showError(Q.escapeHtml(err.message) + ' Reload the page to retry.');
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

    var userEmail = typeof qaproofAdmin !== 'undefined' && qaproofAdmin.adminEmail ? qaproofAdmin.adminEmail : 'your account email';

    emailBtn._originalHtml = emailBtn.innerHTML;
    emailBtn.classList.add('qaproof-email-expanded');

    emailBtn.innerHTML = '' +
      '<span class="qaproof-email-confirm-text">Send to <strong>' + Q.escapeHtml(userEmail) + '</strong>?</span>' +
      '<span class="qaproof-email-confirm-actions">' +
      '  <button type="button" class="qaproof-email-confirm-cancel">Cancel</button>' +
      '  <button type="button" class="qaproof-email-confirm-send"><span class="dashicons dashicons-yes"></span> Confirm</button>' +
      '</span>';

    emailBtn.querySelector('.qaproof-email-confirm-cancel').addEventListener('click', function(ev) {
      ev.stopPropagation();
      collapseEmailBtn(emailBtn);
    });

    emailBtn.querySelector('.qaproof-email-confirm-send').addEventListener('click', function(ev) {
      ev.stopPropagation();
      var sendBtn = this;
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="dashicons dashicons-update qaproof-spin"></span> Sending...';

      setTimeout(function() {
        sendBtn.innerHTML = '<span class="dashicons dashicons-yes"></span> Sent!';
        sendBtn.classList.add('qaproof-email-sent');
        setTimeout(function() {
          collapseEmailBtn(emailBtn);
        }, 1200);
      }, 1500);
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
