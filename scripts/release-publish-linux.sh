#!/usr/bin/env bash
# Publish Linux .deb manifest entry to Drox---IDE---OR (merge linux-x64 into latest.json).
#
# Prerequisite: ./scripts/build-release-linux.sh
#
# Usage:
#   ./scripts/release-publish-linux.sh
#   ./scripts/release-publish-linux.sh --dry-run
#   ./scripts/release-publish-linux.sh --deb /path/to/package.deb

set -euo pipefail

DRY_RUN=0
DEB_FILE=''
GITHUB_ORG='DroxKiwi'
GITHUB_REPO='Drox---IDE---OR'

while [[ $# -gt 0 ]]; do
	case "$1" in
		--dry-run) DRY_RUN=1; shift ;;
		--deb) DEB_FILE="$2"; shift 2 ;;
		--org) GITHUB_ORG="$2"; shift 2 ;;
		--repo) GITHUB_REPO="$2"; shift 2 ;;
		-h|--help)
			echo "Usage: $0 [--dry-run] [--deb PATH]"
			exit 0
			;;
		*) echo "Option inconnue: $1" >&2; exit 1 ;;
	esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASES_REPO="$(cd "$REPO_ROOT/.." && pwd)/Drox---IDE---OR"
PRODUCT_VERSION="$(node "$SCRIPT_DIR/lib/drox-release-manifest.mjs" version)"
RELEASED="$(date +%Y-%m-%d)"

if [[ -z "$DEB_FILE" ]]; then
	DEB_DIR="$REPO_ROOT/.build/linux/deb/amd64/deb"
	if [[ ! -d "$DEB_DIR" ]]; then
		echo "[release-publish-linux] .deb not found - run build-release-linux.sh" >&2
		exit 1
	fi
	DEB_FILE="$(ls -t "$DEB_DIR"/*.deb 2>/dev/null | head -1)"
fi
[[ -f "$DEB_FILE" ]] || { echo "[release-publish-linux] Fichier .deb introuvable" >&2; exit 1; }

DEB_NAME="Drox-IDE-${PRODUCT_VERSION}-linux-x64.deb"
UPLOAD_DIR="$RELEASES_REPO/_upload"
DEST_DEB="$UPLOAD_DIR/$DEB_NAME"
VERSION_DIR="$RELEASES_REPO/stable/$PRODUCT_VERSION"
SHA_FILE="$VERSION_DIR/SHA256SUMS-linux-x64.txt"

HASH="$(sha256sum "$DEB_FILE" | awk '{print $1}')"
SIZE="$(stat -c%s "$DEB_FILE" 2>/dev/null || stat -f%z "$DEB_FILE")"
DOWNLOAD_BASE="https://github.com/$GITHUB_ORG/$GITHUB_REPO/releases/download/v$PRODUCT_VERSION"
INSTALLER_URL="$DOWNLOAD_BASE/$DEB_NAME"

echo "Source .deb  : $DEB_FILE"
echo "Version      : $PRODUCT_VERSION"
echo "SHA256       : $HASH"
echo "Dest repo    : $RELEASES_REPO"

if [[ "$DRY_RUN" -eq 1 ]]; then
	node "$SCRIPT_DIR/lib/drox-release-manifest.mjs" merge \
		--releases-repo "$RELEASES_REPO" \
		--version "$PRODUCT_VERSION" \
		--released "$RELEASED" \
		--platform linux-x64 \
		--installer-url "$INSTALLER_URL" \
		--sha256 "$HASH" \
		--size-bytes "$SIZE" \
		--dry-run
	exit 0
fi

mkdir -p "$UPLOAD_DIR" "$VERSION_DIR"
cp -f "$DEB_FILE" "$DEST_DEB"
echo "$HASH  $DEB_NAME" > "$SHA_FILE"

node "$SCRIPT_DIR/lib/drox-release-manifest.mjs" merge \
	--releases-repo "$RELEASES_REPO" \
	--version "$PRODUCT_VERSION" \
	--released "$RELEASED" \
	--platform linux-x64 \
	--installer-url "$INSTALLER_URL" \
	--sha256 "$HASH" \
	--size-bytes "$SIZE"

echo ""
echo "Manifest updated (linux-x64 merged into stable/latest.json)."
echo "Deb copy (gitignored): $DEST_DEB"
echo ""
echo "GitHub steps:"
echo "  1. cd \"$RELEASES_REPO\""
echo "  2. git add stable/ .gitignore NOTICE.md README.md"
echo "  3. git commit -m \"Release v$PRODUCT_VERSION linux-x64 (manifest)\""
echo "  4. git push"
echo "  5. gh release upload v$PRODUCT_VERSION \"$DEST_DEB\""
