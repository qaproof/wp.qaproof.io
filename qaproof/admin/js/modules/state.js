/* global qaproof */
(function () {
  'use strict';
  window.QAProof = window.QAProof || {};

  QAProof.state = {
    // DOM References — may be null if element doesn't exist on current page
    form: document.getElementById('qaproof-test-form'),
    loading: document.getElementById('qaproof-loading'),
    loadingText: document.getElementById('qaproof-loading-text'),
    loadingSubtext: document.getElementById('qaproof-loading-subtext'),
    errorDiv: document.getElementById('qaproof-error'),
    errorMessage: document.getElementById('qaproof-error-message'),
    resultsContainer: document.getElementById('qaproof-results'),
    submitBtn: document.getElementById('qaproof-submit-btn'),
    testTypeSelector: document.querySelector('.qaproof-test-type-selector'),
    figmaFields: document.getElementById('qaproof-figma-fields'),
    sourceToggle: document.getElementById('qaproof-source-toggle'),
    sourceSaved: document.getElementById('qaproof-source-saved'),
    sourceUpload: document.getElementById('qaproof-source-upload'),
    figmaFileInput: document.getElementById('qaproof-figma-file'),
    uploadPreview: document.getElementById('qaproof-upload-preview'),
    uploadPreviewImg: document.getElementById('qaproof-upload-preview-img'),
    uploadClearBtn: document.getElementById('qaproof-upload-clear'),
    connectionBtn: document.getElementById('qaproof-test-connection'),
    connectionStatus: document.getElementById('qaproof-connection-status'),

    // Test state
    testType: (typeof qaproof !== 'undefined' && qaproof.defaultTestType) ? qaproof.defaultTestType : 'fidelity',
    figmaSource: 'saved',
    uploadedFileBase64: null,
    savedDesignImageBase64: null,
    allDifferences: [],
    activeDiffIndex: null,
    activeDevice: 'desktop',
    syncScrollEnabled: true,
    markersVisible: true,
    isScrollSyncing: false,
    globalTooltip: null,
    testsPageBusy: false,
    selectedElement: null,
    elementsDetectedForCache: '',
  };

  // Helper to show error using current DOM refs
  QAProof.showError = function (msg) {
    if (QAProof.state.errorMessage) QAProof.state.errorMessage.textContent = msg;
    if (QAProof.state.errorDiv) QAProof.state.errorDiv.classList.remove('hidden');
  };

  QAProof.showErrorHtml = function (msg) {
    if (QAProof.state.errorMessage) QAProof.state.errorMessage.innerHTML = msg;
    if (QAProof.state.errorDiv) QAProof.state.errorDiv.classList.remove('hidden');
  };
})();
