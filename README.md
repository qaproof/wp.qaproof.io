# QAProof — WordPress Plugin

[![License: GPL v2+](https://img.shields.io/badge/License-GPL%20v2+-blue.svg)](https://www.gnu.org/licenses/gpl-2.0)
[![Tested up to](https://img.shields.io/badge/WordPress-7.1-21759b.svg)](https://wordpress.org)
[![PHP](https://img.shields.io/badge/PHP-8.0+-777BB4.svg)](https://www.php.net)

Automated design quality assurance for WordPress. Compare live pages against
Figma designs, audit accessibility, detect visual regressions, and analyze
responsive behavior — powered by AI vision.

QAProof is a [SaaS-backed](https://qaproof.io) plugin: WordPress handles the
admin UI (REST API; monitors are scheduled server-side), while screenshot
capture, AI analysis, and result generation run on the QAProof API. A free QAProof account is required.

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
Account / billing / API — [qaproof.io/help-center](https://qaproof.io/help-center).

## Release

Releases are automated — no SVN client and no manual steps.

```bash
git tag v1.0.34 && git push origin v1.0.34
```

That triggers `.github/workflows/release.yml`, which:

1. checks the plugin header version, the readme `Stable tag` and the tag all
   agree, and that the changelog has an entry for that version;
2. lints every PHP file;
3. checks all twelve wordpress.org listing assets are present in
   `.wordpress-org/` — that directory is synced wholesale, so a file missing
   here is a file **deleted** from the public listing;
4. builds the plugin with `scripts/build-plugin-zip.sh` (one definition of what
   ships, used for both the SVN tree and the ZIP);
5. publishes to wordpress.org and creates the GitHub release with
   `qaproof.zip` — the exact filename the site's download button links to.

Run it with **Actions → Release → Run workflow** to build and check without
publishing anything.

### One-time setup

Add two repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `WPORG_SVN_USERNAME` | the wordpress.org account with commit rights on the `qaproof` plugin |
| `WPORG_SVN_PASSWORD` | that account's password |

Until they exist the wordpress.org step is skipped with a warning rather than
failing, so the GitHub release and the download link keep working.
