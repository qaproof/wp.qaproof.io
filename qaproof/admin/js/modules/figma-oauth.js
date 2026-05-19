/* global qaproof */
/**
 * Figma OAuth connection card on Settings → Tests → Design Fidelity.
 * Exposes window.QAProof.figmaOAuthRefresh(force) so form.js can re-poll
 * status after a fidelity test fails for OAuth-related reasons.
 */
(function () {
  'use strict';
  if (!window.qaproof || !qaproof.restBase) return;

  var card = document.getElementById('qaproof-figma-conn-card');
  if (!card) return;

  var bodyEl  = card.querySelector('[data-conn-body]');
  var badgeEl = card.querySelector('[data-conn-badge]');
  var fallbackCard = document.getElementById('qaproof-figma-access-fallback');
  var i18n = (qaproof.i18n || {});

  var openPopup = null;
  var popupPoll = null;
  // Tracked so dimFallback() only toggles on state transitions, not every render.
  var prevConnectedState = null;
  // Empty when api endpoint can't be parsed; in that case origin check is skipped.
  var expectedOAuthOrigin = (qaproof.apiOrigin || '').replace(/\/+$/, '');

  function fetchStatus() {
    return fetch(qaproof.restBase + '/figma-oauth/status', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'X-WP-Nonce': qaproof.nonce, Accept: 'application/json' },
    })
      .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok || !r.body || !r.body.success) {
          return {
            error: true,
            code: r.body && r.body.error && r.body.error.code,
            message: r.body && r.body.error && r.body.error.message,
          };
        }
        return r.body.data || {};
      })
      .catch(function (err) {
        return { error: true, code: 'NETWORK_ERROR', message: err && err.message };
      });
  }

  function render(state) {
    if (!bodyEl) return;
    bodyEl.replaceChildren();

    if (state.error) {
      card.setAttribute('data-state', 'error');
      setBadge(i18n.figmaOAuthBadgeError || 'Error');
      // Backend currently uses AUTH_ERROR; match AUTHENTICATION_ERROR too for forward-compat.
      var errMsg = state.code === 'AUTH_ERROR' || state.code === 'AUTHENTICATION_ERROR' || state.code === 'INVALID_API_KEY'
        ? (i18n.figmaOAuthApiKeyMissing || 'Set your QAProof API key in Settings → API to use OAuth.')
        : (state.message || i18n.figmaOAuthLoadFailed || 'Could not load Figma connection status.');
      bodyEl.appendChild(makeError(errMsg));
      maybeToggleFallbackOnTransition(false);
      return;
    }

    if (!state.oauthEnabled) {
      card.setAttribute('data-state', 'unavailable');
      setBadge(i18n.figmaOAuthBadgeDisabled || 'Disabled');
      bodyEl.appendChild(makeBlurb(
        i18n.figmaOAuthDisabledExplain ||
        'OAuth is not enabled on this QAProof server. Use the service account below to share files manually.'
      ));
      maybeToggleFallbackOnTransition(false);
      return;
    }

    if (state.revoked) {
      card.setAttribute('data-state', 'revoked');
      setBadge(i18n.figmaOAuthBadgeRevoked || 'Reconnect needed');
      bodyEl.appendChild(makeBlurb(
        (i18n.figmaOAuthRevokedExplain ||
         'Your Figma connection is no longer valid (the app may have been removed in Figma settings). Reconnect to continue running fidelity tests.') +
        (state.figmaUserEmail ? ' ' + (i18n.figmaOAuthPreviouslyConnectedAs || 'Previously connected as') + ' ' + state.figmaUserEmail + '.' : '')
      ));
      bodyEl.appendChild(makeActions([
        button('button-primary', i18n.figmaOAuthReconnect || 'Reconnect Figma →', onConnectClick),
      ]));
      maybeToggleFallbackOnTransition(false);
      return;
    }

    if (state.connected) {
      card.setAttribute('data-state', 'connected');
      setBadge(i18n.figmaOAuthBadgeConnected || 'Connected');
      var who = state.figmaUserEmail || state.figmaUserHandle || (i18n.figmaOAuthUnknownUser || 'Figma user');
      bodyEl.appendChild(makeBlurb(
        (i18n.figmaOAuthConnectedAs || 'Connected as') + ' ' + who + '. ' +
        (i18n.figmaOAuthReadsOnDemand || 'QAProof reads files only when you run a test against them.')
      ));
      bodyEl.appendChild(makeMeta(state));
      // Figma REST API doesn't honor "Anyone with the link can view" sharing.
      // Surface that as a persistent note in the connected state so users know
      // why a Verify might fail later even though the file opens in browser.
      var note = document.createElement('p');
      note.className = 'qaproof-figma-conn-note';
      note.textContent = i18n.figmaOAuthLinkSharingNote ||
        'Note: files shared via "Anyone with the link" don\'t work through Figma\'s API. To test them, the owner must invite this account directly, or the file must live in your account / team.';
      bodyEl.appendChild(note);
      bodyEl.appendChild(makeActions([
        button('qaproof-figma-conn-disconnect', i18n.figmaOAuthDisconnect || 'Disconnect', onDisconnectClick),
      ]));
      maybeToggleFallbackOnTransition(true);
      return;
    }

    // ── Disconnected (default) ─────────────────────────────────────────
    card.setAttribute('data-state', 'disconnected');
    setBadge(i18n.figmaOAuthBadgeNotConnected || 'Not connected');
    bodyEl.appendChild(makeBlurb(
      i18n.figmaOAuthDisconnectedBlurb ||
      'One-click connection. After you authorize QAProof in Figma, every file you can open is testable — no per-file sharing needed.'
    ));
    bodyEl.appendChild(makeActions([
      button('button-primary', i18n.figmaOAuthConnect || 'Connect Figma →', onConnectClick),
    ]));
    maybeToggleFallbackOnTransition(false);
  }

  function setBadge(text) {
    if (badgeEl) badgeEl.textContent = text || '';
  }

  // Only auto-toggles on state transitions so manual user toggles aren't undone.
  function maybeToggleFallbackOnTransition(shouldDim) {
    if (!fallbackCard) return;
    var connected = !!shouldDim;
    if (prevConnectedState === connected) return;
    if (connected) {
      fallbackCard.removeAttribute('open');
    } else {
      fallbackCard.setAttribute('open', '');
    }
    prevConnectedState = connected;
  }

  function makeBlurb(text) {
    var p = document.createElement('p');
    p.className = 'qaproof-figma-conn-blurb';
    p.textContent = text;
    return p;
  }
  function makeError(text) {
    var div = document.createElement('div');
    div.className = 'qaproof-figma-conn-error';
    div.textContent = text;
    return div;
  }
  function makeActions(buttons) {
    var div = document.createElement('div');
    div.className = 'qaproof-figma-conn-actions';
    buttons.forEach(function (b) { div.appendChild(b); });
    return div;
  }
  function button(cls, label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'button ' + cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
  function makeMeta(state) {
    var dl = document.createElement('dl');
    dl.className = 'qaproof-figma-conn-meta';
    var rows = [];
    if (state.figmaUserHandle && state.figmaUserHandle !== state.figmaUserEmail) {
      rows.push([i18n.figmaOAuthMetaAccount || 'Account', state.figmaUserHandle]);
    }
    if (state.scope) {
      rows.push([i18n.figmaOAuthMetaScopes || 'Scopes', codeWrap(state.scope)]);
    }
    if (state.expiresAt) {
      rows.push([i18n.figmaOAuthMetaRefreshes || 'Token refreshes', formatRelativeFuture(state.expiresAt)]);
    }
    if (state.connectedAt) {
      rows.push([i18n.figmaOAuthMetaConnected || 'Connected', formatDate(state.connectedAt)]);
    }
    rows.forEach(function (r) {
      var dt = document.createElement('dt'); dt.textContent = r[0]; dl.appendChild(dt);
      var dd = document.createElement('dd');
      if (typeof r[1] === 'string') dd.textContent = r[1]; else dd.appendChild(r[1]);
      dl.appendChild(dd);
    });
    return dl;
  }
  function codeWrap(text) {
    var code = document.createElement('code');
    code.textContent = text;
    return code;
  }
  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString();
    } catch (e) { return iso; }
  }
  function formatRelativeFuture(iso) {
    try {
      var d = new Date(iso);
      var diffMs = d.getTime() - Date.now();
      if (diffMs <= 0) return i18n.figmaOAuthSoon || 'on next test';
      var days = Math.floor(diffMs / 86400000);
      if (days > 1) return (i18n.figmaOAuthInDays || 'auto-renews in') + ' ' + days + ' ' + (i18n.figmaOAuthDays || 'days');
      var hours = Math.floor(diffMs / 3600000);
      if (hours > 1) return (i18n.figmaOAuthInHours || 'auto-renews in') + ' ' + hours + ' ' + (i18n.figmaOAuthHours || 'hours');
      return i18n.figmaOAuthSoon || 'on next test';
    } catch (e) { return iso; }
  }

  function onConnectClick(e) {
    e.preventDefault();
    var btn = e.currentTarget;
    var originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = i18n.figmaOAuthOpening || 'Opening Figma…';

    // Open popup BEFORE the async fetch so it counts as a direct user gesture.
    var w = 600, h = 720;
    var x = Math.max(0, (window.screen.availWidth || window.innerWidth) - w) / 2;
    var y = Math.max(0, (window.screen.availHeight || window.innerHeight) - h) / 2;
    var popup = window.open('about:blank', 'qaproof-figma-oauth',
      'width=' + w + ',height=' + h + ',left=' + Math.floor(x) + ',top=' + Math.floor(y) +
      ',resizable=yes,scrollbars=yes,status=yes,noopener=no');

    if (!popup) {
      btn.disabled = false;
      btn.textContent = originalText;
      alert(i18n.figmaOAuthPopupBlocked || 'Popup was blocked. Allow popups for this site and try again.');
      return;
    }
    openPopup = popup;

    fetch(qaproof.restBase + '/figma-oauth/start', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': qaproof.nonce,
      },
      body: '{}',
    })
      .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, body: j }; }); })
      .then(function (r) {
        if (!r.ok || !r.body || !r.body.success) {
          var msg = (r.body && r.body.error && r.body.error.message) || (i18n.figmaOAuthStartFailed || 'Could not start Figma OAuth.');
          var code = r.body && r.body.error && r.body.error.code;
          if (code === 'AUTH_ERROR' || code === 'AUTHENTICATION_ERROR' || code === 'INVALID_API_KEY') {
            msg = i18n.figmaOAuthApiKeyMissing || 'Set your QAProof API key in Settings → API to use OAuth.';
          }
          try { popup.close(); } catch (_) {}
          openPopup = null;
          btn.disabled = false;
          btn.textContent = originalText;
          renderError(msg);
          return;
        }
        var url = r.body.data && r.body.data.authorizeUrl;
        if (!url) {
          try { popup.close(); } catch (_) {}
          openPopup = null;
          btn.disabled = false;
          btn.textContent = originalText;
          renderError(i18n.figmaOAuthMissingUrl || 'Server did not return an authorize URL.');
          return;
        }
        try {
          popup.location.href = url;
        } catch (err) {
          openPopup = null;
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }
        // Fallback for when postMessage never arrives (COOP, JS disabled, etc.):
        // re-fetch status on popup close so the UI still settles correctly.
        startPopupClosedWatcher(popup, function () {
          if (btn.isConnected) {
            btn.disabled = false;
            btn.textContent = originalText;
          }
          fetchStatus().then(render);
        });
      })
      .catch(function () {
        try { popup.close(); } catch (_) {}
        openPopup = null;
        btn.disabled = false;
        btn.textContent = originalText;
        renderError(i18n.figmaOAuthNetwork || 'Network error starting Figma OAuth. Try again.');
      });
  }

  function startPopupClosedWatcher(popup, onClosed) {
    if (popupPoll) clearInterval(popupPoll);
    popupPoll = setInterval(function () {
      try {
        if (!popup || popup.closed) {
          clearInterval(popupPoll);
          popupPoll = null;
          onClosed();
        }
      } catch (e) {
        clearInterval(popupPoll);
        popupPoll = null;
      }
    }, 800);
  }

  function renderError(msg) {
    if (!bodyEl) return;
    var existing = bodyEl.querySelector('.qaproof-figma-conn-error');
    if (existing) existing.remove();
    var err = makeError(msg);
    bodyEl.insertBefore(err, bodyEl.firstChild);
    setTimeout(function () {
      if (err.isConnected) err.remove();
    }, 8000);
  }

  // OAuth-callback popup → opener message bridge.
  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || typeof data !== 'object' || data.source !== 'qaproof-figma-oauth') return;
    if (expectedOAuthOrigin && event.origin !== expectedOAuthOrigin) {
      try { console.warn('[QAProof] OAuth postMessage from unexpected origin', event.origin); } catch (_) {}
      return;
    }

    if (openPopup) {
      try { openPopup.close(); } catch (_) {}
      openPopup = null;
    }
    if (popupPoll) { clearInterval(popupPoll); popupPoll = null; }

    if (data.ok) {
      fetchStatus().then(render);
    } else {
      fetchStatus().then(function (s) {
        render(s);
        renderError(data.message || (i18n.figmaOAuthConnectFailed || 'Failed to connect Figma.'));
      });
    }
  });

  function onDisconnectClick(e) {
    e.preventDefault();
    var btn = e.currentTarget;
    var confirmMsg = i18n.figmaOAuthDisconnectConfirm ||
      'Disconnect Figma? Fidelity tests will use the manual share-with figma@qaproof.io path until you reconnect.';
    var confirmFn = (window.QAProof && typeof window.QAProof.confirm === 'function')
      ? function () {
          return window.QAProof.confirm(confirmMsg, {
            title: i18n.figmaOAuthDisconnect || 'Disconnect',
            okLabel: i18n.figmaOAuthDisconnect || 'Disconnect',
            danger: true,
          });
        }
      : function () { return Promise.resolve(window.confirm(confirmMsg)); };

    confirmFn().then(function (ok) {
      if (!ok) return;
      btn.disabled = true;
      btn.textContent = i18n.figmaOAuthDisconnecting || 'Disconnecting…';
      fetch(qaproof.restBase + '/figma-oauth/disconnect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': qaproof.nonce,
        },
        body: '{}',
      })
        .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, body: j }; }); })
        .then(function () { return fetchStatus(); })
        .then(render)
        .catch(function () {
          if (btn.isConnected) {
            btn.disabled = false;
            btn.textContent = i18n.figmaOAuthDisconnect || 'Disconnect';
          }
          renderError(i18n.figmaOAuthNetwork || 'Network error. Try again.');
        });
    });
  }

  if (!window.QAProof) window.QAProof = {};
  window.QAProof.figmaOAuthRefresh = function () { return fetchStatus().then(render); };
  // form.js reads this to suppress the "share with figma@qaproof.io" guide
  // when OAuth is connected (that path doesn't apply).
  window.QAProof.isFigmaOAuthConnected = function () {
    return card.getAttribute('data-state') === 'connected';
  };

  fetchStatus().then(render);
})();
