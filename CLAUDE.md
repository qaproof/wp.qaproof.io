# CLAUDE.md — QAProof WordPress plugin

> **Before stating anything about the business — revenue, users, traffic, ads,
> the plugin's standing — read `../api.qaproof.io/STATE.md`.** It holds every
> verified number with the date and the method used to check it, plus a list
> of claims Claude has previously got wrong. Do not answer from memory.

## What this is

The WordPress plugin, published on wordpress.org as slug `qaproof`. WordPress
provides the admin UI; every screenshot, audit and AI analysis runs on
`api.qaproof.io`. See that repo's CLAUDE.md for the backend.

## Releasing

Tag `v<version>` and push it. `.github/workflows/release.yml` verifies, builds
via `scripts/build-plugin-zip.sh`, publishes to the wordpress.org SVN trunk and
creates the GitHub release. The asset must stay named `qaproof.zip` — the
frontend's download link hard-codes it.

Bump BOTH `Version:` in `qaproof.php` and `Stable tag:` in `readme.txt`, and
keep the plugin header name identical to the readme's `=== title ===`; a
mismatch is a Plugin Check warning (this bit us in 1.0.39).

The build's sanity check requires `qaproof.php`, `readme.txt`, `uninstall.php`,
`LICENSE` and `THIRD-PARTY-NOTICES.txt` to be present, and fails otherwise.

## Gotchas that have cost real debugging time

- **`QAPROOF_API_ENDPOINT` is a PHP constant, not an env var.** Setting an env
  var in docker-compose does NOT redirect the plugin — it silently calls
  production. Define the constant in `wp-config.php` instead.
- WordPress renders `add_settings_error()` automatically **only on
  options-*.php screens**. Our settings page is a top-level `admin.php?page=`
  screen, so `settings_errors()` must be called by hand — without it a
  mistyped API key was rejected in complete silence (fixed in 1.0.40).
- Every admin page must be in the `$our_pages` allowlist in
  `admin/class-admin-assets.php` or it renders with no CSS and no JS.
- WordPress without pretty permalinks uses `?rest_route=`, so appending
  `?limit=10` makes a double `?`. Detect the existing one and use `&`.
- `WP_REST_Response` cannot carry binary — PDFs are echoed directly, with a
  `phpcs:ignore` for the escaping rule.

## Claims discipline

This plugin's own readme tells readers to be sceptical of any tool offering a
compliance certificate. It must hold itself to that: no "verified" seal, no
implied conformance, and the readme must not contradict
`includes/class-privacy.php` about what leaves the user's site.
