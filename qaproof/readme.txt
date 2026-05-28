=== QAProof ===
Contributors: qaproof
Tags: design qa, responsive, accessibility, visual regression, wcag
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 8.0
Stable tag: 1.0.6
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

QAProof is a SaaS-backed plugin. All test execution happens on the QAProof API server, which in turn calls an AI vision model and (optionally) Figma's API. The WordPress plugin itself only contacts the QAProof API — it never calls the AI provider or Figma directly.

= Service: QAProof API =

**URL:** https://api.qaproof.io

**When it is called:** whenever a test is run (manually or via scheduled monitor), when screenshots or results are fetched, when monitors or baselines are managed, and when account/connection status is checked in Settings.

**Data sent:** the URL of the page being tested, the test type, and — only when relevant — a design image or Figma file URL supplied by the user. The plugin also sends an email address when the user requests an emailed PDF report. No post content, visitor data, passwords, or cookies are ever transmitted.

Every request is authenticated with your QAProof API key sent as a Bearer token over HTTPS.

QAProof Terms of Service: https://qaproof.io/terms
QAProof Privacy Policy: https://qaproof.io/privacy

= Service: Figma (via QAProof API) =

If you connect a Figma account or provide a Figma URL, the QAProof API fetches the relevant design file from Figma on your behalf. The WordPress plugin never contacts Figma directly.

Figma Terms of Service: https://www.figma.com/legal/tos/
Figma Privacy Policy: https://www.figma.com/legal/privacy/

= Trademarks =

QAProof is an independent product. It is not affiliated with, endorsed by, or sponsored by Figma, Inc., or Automattic Inc. "Figma" is a trademark of Figma, Inc. "WordPress" is a trademark of the WordPress Foundation.

== Privacy ==

**Where test data lives.** All test results, monitor definitions, and visual regression baselines are stored on the QAProof SaaS, scoped to your workspace. The plugin stores only configuration locally (API key, notification preferences, saved design URLs). No custom database tables are created on fresh installs.

**Locally-stored data.** The plugin saves your API key, notification email, notification preferences, and optionally a cached design image to `wp_options`. Your theme preference and a small UI cache are stored in browser `localStorage`. No visitor data, post content, or cookies are ever stored locally or transmitted.

**WordPress privacy tools.** The plugin supports WordPress's built-in Export Personal Data and Erase Personal Data tools, covering the notification email stored on this site. To delete data on the QAProof SaaS (test history, monitor results, account), contact support@qaproof.io.

**Where data is processed.** The QAProof API is hosted in the United States. For EU-based site owners this constitutes a GDPR international transfer — see the QAProof Privacy Policy at https://qaproof.io/privacy for details.

**Privacy Policy helper.** The plugin contributes suggested copy to your site's Privacy Policy via WordPress's `wp_add_privacy_policy_content()`. Visit **Settings → Privacy → Policy guide** to review and merge it.

**No analytics, no tracking.** No tracking pixels, fingerprinting, or third-party scripts run on the front-end of your site. All plugin assets are bundled locally.

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