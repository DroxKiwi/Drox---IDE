#!/usr/bin/env bash
# Build Drox IDE - packaged Linux x64 (F1) + .deb (F2-lite)
#
# Produit : ../VSCode-linux-x64/ (parent du repo)
# Usage:
#   ./scripts/build-release-linux.sh
#   ./scripts/build-release-linux.sh --skip-npm-install
#   ./scripts/build-release-linux.sh --force-compile
#
# Prerequisites: Node (.nvmrc), Rust, fakeroot, dpkg-deb, VS Code Linux deps (see GUIDE-PUBLICATION-LINUX.md)

set -euo pipefail

SKIP_NPM_INSTALL=0
SKIP_COMPILE=0
FORCE_COMPILE=0
WITH_DEB=1

while [[ $# -gt 0 ]]; do
	case "$1" in
		--skip-npm-install) SKIP_NPM_INSTALL=1; shift ;;
		--skip-compile) SKIP_COMPILE=1; shift ;;
		--force-compile) FORCE_COMPILE=1; SKIP_COMPILE=0; shift ;;
		--no-deb) WITH_DEB=0; shift ;;
		-h|--help)
			echo "Usage: $0 [--skip-npm-install] [--skip-compile] [--force-compile] [--no-deb]"
			exit 0
			;;
		*) echo "Option inconnue: $1" >&2; exit 1 ;;
	esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
	echo "[build-release-linux] Ce script doit tourner sur Linux (CI ou VM)." >&2
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/linux-npm-install.sh
source "$SCRIPT_DIR/lib/linux-npm-install.sh"
# shellcheck source=lib/linux-strip-packaged-natives.sh
source "$SCRIPT_DIR/lib/linux-strip-packaged-natives.sh"
PARENT_ROOT="$(cd "$REPO_ROOT/.." && pwd)"
OUT_DIR="$PARENT_ROOT/VSCode-linux-x64"
PRODUCT_SHORT='drox-ide'

export DROX_PRODUCT_SURFACE=release
# .npmrc cible Electron 42.3.0 ; checksums electron.txt encore en 42.2.0 (cf. drox-release.ps1)
export DROX_SKIP_ELECTRON_CHECKSUM="${DROX_SKIP_ELECTRON_CHECKSUM:-1}"

# One-time: fetch OpenSSL prebuilt for VS Code CLI (tunnel). Idempotent after first gulp compile-cli.
ensure_cli_openssl_prebuilt() {
	local openssl_lib="$REPO_ROOT/cli/openssl/package/out/x64-linux/lib"
	if [[ -d "$openssl_lib" ]]; then
		return 0
	fi
	step 'gulp compile-cli (openssl prebuilt for tunnel)'
	run_npm run gulp -- compile-cli
}

step() {
	echo ""
	echo "==> $*" 
}

run_npm() {
	(
		cd "$REPO_ROOT"
		npm "$@"
	)
}

echo "Drox IDE - build release linux-x64"
echo "Repo : $REPO_ROOT"
echo "Sortie attendue : $OUT_DIR"

if [[ "$SKIP_NPM_INSTALL" -eq 0 ]]; then
	step 'npm install'
	linux_npm_install "$REPO_ROOT"
fi

step 'package-drox (release)'
"$SCRIPT_DIR/package-drox.sh" release

# Bundle readiness : recompile if stamp missing or --force-compile
STAMP="$REPO_ROOT/out-vscode-min/drox-bundle-stamp.json"
NEEDS_COMPILE=0
if [[ "$FORCE_COMPILE" -eq 1 ]]; then
	NEEDS_COMPILE=1
elif [[ ! -f "$STAMP" ]]; then
	NEEDS_COMPILE=1
else
	DROX_VER="$(node "$SCRIPT_DIR/lib/drox-release-manifest.mjs" version)"
	STAMP_VER="$(node -e "const s=require('$STAMP'); console.log(s.droxVersion||'')" 2>/dev/null || echo '')"
	if [[ "$STAMP_VER" != "$DROX_VER" ]]; then
		echo "[build-release-linux] stamp $STAMP_VER != package droxVersion $DROX_VER"
		NEEDS_COMPILE=1
	fi
fi

if [[ "$NEEDS_COMPILE" -eq 1 ]]; then
	if [[ "$SKIP_COMPILE" -eq 1 && "$FORCE_COMPILE" -eq 0 ]]; then
		echo "[build-release-linux] Bundle stale - rerun without --skip-compile or with --force-compile" >&2
		exit 1
	fi
	step 'gulp core-ci-desktop (out-vscode-min)'
	run_npm run gulp -- core-ci-desktop
	(
		cd "$REPO_ROOT"
		node -e "
const fs=require('fs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const stamp={ droxVersion: pkg.droxVersion||pkg.version, vscodeBaseVersion: pkg.version, builtAt: new Date().toISOString(), gitHead: null };
fs.mkdirSync('out-vscode-min',{recursive:true});
fs.writeFileSync('out-vscode-min/drox-bundle-stamp.json', JSON.stringify(stamp));
"
	)
fi

COPILOT_SDK="$REPO_ROOT/.build/extensions/copilot/node_modules/@github/copilot/sdk"
DROX_MS_SURFACE="$(node -p "require('./product.json').droxMicrosoftAgentsSurfaceEnabled === true")"
if [[ "$DROX_MS_SURFACE" == "true" && ! -d "$COPILOT_SDK" ]]; then
	step 'gulp compile-copilot-extension-build'
	run_npm run gulp -- compile-copilot-extension-build
elif [[ "$DROX_MS_SURFACE" != "true" ]]; then
	echo '[build-release] extensions/copilot non bundle (droxMicrosoftAgentsSurfaceEnabled=false)'
fi

step 'gulp vscode-linux-x64-min-ci'
run_npm run gulp -- vscode-linux-x64-min-ci

step 'merge-product-gallery (Open VSX)'
node "$SCRIPT_DIR/lib/merge-product-gallery.mjs" "$OUT_DIR"

if [[ "$WITH_DEB" -eq 1 ]]; then
	ensure_cli_openssl_prebuilt
	step 'stage-linux-cli-tunnel (drox-ide-tunnel)'
	chmod +x "$SCRIPT_DIR/stage-linux-cli-tunnel.sh"
	"$SCRIPT_DIR/stage-linux-cli-tunnel.sh" "$OUT_DIR"
fi

if [[ "$WITH_DEB" -eq 1 ]]; then
	step 'strip non-glibc natives (prepare-deb)'
	linux_strip_packaged_non_glibc "$OUT_DIR"
	step 'gulp vscode-linux-x64-prepare-deb + build-deb'
	run_npm run gulp -- vscode-linux-x64-prepare-deb
	run_npm run gulp -- vscode-linux-x64-build-deb
	DEB_DIR="$REPO_ROOT/.build/linux/deb/amd64/deb"
	if [[ -d "$DEB_DIR" ]]; then
		echo "Paquet(s) .deb :"
		ls -la "$DEB_DIR"/*.deb 2>/dev/null || true
	fi
fi

step 'verify-packaged-linux'
"$SCRIPT_DIR/verify-packaged-linux.sh" "$OUT_DIR"

echo ""
echo "Done. App: $OUT_DIR/$PRODUCT_SHORT"
if [[ "$WITH_DEB" -eq 1 ]]; then
	echo "Suite : ./scripts/release-publish-linux.sh"
fi
