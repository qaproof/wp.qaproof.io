=== QAProof ===
Contributors: qaproof
Tags: design qa, responsive, accessibility, visual regression, wcag
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 8.0
Stable tag: 1.0.16
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Compare live pages against Figma, audit accessibility (WCAG 2.1), detect visual regressions, and analyze responsive behavior — powered by AI vision.

== Description ==

QAProof helps WordPress site owners and developers catch visual bugs before users do. It pairs Playwright-rendered screenshots of your live pages with AI vision analysis to find design drift, accessibility issues, and responsive breakage automatically.

https://youtu.be/I3ZUg2rDA7w

Five test types, one workflow:

* **Design Fidelity** — Compares your live page against a Figma design (or any image you upload) and reports layout drift, color mismatches, typography differences, spacing issues, and component variations with severity ratings and pixel-coordinate markers.
* **Responsive Testing** — Renders the page at desktop, tablet, and mobile viewports and analyzes how the layout adapts. Flags overflow, broken stacks, illegible text, missing media-query rules.
* **Accessibility Audit** — WCAG 2.1 Level A / AA / AAA compliance check. Covers color contrast, focus indicators, heading hierarchy, form labels, ARIA misuse, touch-target sizes, and more, with the WCAG criterion referenced for each violation.
* **Visual Regression Monitoring** — Scheduled screenshot diffing. Captures a baseline of a page, then re-shoots on a daily / weekly / monthly schedule and alerts you if anything changed (broken CSS deploy, missing image, accidental layout shift). Email + in-admin notifications when scores drop below your threshold.
* **Design Audit** — Extracts your live design tokens (colors, fonts, spacing, components) and grades your design system's internal consistency on a Design Debt Score.

**How it works:** QAProof is a WordPress plugin that talks to a hosted SaaS API (api.qaproof.io). The API runs the headless browser, calls the AI vision model, and returns structured reports. You need a QAProof account and API key — sign up free at https://qaproof.io.

**Why a SaaS backend?** Running a headless browser + AI vision model in a WordPress request would crash most hosts (Chromium binary alone is 300 MB, image analysis runs 10–60 s). Doing it server-side keeps your hosting fast and lets us batch / cache / dedupe expensive operations.

== Installation ==

1. From your WordPress admin, go to **Plugins → Add New** and search for "QAProof". Click **Install Now**, then **Activate**.
2. Sign up for a free QAProof account at https://qaproof.io and copy your API key from the cabinet.
3. In WordPress, open **QAProof → Settings → API**, paste the API key, and click **Test Connection**.
4. (Optional) Connect your Figma account at **Settings → Tests → Design Fidelity → Figma connection → Connect Figma** so the plugin can read your design files directly. Alternatively, share each Figma file with `figma@qaproof.io` manually.
5. Open **QAProof → Tests** to run your first comparison.

== Frequently Asked Questions ==

= Is QAProof free? =

The WordPress plugin is free and GPL-licensed. The hosted API has a free tier suitable for individual sites and paid plans for higher volume. See https://qaproof.io/pricing.

= Do I need a Figma account? =

Only for Design Fidelity tests that use a Figma URL as the design source. You can also upload a design as an image (PNG / JPG / Sketch file) without any Figma account. Other test types (responsive, accessibility, regression, design audit) don't use Figma at all.

= What data does QAProof send to the SaaS API? =

For each test, the plugin sends the page URL, the design source (Figma URL OR uploaded image bytes), and a few render options (viewport sizes, WCAG level). The API renders the page in a headless browser, captures screenshots, runs AI vision analysis, and returns a structured report. See "External Services" below for the full list.

= Where are test results stored? =

On the QAProof SaaS database, scoped to your workspace. The plugin does not create a local copy of test results on fresh installs. See the "Privacy" section below for the full list of locally-stored data (configuration only — API key, notification email, saved-design configuration, feedback log).

= Can I self-host the backend? =

Not at the moment. The plugin is open-source under GPL-2.0+, but the API server is closed-source SaaS. If self-hosting matters for your use case, write to support@qaproof.io.

= Does the plugin work on a Multisite network? =

Yes, with per-site configuration. The plugin can be network-activated, but each site in the network configures its own QAProof API key and Figma connection independently via that site's **QAProof → Settings**. Test results, monitors, and history are also scoped per-site. The plugin does not currently support a single shared API key at the network level.

= How long does a test take? =

15–30 seconds for Design Fidelity, 1–2 minutes for Responsive (3 viewports), 2–5 minutes for Accessibility audits on complex pages.

= What happens if my API key is missing or wrong? =

The plugin renders a clear error in the test UI. No test is run, nothing is sent. You can re-paste the key any time in Settings → API.

== External Services ==

QAProof is a SaaS-backed plugin. All test execution happens on the QAProof API server, which in turn calls an AI vision API and (optionally) Figma's REST API. The WordPress plugin itself contacts ONE external service: the QAProof API at api.qaproof.io. It never contacts the AI provider or Figma directly.

= Service: QAProof API =

The plugin sends HTTPS requests to api.qaproof.io (default endpoint, configurable to a self-hosted host via the `QAPROOF_API_ENDPOINT` PHP constant). This is required for the plugin to function — without it, no test can run.

**Test execution & polling**

* `POST   https://api.qaproof.io/api/compare` — start a new test (when the user clicks "Run test" or when a scheduled monitor fires). Sends: page URL, test type, design source (Figma URL or uploaded image bytes as base64), viewport size, WCAG conformance level, ignore-text flag.
* `GET    https://api.qaproof.io/api/jobs/{jobId}` — poll the status of an in-flight test (every 5 seconds while running). Sends: nothing in the body, just the job ID in the URL.
* `DELETE https://api.qaproof.io/api/jobs/{jobId}` — cancel an in-flight test when the user closes the browser tab. Sends: nothing.
* `GET    https://api.qaproof.io/api/jobs/{jobId}/screenshots` — fetch the completed test's screenshots after the test finishes. Sends: nothing.

**Figma integration (optional)**

* `POST   https://api.qaproof.io/api/figma-preview` — fetch a Figma frame as a PNG for the in-admin preview pane (only when the user selects a Figma URL). Sends: the Figma file URL.
* `POST   https://api.qaproof.io/api/figma/verify-access` — verify the plugin can access a Figma file before sending a full test. Sends: the Figma file URL.
* `POST   https://api.qaproof.io/api/detect-elements` — extract individual UI elements from an uploaded design image. Sends: image bytes.
* `POST   https://api.qaproof.io/api/figma-oauth/start` — begin the Figma OAuth connection. Sends: nothing.
* `GET    https://api.qaproof.io/api/figma-oauth/status` — check the current Figma connection state. Sends: nothing.
* `POST   https://api.qaproof.io/api/figma-oauth/disconnect` — disconnect the workspace's Figma OAuth tokens. Sends: nothing.

**Account, plan & health**

* `GET    https://api.qaproof.io/api/me` — fetch the QAProof account's plan and remaining quota, displayed in Settings → API. Sends: nothing.
* `GET    https://api.qaproof.io/api/health` — connection health check from Settings → API. Sends: nothing.

**Baselines (visual regression)**

* `POST   https://api.qaproof.io/api/baselines` — create a baseline screenshot. Sends: page URL, baseline key.
* `GET    https://api.qaproof.io/api/baselines` — list baselines.
* `GET    https://api.qaproof.io/api/baselines/{key}` — fetch a single baseline (including screenshot bytes).
* `DELETE https://api.qaproof.io/api/baselines/{key}` — delete a baseline.

**Monitors (scheduled tests)**

* `GET/POST   https://api.qaproof.io/api/monitors` — list / create scheduled monitors. Sends on create: page URL, schedule, threshold score, notification email.
* `GET/PUT/DELETE https://api.qaproof.io/api/monitors/{id}` — read / update / delete a single monitor.
* `GET   https://api.qaproof.io/api/monitors?schedule={daily|weekly|monthly}&due=1` — WP-Cron queries monitors due to run.
* `GET   https://api.qaproof.io/api/monitors/{id}/results` — fetch a monitor's historical results.
* `PUT   https://api.qaproof.io/api/results/{id}/approve` — approve a regression result (captures a fresh baseline).

**Test history (cabinet sync)**

* `POST  https://api.qaproof.io/api/history` — save a test result to the SaaS history. Sends: test type, page URL, score, summary, differences JSON, screenshot URLs / base64 thumbnails.
* `GET   https://api.qaproof.io/api/history?...` — list history rows with pagination + filters.
* `GET   https://api.qaproof.io/api/history/{id}` — fetch a single history row (full result detail).
* `DELETE https://api.qaproof.io/api/history/{id}` — delete a history row from the SaaS.
* `GET   https://api.qaproof.io/api/history/stats?threshold=N` — fetch summary statistics for the dashboard tiles.

**Email reports**

* `POST  https://api.qaproof.io/api/send-report-email` — when the user clicks "Send to Email" on a test result, the plugin sends the generated PDF report (base64-encoded) and the recipient email address (the currently-logged-in WordPress administrator's user email, with fall-back to the QAProof notification email or the site admin email) to the API. The API then emails the report from its outbound mail server (Amazon SES). The PDF and the recipient email leave the WordPress site and are processed by the QAProof API and its email provider.

**Common request metadata sent on every call**

* Your **QAProof API key**, in the `Authorization: Bearer ...` header, so the API can authenticate the request.
* A **WordPress / PHP version banner** in the standard `User-Agent` header (`QAProof-WordPress/<plugin> (WordPress/<wp>; PHP/<php>)`) so the API can detect known-incompatible host versions. The header does NOT contain your site URL — the API server learns the requesting IP only from the TCP connection itself.

The plugin does NOT send: any post content, user passwords, page visitors' IP addresses, comments, cookies, or any other site content beyond the explicit URL the user types into the test form or its scheduled monitor configuration.

QAProof Terms of Service: https://qaproof.io/terms
QAProof Privacy Policy: https://qaproof.io/privacy

= Service: AI Vision — used by QAProof API, NOT by this plugin =

The QAProof API server calls an AI vision model to perform the image analysis. This plugin does NOT call the AI provider directly — the WordPress site never opens a connection to the AI provider's servers. Image bytes are processed under the QAProof API's data processing terms, which prohibit model training on your data.

QAProof Terms of Service: https://qaproof.io/terms
QAProof Privacy Policy: https://qaproof.io/privacy

= Service: Figma — used by QAProof API, NOT by this plugin =

If you connect your Figma account via the in-admin OAuth flow or submit a public Figma URL, the QAProof API reads the specific Figma file(s) you submit for testing so it can export the design as a PNG image. The WordPress plugin itself never contacts Figma's servers directly; the OAuth handshake redirects through api.qaproof.io.

Figma Terms of Service: https://www.figma.com/legal/tos/
Figma Privacy Policy: https://www.figma.com/legal/privacy/

= Trademarks =

QAProof is an independent product. It is not affiliated with, endorsed by, or sponsored by Figma, Inc., or Automattic Inc. "Figma" is a trademark of Figma, Inc. "WordPress" is a trademark of the WordPress Foundation.

== Privacy ==

**Where test data lives.** All test results, monitor definitions, monitor result history, and visual regression baselines live on the QAProof SaaS, scoped to your QAProof workspace. The plugin does NOT create custom database tables on fresh installs (a single legacy table — `{prefix}qaproof_monitors` — may exist on sites upgrading from a pre-1.7.0 release; its data is migrated to the SaaS on first upgrade and the table is dropped on uninstall).

**Locally-stored data (in `wp_options` unless noted).** All of the following carry the `qaproof_` prefix and the API-key option is forced non-autoloaded:

* `qaproof_api_key` — your QAProof API key. Never displayed unmasked in the UI; non-autoloaded.
* `qaproof_notify_email` — the configured notification recipient (defaults to the site admin email).
* `qaproof_notify_email_enabled`, `qaproof_notify_admin_enabled`, `qaproof_default_threshold`, `qaproof_cron_hour` — notification preferences.
* `qaproof_saved_designs` — page URL, Figma URL, optional cached PNG of the Figma design (bytes fetched from the connected Figma file). Non-autoloaded.
* `qaproof_feedback_log` — ring buffer (max 200 entries, trimmed by age after 180 days) of in-admin "How was this test?" ratings. Each entry contains: the numeric rating, an optional free-text comment, the page URL, the test type, the score, the WordPress user ID of the author, and a timestamp.
* `qaproof_figma_api_usage`, `qaproof_figma_rate_limit` — per-file Figma API request counts and rate-limit retry timers, used to back off when Figma's per-plan quota is exhausted. No PII.
* `qaproof_alert_count` — transient (30-day TTL) holding the admin-menu "you have N unread alerts" badge count.
* `qaproof_db_version`, `qaproof_monitors_api_migrated` — version markers used by the one-time legacy migration.

**Client-side (browser).** The plugin's JS sets the following `localStorage` keys (no cookies are set, no third-party storage is used):

* `qaproof_theme` — your light / dark / auto theme preference.
* `qaproof:design:<id>` / `qaproof:design:auto:<id>` — element-detection cache state per saved design so the in-admin UI shows the cached element overlay without a re-detection round-trip.

Job IDs and a tab-open flag for active tests are written to `sessionStorage` (cleared when the tab closes).

**WordPress privacy hooks (Tools → Export Personal Data / Erase Personal Data).** The plugin registers a personal-data exporter and eraser covering: the notification recipient email and any feedback-log entries authored by the user whose email is requested. Local erasure removes these on this site only — it does NOT propagate to the QAProof SaaS. To delete SaaS-side test history, monitor results, or your QAProof account contact support@qaproof.io.

**Where data is processed.** api.qaproof.io is hosted in AWS us-east-1 (United States). The QAProof API forwards image bytes to an AI vision provider (United States) for analysis, fetches Figma file exports from Figma's API (United States) when you submit a Figma URL or connect Figma, and sends email reports via Amazon SES (United States). For EU-based site owners these are GDPR international transfers — see the QAProof Privacy Policy at https://qaproof.io/privacy for the legal mechanisms in use.

**Privacy Policy helper.** The plugin contributes suggested copy to your site's Privacy Policy via WordPress's `wp_add_privacy_policy_content()`. Visit **Settings → Privacy → Policy guide** in your WordPress admin to review and merge it into your published Privacy Policy.

**No analytics, no tracking.** No tracking pixels, no fingerprinting, no analytics, and no third-party scripts run on the front-end of your site. All plugin assets (CSS, JS, fonts) are bundled locally — nothing is loaded from external CDNs.

== Screenshots ==

1. Dashboard — recent test results and quick-launch tiles.
2. Design Fidelity test — Figma vs live page side-by-side with severity-tagged markers.
3. Responsive test — enter a page URL and run desktop / tablet / mobile analysis in one click.
4. Accessibility audit — running a WCAG 2.1 Level AA audit with live progress steps.
5. Visual Regression monitors — scheduled monitors list showing run status and last score.
6. Settings — API key configuration with plan info and quota display.
7. Accessibility score overview — overall score, category breakdown, and issue severity donut chart.
8. Accessibility overlay — violations highlighted directly on the live page with marker tooltips.
9. Issues and recommendations — full list of WCAG violations grouped by category with fix suggestions.

== Changelog ==

= 1.0.16 =
Fix the Visual Comparison missing from a fresh Design Fidelity result.

* The side-by-side Visual Comparison (design vs live, with difference markers) only appeared when you opened a test from History — never right after running it. Screenshots are stripped from the poll response and loaded asynchronously to keep the payload small, but the comparison block only rendered when screenshots were already present, so on a fresh run it was skipped entirely and the async load had no `<img>` elements to populate. It now renders the comparison shell as soon as the result arrives (matching how the responsive/accessibility sections already work) and the screenshots + markers fill in when they load. No API change.

= 1.0.15 =
Design Fidelity accuracy overhaul — stop the content noise, catch real layout differences.

* "Ignore text content differences" is now ON by default. Design fidelity is about visual match, and live pages almost always carry different copy than the mockup (placeholder vs real text, dynamic catalogs, prices). Flagging that by default buried genuine visual issues — broken layout, wrong header height, off spacing — under a pile of "this product title differs" noise. Uncheck the setting to opt back into text-content flagging.
* Catches structural/proportion differences it used to miss. The comparison now runs an explicit structural pass (header/nav height, hero size, grid density, card proportions, footer) and the two images are normalised to the same width before analysis, so the AI can tell when a region is taller or shorter and flag it. Previously a different header height could slip through entirely.

**Requires** the companion `api.qaproof.io` deploy (prompt + image-pipeline changes).

= 1.0.14 =
Fix the "Ignore Text Differences" toggle, and sweep up orphaned WP-Cron events.

* The Design Fidelity setting "Ignore text content differences" was effectively stuck ON. `wp_localize_script` string-casts scalars, so the localized option arrived in JS as `"1"` (on) or `""` (off) — never a real boolean. The form compared it with `!== false`, and an empty string is never strictly equal to `false`, so every fidelity test sent `ignoreText: true` regardless of the toggle. Turning the setting off had no effect; text differences were always ignored. The form now coerces truthiness, so off actually means off (text differences get flagged again). No API change.
* Cleared leftover WP-Cron events on upgraded sites. Monitor scheduling moved entirely to the SaaS API a few releases ago, but sites upgrading from a pre-API version still had the old recurring `qaproof_cron_daily/weekly/monthly` events (and the single-event `qaproof_run_monitor`) sitting in WordPress's cron array, firing on schedule with no handler attached — harmless no-ops, but visible as "no action" entries in tools like WP Crontrol. The plugin now sweeps them once (idempotent, guarded by a one-time flag so it also reaches sites already on the latest DB version). The plugin no longer schedules or relies on WP-Cron at all.

= 1.0.13 =
Hardening: API client treats any 2xx as success.

* Ten API-client methods hard-coded `HTTP 200` as the only success status (separate from the shared `api_request()` helper fixed in 1.0.11). Every endpoint they call returns 200 today, so there's no behaviour change — but if any of them ever returns 201/202/204, it would have been misread as an error (the same class of bug that broke "Run now" on 202 in 1.0.11). All ten now accept any 2xx, with the response body's `success` flag remaining the authoritative gate.

= 1.0.12 =
Fix monitor card stuck on "Running" after a run finished.

* "Run now" sets a `run_queued` transient (25-min TTL) to show the instant "Running" state. The run itself executes on the API server, which cannot clear a WordPress transient when it completes — so the card kept showing "Running" for up to 25 minutes even though the regression actually finished in ~50 seconds (the result row was already saved). The list now self-heals: as soon as the monitor's `last_run_at` shows the run completed (success or failure), the transient is cleared and the card returns to its score. Also fixed the `run_queued_at` flag being injected only on the cache-miss path, which made the badge flicker with the 9-second list cache.

= 1.0.11 =
Hotfix: "Run now" reported a false error.

* The API client's success check accepted only HTTP 200/201. The new monitor run-now endpoint returns **202 Accepted** (fire-and-forget), so a successful run was misread as an error ("API returned HTTP 202"). The client now accepts any 2xx status — the `success` flag in the response body remains the authoritative check. The monitor run actually dispatched fine; only the WP-side response handling was wrong.

= 1.0.10 =
Fix the monitor "Run now" button.

* **"Run now" was dispatching into a void.** When monitor scheduling moved to the API server, `class-scheduler.php` (which held the `qaproof_run_monitor` WP-Cron handler) was removed — but the "Run now" button still scheduled that now-handlerless hook, so a manual run never actually executed. The button now calls a new API endpoint (`POST /api/monitors/:id/run`) that runs the monitor immediately server-side, reusing the exact same logic as the scheduled runs (baseline on first run, regression afterwards, with email alerts). The browser polls for the result as before.
* Removed the now-pointless browser-side `wp-cron.php` pings from the monitor polling loops — the run no longer depends on a WP-Cron tick.

**Requires** the companion `api.qaproof.io` deploy that adds `POST /api/monitors/:id/run`.

= 1.0.9 =
Deep cleanup of the Design Fidelity feature: removed two redundant subsystems and tidied the OAuth card. ~1600 lines of dead/duplicate code deleted.

* **Removed the WP-side design-image/element cache.** The "Save image to WordPress" flow (storing 2–5 MB base64 per design in wp_options, plus the cache-status pill, auto-cache queue, staleness detection, lazy-load, and the save-image / save-elements REST endpoints) was redundant with the API's own server-side Figma cache (filesystem, 24h TTL) — and with OAuth each workspace now uses its own Figma quota, so the original shared-quota pressure that justified the WP cache is gone. Saved designs are now simply **name + Figma URL**. The Figma preview, Detect Elements / Inspector, and Verify access all keep working (they hit the API live; the API caches server-side). Net: a whole class of pill-state bugs eliminated, no more multi-MB blobs in the options table, and the confusing "open the Tests page and click Save" indirection is gone.
* **Removed the dead Upload-Image source.** Its markup had already been taken out of the Tests page, but the JS (source toggle, file reader, upload preview) and CSS were left behind querying elements that no longer exist. All of it is now gone; the saved-design Figma URL is the single design source in the plugin.
* **Figma connection card:** the connected account is now shown in **bold** ("Connected as **you@example.com**").
* Pruned the now-unused i18n strings and CSS that backed the removed flows.

**Companion API:** pairs with an `api.qaproof.io` deploy that drops the WP-cache `cachedLastModified` staleness handshake from the compare schema. (The API keeps `figmaImageBase64` for external API consumers — only the WP-plugin's use of it was removed.)

= 1.0.8 =
Fix the admin version badge showing the wrong version.

* **`QAPROOF_VERSION` was hardcoded to `1.0.3`** and the release process only ever bumped the plugin-header `Version:` line — so from v1.0.4 through v1.0.7 the admin footer badge, the asset cache-bust query string, and the API-client User-Agent all reported `1.0.3` while the actual code moved on. The constant is now **derived from the plugin header** via `get_file_data()`, so the two can never drift again. No functional change beyond correct version reporting.

= 1.0.7 =
Figma is now OAuth-only — the manual "share files with our service account" path is gone, plus a batch of OAuth-flow correctness fixes from a full audit of the design-fidelity feature.

* **Removed the "Alternative: share files manually with our service account" workflow end to end.** The service-account PAT it relied on (`figma@qaproof.io` per-file invites) was retired on the API; keeping the UI for it just confused users into a setup path that no longer worked. Deleted: the Alternative card in Settings, the step-by-step share-guide modal, the "Show me how" / Copy-service-email buttons, and all the associated i18n strings and CSS. Connect Figma (OAuth) is now the single, clear path. Existing saved designs with a cached image keep working on the Tests page regardless.
* **Verify-access / preview / test error copy is OAuth-aware.** `FIGMA_NOT_SHARED` now explains the *connected account* doesn't have access (and how to fix it in Figma) instead of telling users to share with a service email that no longer reads files. Added a distinct `FIGMA_NOT_CONFIGURED` message for the "not connected yet" case.
* **OAuth disconnect UX:** the confirm dialog and disabled-server blurb no longer reference the removed manual-share fallback.
* **Internal correctness fixes (from the audit):**
  * Disconnect no longer double-fires the saved-design pill invalidation — the MutationObserver on the connection card's state is the single source of truth.
  * The fragile `errorMsg.indexOf('figma@qaproof.io')` string-match that used to trigger the share guide on a failed test was removed; it broke whenever backend copy changed.
  * Fixed a stuck-submit bug: an invalid-image early-return left `testsPageBusy` set, silently blocking the next test click until reload.
  * Dropped dead `maybeToggleFallbackOnTransition` code that pointed at the now-deleted Alternative card.

**Companion API release required:** this pairs with an `api.qaproof.io` deploy that removes `FIGMA_SERVICE_TOKEN` and makes OAuth the only Figma auth path (`FIGMA_OAUTH_CLIENT_ID/SECRET` now required in production). Also tightens the Figma rate-limit `Retry-After` handling and an OAuth token-refresh race that could spuriously mark a workspace "reconnect needed".

= 1.0.6 =
Re-think: gate Figma-dependent affordances on actual OAuth state instead of just relabelling the pill.

* **`Verify access` and `+ Add Design` are now hidden when Figma OAuth isn't connected.** Previously the buttons stayed visible alongside a "NOT CONNECTED" badge — clicking Verify would just round-trip to a service-PAT fallback the user almost certainly hadn't shared the file with, and Add Design dropped the user into a flow that would immediately fail at first verify. Both controls now appear only when the OAuth status resolves to `connected`. Existing saved designs stay visible (the cached image still works on the Tests page) but the Saved Designs section is dimmed and prefixed with an inline banner explaining why action affordances are off until reconnect.
* **App-level OAuth-connection class is wired through a MutationObserver on the OAuth card's `data-state` attribute.** Single source of truth — every `render()` exit, every `fetchStatus().then(render)` call site, and every future state transition gets the same UI gating for free, instead of having to remember to update each callsite. The class also runs the existing `invalidateFigmaSourcedPills()` whenever state leaves `connected`, so the v1.0.4 disconnect-time flip and the v1.0.5 initial-render flip collapse into one place.

= 1.0.5 =
Follow-up to 1.0.4 — invalidate Figma-sourced pills on initial render, not only on Disconnect click.

* **"Ready · N elements (figma-api)" pill no longer stays green when Figma is NOT CONNECTED on page load.** 1.0.4 wired the invalidation into the Disconnect handler only — so users who land on Settings after their plugin update (or after `figma_oauth_connections` was wiped server-side) still saw a green pill that implied live Figma API access. The figma-oauth.js init flow now also runs `invalidateFigmaSourcedPills()` whenever the resolved status isn't 'connected' (so disconnected / revoked / unavailable / OAuth-disabled all flip the pills to the amber 'stale' state on first render).

= 1.0.4 =
Design-fidelity audit fixes — verify-access error UX, mismatch panel, history view, and cron-notice scope.

* **Saved-design "Verify access" errors are now visible.** PHP-rendered existing rows were missing the sibling `.qaproof-design-verify-msg` slot that the JS-built new rows have, so `setVerifyMsg()` silently no-oped and the user saw only "✗ Failed" with no reason. The slot is now rendered identically on both code paths and the FIGMA_FILE_NOT_FOUND / FIGMA_NOT_SHARED messages appear under the row.
* **Cache pill invalidates on verify-access failure.** Previously "Ready · N elements (figma-api)" stayed green even after a FIGMA_FILE_NOT_FOUND or FIGMA_NOT_SHARED response. The pill now flips to a red `error` state with `File not found — cache stale` / `No access — cache stale` so the stale cache is visible at a glance. Other error codes (rate-limit, network) leave the pill alone since the file itself is still presumed valid.
* **Mismatch panel text is readable.** When the AI short-circuits because design and live page are different sites, `.qaproof-report-hero.qaproof-fidelity-mismatch` rendered with `color === background` (both `rgb(34,40,49)`) so the heading + bullets were literally invisible. Explicit `color: var(--qp-white)` rules now keep the recovery copy readable in both light and dark themes; the inline `color:#666` hint was replaced with a class so it scales with the theme.
* **History view of mismatch / element-mode results no longer collapses to "—/100".** `history_save()` was only copying `categories` / `differences` / `recommendations` into the stored result blob, so the render-branch flags (`mismatch`, `designSite`, `liveSite`, `elementTest`, `matched`, `freshnessCheckFailed`, `scoreRecomputed`, `parseFailed`) were silently dropped on save. `parseResultData()` lifts the same list back out on read, so opening a mismatch entry from History now routes through `renderFidelityMismatch()` (with its Edit URL / Back to test setup CTAs) instead of the generic score layout with a misleading "No analysis data available" warning.
* **Preview empty-state copy no longer mentions an upload UI that doesn't exist.** "Select a saved design or upload an image to preview" → "Select a saved design to preview" (three places: i18n string, JS default, page-tests.php).
* **DISABLE_WP_CRON notice scoped to Monitors / Dashboard only**, and dismissal stored in `wp_options` instead of `user_meta`. The constant only affects scheduled monitors, so showing the warning on Settings / Tests / Accessibility was noise. One admin clicking ✕ now quiets it for the whole site (previously each admin re-dismissed individually).
* **Saved-design pills are invalidated on Figma OAuth disconnect.** New amber `stale` state with label "Re-verify — Figma disconnected" replaces the now-misleading `(figma-api)` / `(figma-oauth)` source suffix. Cached image stays usable for tests; user re-verifies per row to learn whether the file is still reachable via the service-PAT path.

= 1.0.3 =
Feedback storage moved to the SaaS + monitor-list compliance and i18n fixes.

* **"How was this test?" feedback now stored on the QAProof SaaS, not in `wp_options`.** Each submission goes straight to `api.qaproof.io/api/feedback` (blocking 5-second request) and the response is surfaced to the user — success shows the thank-you card, errors render an inline message and let the user retry instead of silently pretending the rating saved. The previous local `qaproof_feedback_log` ring buffer is gone. No new data is collected — only what the in-admin widget already submitted (rating, optional comment, test type / page URL / score, WP user id, site URL).
* **Privacy hooks updated** to reflect that feedback no longer lives on the WP site. The exporter / eraser callbacks now only cover `qaproof_notify_email`; SaaS-side feedback erasure is documented as a `support@qaproof.io` request. The privacy-policy boilerplate (`wp_add_privacy_policy_content`) now discloses the SaaS feedback flow explicitly.
* **Monitor list: removed cross-origin favicon fetch.** The previous favicon was loaded from each monitored site's own `/favicon.ico`, which leaked the admin's IP + User-Agent to every monitored domain and tripped the wp.org plugin-check guideline that the 1.0.1 compliance pass was specifically about (commit `0e56a29` had already removed the equivalent Google s2 favicons fetch for the same reason). The badge now renders just the data-initial letter via the existing `:has()` CSS fallback.
* **Monitor list: instant Run feedback is now localised.** Synchronous-on-click "⟳ Running" label uses the new `monitorBtnRunning` i18n key. The rollback path also localises the "Set Up" label (previously hard-coded English). The button-state class swap on click now clears all sibling state classes (`setup` / `active` / `paused`) so you can no longer end up with two competing states on the same button.

= 1.0.2 =
Bug-fix and polish release on top of the 1.0.1 compliance round.

* **Tests now complete and save to history after audit-pass regressions.** A defensive transient gate added on `/poll-job`, `/job-screenshots`, and `/cancel-job` could return 403 when the transient was evicted (object-cache flush, replication lag), making finished tests appear stuck on the final step and never save to history. The SaaS workspace-scoped API key is the authoritative gate; the extra layer cost more in stuck-job UX than it bought.
* **DELETE / PUT method tunneling.** Restrictive hosts (mod_security, certain WAF rules) block PUT and DELETE at the server level. Those verbs are now tunneled through POST via `X-HTTP-Method-Override`, so monitor edits / deletes and job cancels work everywhere WordPress runs.
* **Monitor list: instant feedback on Run.** The running state (button label, card gradient stripe + pulse) now applies synchronously on click instead of waiting 2–3 s for the POST round-trip. Failed runs roll back cleanly.
* **Monitor list: site favicon restored.** Loaded directly from each monitored site's own `/favicon.ico` (no third-party service introduced).
* **Design Audit tab enabled** — `coming-soon` wrap removed; the existing implementation is now reachable from the Tests page.
* **Admin notices restyled and re-anchored.** Notices now render outside the custom plugin headers instead of overlapping them; colours tightened to match the rest of the admin UI.
* **Elements-cache key collision fix.** The per-design elements cache was keyed by base64 byte length, so two unrelated designs of identical byte size could share state. Key is now derived from `designId + figmaLastModified` (or a content fingerprint when unavailable).
* **Build pipeline** ships the canonical `qaproof.zip` (versionless — required for the GitHub `/latest/download/` link the frontend hard-codes) plus a `qaproof-<version>.zip` sanity copy.
* **README cleanup.** Removed stale references to the self-hosted update flow (`Update URI`, the deleted `class-updater`, the old `wordpress-updates.js` manifest).

= 1.0.1 =
Compliance, transparency, and hardening round for the WordPress.org plugin review. No functional changes.

* **External Services disclosure.** The `== External Services ==` section in readme.txt now enumerates every endpoint the plugin calls on api.qaproof.io (including `/api/compare`, `/api/jobs`, `/api/send-report-email`, `/api/history*`, `/api/results/*/approve`, `/api/figma-oauth/*`, `/api/baselines*`, `/api/monitors*`, `/api/me`, `/api/health`), the exact data sent in each request, and links to the Terms of Service and Privacy Policy for QAProof and Figma.
* **PHP limit raises tightened.** Replaced direct `ini_set('memory_limit', ...)` in the screenshot fetcher with WordPress's `wp_raise_memory_limit('image')`. `set_time_limit` in the scheduled-monitor cron handler is documented and remains gated on `function_exists` + `disable_functions` allow-list; it never runs outside the cron context.
* **Settings tab navigation.** `?tab=` / `?subtab=` URL params now go through an explicit allow-list before reaching the template; capability gate retained.
* **Vendor script handles namespaced.** Bundled Chart.js / jsPDF / jsPDF-AutoTable now enqueue under `qaproof-chartjs`, `qaproof-jspdf`, `qaproof-jspdf-autotable` handles so they can't collide with other plugins shipping different versions of the same library.
* **Non-minified vendor sources shipped** alongside the minified ones (chart.umd.js / jspdf.umd.js / jspdf.plugin.autotable.js) per the wp.org "human-readable source" guideline.
* **Dead code removed.** Three legacy CRUD classes (Monitor, Result, TestHistory) that no longer ran (replaced by the SaaS API) were deleted along with their `CREATE TABLE` statements. Fresh installs no longer add empty custom tables; existing installs upgrading from older versions still get their data migrated to the API on first run.
* **Debug log spam removed.** Non-essential `console.log` calls stripped from the bundled JS modules. `console.warn` / `console.error` retained only on genuine failure paths.
* **Line endings normalised.** Plugin PHP and JS files saved with LF endings; vendor files left as upstream ships them.
* **XSS defence-in-depth.** Every interpolation of an API-returned string into innerHTML now passes through `Q.escapeHtml()` at the call site — even where the field is server-typed today, on the assumption that any future shape drift must not become an XSS path. Affected paths: monitor list error banner, monitor delete toast, monitor run failure toast, send-email-report result, baseline-captured toast, regression-completed toast.
* **Transient cache key.** Monitor results page cache now uses a dedicated prefixed helper (`cache_key_results_page`) so the full transient name is obviously namespaced for static analysers.
* **Compatibility headers.** `Tested up to: 7.0`.

= 1.0.0 =
* Initial public release.
* Design fidelity comparison (Figma vs live page).
* Responsive testing across desktop, tablet, mobile.
* Accessibility audit (WCAG 2.1 A / AA / AAA).
* Visual regression monitoring (daily / weekly / monthly).
* Design audit (token extraction + design debt score).
* Figma OAuth 2.0 connection (alternative to per-file sharing with figma@qaproof.io).
* PDF report export.
* Email notificat