# Directory listing translations

This directory is **not packaged**. `scripts/build-plugin-zip.sh` only ever
reads `qaproof/`, so nothing here ships to wordpress.org inside the ZIP.

## Why the readme is translated and the UI is not

wordpress.org's plugin search matches against the **translated readme** for
the visitor's locale, not the plugin's interface. An Italian reader searching
`accessibilità` sees a directory with roughly four results; the same search in
English returns thousands. The readme is therefore the whole discovery lever,
and it is independent of the plugin's own strings.

The interface is a separate problem and a larger one: 679 PHP strings are
wrapped in `__()`, but the admin UI is JavaScript and **none of its strings
are translatable at all** — there is no `wp_set_script_translations()` call
and no `wp.i18n` usage anywhere in `admin/js/`. Translating the UI today would
produce an Italian menu wrapped around an English product. That work belongs
after the first Italian install, not before it.

`qaproof/languages/qaproof.pot` is also stale — generated 2026-04-17 and
stamped `Project-Id-Version: QAProof 1.2.26`, a version this plugin has never
had. Regenerate it before anyone translates the UI.

## readme-it.po

A complete Italian translation of all 163 strings of the **Stable Readme**
project, built against the live GlotPress export so every `msgid` matches
exactly and the file imports without manual matching.

Checked before committing: `msgfmt --check-format` passes, all 163 entries are
non-empty, and every entry carries the same HTML tags in the same order as its
source (GlotPress rejects a translation whose tags differ).

Feature names (`Site Audit`, `Design Fidelity`) and button labels
(`Check my site`) are deliberately left in English — the interface still shows
them in English, and translating them here would send a reader looking for a
button that does not exist.

### Importing it

Needs a wordpress.org login with Plugin Translation Editor rights for Italian
on this plugin. Requesting PTE is a post in `#polyglots` on Make WordPress
Slack naming the plugin and the locale.

1. https://translate.wordpress.org/projects/wp-plugins/qaproof/stable-readme/it/default/
2. **Import translations** → upload `readme-it.po`
3. Repeat on `dev-readme` (same strings; the two projects are separate)

Translations become visible on the Italian directory listing after the next
sync, typically within a day.
