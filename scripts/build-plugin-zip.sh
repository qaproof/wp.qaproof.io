#!/usr/bin/env bash
#
# Build a clean, distributable ZIP of the QAProof WordPress plugin.
#
# Strips dev-only files (.git, .github, build scripts, OS junk) and produces
# qaproof-<version>.zip with a top-level `qaproof/` folder — the structure
# WordPress expects when an admin uploads a plugin manually OR when our
# self-hosted updater pulls a new version.
#
# Usage:
#   ./scripts/build-plugin-zip.sh                  # auto-detect version from header
#   ./scripts/build-plugin-zip.sh --output /tmp    # custom output dir
#
# After building, attach the ZIP to a GitHub release whose tag matches
# the version (e.g. v1.0.0). Our update manifest endpoint's download_url
# points at GitHub release assets — see api/src/routes/wordpress-updates.js.
#
set -euo pipefail

# Resolve repo root regardless of where script is run from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/qaproof"

# Output dir defaults to /tmp so we don't pollute the repo.
OUTPUT_DIR="/tmp"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) OUTPUT_DIR="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# Extract version from plugin header. Single source of truth.
VERSION=$(grep -E '^ \* Version:' "$PLUGIN_DIR/qaproof.php" | head -1 | sed -E 's/.*Version: *([0-9]+\.[0-9]+\.[0-9]+).*/\1/')
if [[ -z "$VERSION" ]]; then
  echo "✗ Could not parse Version from $PLUGIN_DIR/qaproof.php" >&2
  exit 1
fi

ZIP_NAME="qaproof-${VERSION}.zip"
ZIP_PATH="$OUTPUT_DIR/$ZIP_NAME"

echo "Building $ZIP_NAME from $PLUGIN_DIR ..."

# Stage the plugin in a tmpdir so we can strip files without touching the repo.
STAGE_DIR=$(mktemp -d -t qaproof-build-XXXXXX)
trap "rm -rf $STAGE_DIR" EXIT

# rsync with explicit excludes — everything we don't want shipping to WP sites.
# Belt-and-suspenders against accidental dev-file leaks.
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.github/' \
  --exclude '.gitignore' \
  --exclude '.gitattributes' \
  --exclude '.gitkeep' \
  --exclude '.editorconfig' \
  --exclude '.eslintrc*' \
  --exclude '.prettierrc*' \
  --exclude '.stylelintrc*' \
  --exclude '.vscode/' \
  --exclude '.idea/' \
  --exclude '.DS_Store' \
  --exclude 'Thumbs.db' \
  --exclude '*.swp' \
  --exclude '*.swo' \
  --exclude '*.bak' \
  --exclude '*.orig' \
  --exclude '*.log' \
  --exclude 'node_modules/' \
  --exclude 'tests/' \
  --exclude 'phpunit.xml*' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  --exclude 'composer.json' \
  --exclude 'composer.lock' \
  --exclude '/vendor/' \
  --exclude '*.map' \
  "$PLUGIN_DIR/" "$STAGE_DIR/qaproof/"

# Remove any leftover empty dirs created by the excludes.
find "$STAGE_DIR" -type d -empty -delete

# Final sanity check — required WP-compliance files must be present.
for f in qaproof.php readme.txt uninstall.php; do
  if [[ ! -f "$STAGE_DIR/qaproof/$f" ]]; then
    echo "✗ Missing required file in staged build: qaproof/$f" >&2
    exit 1
  fi
done

# Hunt for accidentally-shipped secrets. Catches the obvious cases: AWS keys,
# common API token formats, and our own service tokens. The check is best-
# effort; a determined leak still needs human review of the diff.
echo "Scanning staged build for accidentally-leaked secrets ..."
SCAN_HITS=$(grep -rE 'AKIA[0-9A-Z]{16}|sk-ant-[A-Za-z0-9_-]{20,}|figd_[A-Za-z0-9_-]{30,}|xkeysib-[A-Za-z0-9]{20,}' "$STAGE_DIR/qaproof/" || true)
if [[ -n "$SCAN_HITS" ]]; then
  echo "✗ Suspected secrets detected in build — aborting:" >&2
  echo "$SCAN_HITS" >&2
  exit 1
fi

# Build ZIP. -X strips macOS extended attrs (those weird __MACOSX folders).
rm -f "$ZIP_PATH"
(cd "$STAGE_DIR" && zip -rq -X "$ZIP_PATH" qaproof)

# Final report.
SIZE_BYTES=$(stat -f%z "$ZIP_PATH" 2>/dev/null || stat -c%s "$ZIP_PATH")
SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $SIZE_BYTES / 1024 / 1024}")
FILE_COUNT=$(unzip -l "$ZIP_PATH" | tail -1 | awk '{print $2}')

echo ""
echo "✓ Built $ZIP_NAME"
echo "  size:  ${SIZE_MB} MB"
echo "  files: $FILE_COUNT"
echo "  path:  $ZIP_PATH"
echo ""
echo "Next:"
echo "  gh release create v${VERSION} \"$ZIP_PATH\" --title \"v${VERSION}\" --notes-from-tag --repo qaproof/wp.qaproof.io"
