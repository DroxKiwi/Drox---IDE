#!/usr/bin/env bash
# Verify Linux F1 package (IDE binary + bundled engine).
# Usage: ./scripts/verify-packaged-linux.sh [../VSCode-linux-x64]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGED_DIR="${1:-$(cd "$REPO_ROOT/.." && pwd)/VSCode-linux-x64}"

fail() {
	echo "[verify-packaged-linux] ERROR: $*" >&2
	exit 1
}

[[ -d "$PACKAGED_DIR" ]] || fail "Directory not found: $PACKAGED_DIR"

IDE_BIN="$PACKAGED_DIR/drox-ide"
[[ -x "$IDE_BIN" ]] || fail "Main binary not found: $IDE_BIN"

DROX_CANDIDATES=(
	"$PACKAGED_DIR/resources/drox/linux-x64/drox"
	"$PACKAGED_DIR/resources/app/resources/drox/linux-x64/drox"
)
DROX_BIN=''
for c in "${DROX_CANDIDATES[@]}"; do
	if [[ -x "$c" ]]; then
		DROX_BIN="$c"
		break
	fi
done
[[ -n "$DROX_BIN" ]] || fail "bundled drox not found under resources/drox/linux-x64/"

PRODUCT_JSON="$PACKAGED_DIR/resources/app/product.json"
if [[ -f "$PRODUCT_JSON" ]]; then
	DROX_VER="$(node "$SCRIPT_DIR/lib/drox-release-manifest.mjs" version)"
	PKG_VER="$(node -e "const p=require('$PRODUCT_JSON'); console.log(p.droxVersion||'')" )"
	if [[ -n "$PKG_VER" && "$PKG_VER" != "$DROX_VER" ]]; then
		fail "product.json droxVersion=$PKG_VER != package.json $DROX_VER"
	fi
	if grep -q 'droxEngineDevBuild' "$PRODUCT_JSON" 2>/dev/null; then
		fail 'product.json contains droxEngineDevBuild (rebuild with DROX_PRODUCT_SURFACE=release)'
	fi
	GALLERY_URL="$(node -e "const p=require('$PRODUCT_JSON'); console.log((p.extensionsGallery&&p.extensionsGallery.serviceUrl)||'')" )"
	if [[ -z "$GALLERY_URL" ]]; then
		fail 'product.json missing extensionsGallery.serviceUrl (run merge-product-gallery)'
	fi
	if [[ "$GALLERY_URL" != *open-vsx.org* ]]; then
		fail "product.json extensionsGallery.serviceUrl unexpected: $GALLERY_URL"
	fi
fi

# Moteur TUI 1.5+ : recherche binaire directe (strings|grep echoue sur lignes tres longues).
if ! grep -aqF 'tui_mono' "$DROX_BIN" 2>/dev/null; then
	fail "bundled drox does not look like TUI 1.5+: $DROX_BIN"
fi
if grep -aqF 'orchestration role_split' "$DROX_BIN" 2>/dev/null; then
	fail "bundled drox still contains legacy role_split rail: $DROX_BIN"
fi

echo "[verify-packaged-linux] OK - $IDE_BIN + $DROX_BIN"
