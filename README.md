# QAProof — WordPress Plugin

[![License: GPL v2+](https://img.shields.io/badge/License-GPL%20v2+-blue.svg)](https://www.gnu.org/licenses/gpl-2.0)
[![Tested up to](https://img.shields.io/badge/WordPress-7.1-21759b.svg)](https://wordpress.org)
[![PHP](https://img.shields.io/badge/PHP-8.0+-777BB4.svg)](https://www.php.net)

Automated design quality assurance for WordPress. Compare live pages against
Figma designs, audit accessibility, detect visual regressions, and analyze
responsive behavior — powered by AI vision.

QAProof is a [SaaS-backed](https://qaproof.io) plugin: WordPress handles the
admin UI (WP-Cron + REST API), while screenshot capture, AI analysis, and
result generation run on the QAProof API. A free QAProof account is required.

## Install

**From WordPress admin:** Plugins → Add New → search "QAProof" → Install → Activate.

**Or manually:** download the [latest release ZIP](https://github.com/qaproof/wp.qaproof.io/releases/latest/download/qaproof.zip)
and upload via Plugins → Add New → Upload Plugin.

After activation, add your API key in **QAProof → Settings → API**
(get one free at [qaproof.io](https://qaproof.io)).

## Develop

The shippable plugin lives in `qaproof/`. No build step — PHP runs directly,
CSS/JS load individually. Symlink it into a WordPress install and refresh:

```bash
git clone https://github.com/qaproof/wp.qaproof.io.git
ln -s "$(pwd)/wp.qaproof.io/qaproof" /path/to/wordpress/wp-content/plugins/qaproof
```

## License

GPL-2.0-or-later. See [LICENSE](https://www.gnu.org/licenses/gpl-2.0.html) and
[qaproof/THIRD-PARTY-NOTICES.txt](qaproof/THIRD-PARTY-NOTICES.txt) for
bundled-asset attribution.

## Support

Bugs & feature requests — [GitHub Issues](https://github.com/qaproof/wp.qaproof.io/issues).
Account / billing / API — [qaproof.io/support](https://qaproof.io/support).
