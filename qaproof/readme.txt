=== QAProof ===
Contributors: qaproof
Tags: design qa, figma, responsive, accessibility, visual regression
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Compare live pages against Figma, audit accessibility (WCAG 2.1), detect visual regressions, and analyze responsive behavior — powered by AI vision.

== Description ==

QAProof helps WordPress site owners and developers catch visual bugs before users do. It pairs Playwright-rendered screenshots of your live pages with AI vision analysis to find design drift, accessibility issues, and responsive breakage automatically.

Five test types, one workflow:

* **Design Fidelity** — Compares your live page against a Figma design (or any image you upload) and reports layout drift, color mismatches, typography differences, spacing issues, and component variations with severity ratings and pixel-coordinate markers.
* **Responsive Testing** — Renders the page at desktop, tablet, and mobile viewports and analyzes how the layout adapts. Flags overflow, broken stacks, illegible text, missing media-query rules.
* **Accessibility Audit** — WCAG 2.1 Level A / AA / AAA compliance check. Covers color contrast, focus indicators, heading hierarchy, form labels, ARIA misuse, touch-target sizes, and more, with the WCAG criterion referenced for each violation.
* **Visual Regression Monitoring** — Scheduled screenshot diffing. Captures a baseline of a page, then re-shoots on a daily / weekly / monthly schedule and alerts you if anything changed (broken CSS deploy, missing image, accidental layout shift). Email + in-admin notifications when scores drop below your threshold.
* **Design Audit** — Extracts your live design tokens (colors, fonts, spacing, components) and grades your design system's internal consistency on a Design Debt Score.

**How it works:** QAProof is a thin WordPress plugin that talks to a hosted SaaS API (api.qaproof.io). The API runs the headless browser, calls the AI vision model, and returns structured reports. You need a QAProof account and API key — sign up free at https://qaproof.io.

**Why a SaaS backend?** Running Playwright + Anthropic Claude Vision in a WordPress request would crash most hosts (Chromium binary alone is 300 MB, image analysis runs 10–60 s). Doing it server-side keeps your hosting fast and lets us batch / cache / dedupe expensive operations.

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

For each test, the plugin sends the page URL, the design source (Figma URL OR uploaded image bytes), and a few render options (viewport sizes, WCAG level). The API renders the page in a headless browser, captures screenshots, calls Anthropic Claude Vision, and returns a structured report. See "External Services" below for the full list.

= Where are test results stored? =

In two places: (1) on the QAProof SaaS database, scoped to your workspace; (2) optionally in a local WordPress table (`{prefix}qaproof_test_history`) so the in-admin history page works offline.

= Can I self-host the backend? =

Not at the moment. The plugin is open-source under GPL-2.0+, but the API server is closed-source SaaS. If self-hosting matters for your use case, write to support@qaproof.io.

= Does the plugin work on a Multisite network? =

Yes, with per-site configuration. The plugin can be network-activated, but each site in the network configures its own QAProof API key and Figma connection independently via that site's **QAProof → Settings**. Test results, monitors, and history are also scoped per-site. The plugin does not currently support a single shared API key at the network level.

= How long does a test take? =

15–30 seconds for Design Fidelity, 1–2 minutes for Responsive (3 viewports), 2–5 minutes for Accessibility audits on complex pages.

= What happens if my API key is missing or wrong? =

The plugin renders a clear error in the test UI. No test is run, nothing is sent. You can re-paste the key any time in Settings → API.

== External Services ==

QAProof is a SaaS-backed plugin. All test execution happens on the QAProof API, which in turn calls Anthropic's Claude Vision API for image analysis. The plugin itself does NOT call Anthropic directly.

**Service: QAProof API (https://api.qaproof.io)**

When you click "Run test", the plugin sends:

* The **page URL** you are testing (so the API can render it in a headless browser).
* The **design source** — either a Figma URL or the uploaded image bytes (base64).
* **Test options** — viewport sizes, WCAG conformance level, whether to ignore text differences.
* Your **API key** (in the `Authorization: Bearer ...` header) so the API can authenticate the request.

The API responds with a structured JSON report containing: test score, category breakdown, identified differences, recommended fixes, and screenshot URLs / base64-encoded thumbnails.

When you click "Connect Figma" the plugin starts an OAuth 2.0 flow with the QAProof API; the API exchanges the authorization code with Figma and stores the resulting access tokens server-side, scoped to your workspace. The plugin never sees the tokens themselves.

Scheduled monitors fire WordPress cron events that call the same API endpoints on the schedule you configure (daily / weekly / monthly).

* QAProof Terms of Service: https://qaproof.io/terms
* QAProof Privacy Policy: https://qaproof.io/privacy

**Service: Anthropic Claude (https://www.anthropic.com)**

The QAProof API calls Anthropic Claude Vision to analyze rendered screenshots. The plugin does NOT contact Anthropic directly — all calls go through the QAProof API. Image bytes sent to Anthropic by the API are not retained after the analysis completes (per the QAProof Privacy Policy).

* Anthropic Terms of Service: https://www.anthropic.com/legal/commercial-terms
* Anthropic Privacy Policy: https://www.anthropic.com/legal/privacy

**Service: Figma (https://www.figma.com) — optional**

If you connect your Figma account via OAuth, the QAProof API reads the specific Figma files you submit for testing (via their URL) so it can export the design as a PNG image. The API does not browse, list, or enumerate your Figma workspace; it only fetches the files you point it at.

* Figma Terms of Service: https://www.figma.com/legal/tos/
* Figma Privacy Policy: https://www.figma.com/legal/privacy/

**Trademarks**

QAProof is an independent product. It is not affiliated with, endorsed by, or sponsored by Figma, Inc., Anthropic PBC, or Automattic Inc. "Figma" is a trademark of Figma, Inc. "Claude" is a trademark of Anthropic PBC. "WordPress" is a trademark of the WordPress Foundation.

== Privacy ==

The plugin stores the following data on your WordPress site:

* Your QAProof API key (in `wp_options`, non-autoloaded, never displayed unmasked in the UI).
* Saved design configurations (page URL, Figma URL, optional cached design image) in `wp_options`.
* Test history rows in a custom table `{prefix}qaproof_test_history` (test type, page URL, score, summary, JSON result, timestamp).
* Monitor definitions and run results in `{prefix}qaproof_monitors` and `{prefix}qaproof_monitor_results`.
* Notification recipient email (defaults to admin email; configurable per monitor).

The plugin exposes WordPress's built-in personal-data exporter and eraser hooks for the notification email field, so administrators can comply with right-to-access / right-to-erasure requests via the standard **Tools → Export Personal Data** / **Erase Personal Data** screens.

No tracking pixels, analytics, or third-party scripts run on the front-end of your site. All plugin assets (CSS, JS, fonts) are bundled locally — nothing is loaded from external CDNs.

== Screenshots ==

1. Dashboard — recent test results and quick-launch tiles.
2. Design Fidelity test — Figma vs live page side-by-side with severity-tagged markers.
3. Responsive test — desktop / tablet / mobile viewports analyzed in one run.
4. Accessibility audit — WCAG violations grouped by category with criterion references.
5. Visual Regression monitor — scheduled baseline diffing with email alerts.
6. Settings — API key, saved designs, Figma OAuth connection.

== Changelog ==

= 1.0.0 =
* Initial public release.
* Design fidelity comparison (Figma vs live page).
* Responsive testing across desktop, tablet, mobile.
* Accessibility audit (WCAG 2.1 A / AA / AAA).
* Visual regression monitoring (daily / weekly / monthly).
* Design audit (token extraction + design debt score).
* Figma OAuth 2.0 connection (alternative to per-file sharing with figma@qaproof.io).
* PDF report export.
* Email notifications + admin badge for regressions.
* Multisite-compatible (per-site configuration).
* Self-hosted assets (no external CDN dependencies).

== Upgrade Notice ==

= 1.0.0 =
Initial release.
