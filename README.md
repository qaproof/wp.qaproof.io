# QAProof — WordPress Plugin

[![License: GPL v2+](https://img.shields.io/badge/License-GPL%20v2+-blue.svg)](https://www.gnu.org/licenses/gpl-2.0)
[![Tested up to](https://img.shields.io/badge/WordPress-6.7-21759b.svg)](https://wordpress.org)
[![PHP](https://img.shields.io/badge/PHP-8.0+-777BB4.svg)](https://www.php.net)

Automated design quality assurance for WordPress. Compare live pages against Figma designs, audit accessibility, detect visual regressions, and analyze responsive behavior — powered by AI vision.

QAProof is a [SaaS-backed](https://qaproof.io) plugin: the WordPress side handles the admin UI and integrates with WP-Cron + the WordPress REST API; the actual screenshot capture, AI analysis, and result generation happen on the QAProof API (`api.qaproof.io`). You need a free QAProof account to use the plugin.

## What's in this repo

```
wp.qaproof.io/
├── qaproof/                ← The plugin itself. Everything in this folder
│                             gets zipped and shipped to WordPress sites.
│   ├── qaproof.php           Plugin bootstrap (headers, includes, hooks)
│   ├── readme.txt            wordpress.org-format readme
│   ├── uninstall.php         Cleanup on plugin deletion
│   ├── includes/             PHP service classes (API client, settings, DB, etc.)
│   ├── admin/                Admin pages, REST proxies, partials
│   │   ├── js/modules/       Frontend JS modules
│   │   ├── js/vendor/        Bundled third-party libs (Chart.js, jsPDF — MIT)
│   │   ├── css/partials/     CSS modules (Sass-free, no build step)
│   │   ├── fonts/            Self-hosted Kodchasan + Montserrat (OFL)
│   │   └── partials/         PHP template partials
│   ├── languages/            Translation template (.pot)
│   └── THIRD-PARTY-NOTICES.txt
└── scripts/
    └── build-plugin-zip.sh   Release tool. Creates a clean ZIP of qaproof/
                              with secret-scan + dev-file stripping.
```

## Install

**End users** — get the plugin from your WordPress admin:

> Plugins → Add New → search "QAProof" → Install Now → Activate

Or download the ZIP directly from [GitHub Releases](https://github.com/qaproof/wp.qaproof.io/releases/latest/download/qaproof.zip) and upload via **Plugins → Add New → Upload Plugin**.

After activation, paste your API key in **QAProof → Settings → API**. Get a key (free) at [qaproof.io](https://qaproof.io).

## Develop

```bash
# Clone alongside a WordPress install
git clone https://github.com/qaproof/wp.qaproof.io.git
ln -s "$(pwd)/wp.qaproof.io/qaproof" /path/to/wordpress/wp-content/plugins/qaproof
```

The plugin has no build step — PHP runs directly, CSS partials are enqueued individually, JS modules load in dependency order. Edit and refresh.

## Release

See the [plugin release procedure](#release) docs.

Quick version:

```bash
# 1. Bump Version: in qaproof/qaproof.php + Stable tag: in qaproof/readme.txt
# 2. Build:
./scripts/build-plugin-zip.sh
# 3. Publish to GitHub Releases:
gh release create vX.Y.Z /tmp/qaproof-X.Y.Z.zip --title "vX.Y.Z" --notes "..."
# 4. Bump version + download_url in api/src/routes/wordpress-updates.js (api repo) + push
```

Sites that installed via Upload Plugin auto-update through our [self-hosted update channel](qaproof/includes/class-updater.php) (Update URI header → `api.qaproof.io/api/wordpress/qaproof` manifest). Sites that installed via wordpress.org auto-update through the canonical wp.org channel.

## License

GPL-2.0-or-later. See [LICENSE](https://www.gnu.org/licenses/gpl-2.0.html) and [qaproof/THIRD-PARTY-NOTICES.txt](qaproof/THIRD-PARTY-NOTICES.txt) for bundled-asset attribution.

## Support

Issues + feature requests — [GitHub Issues](https://github.com/qaproof/wp.qaproof.io/issues).
Account / billing / API support — [qaproof.io/support](https://qaproof.io/support).
