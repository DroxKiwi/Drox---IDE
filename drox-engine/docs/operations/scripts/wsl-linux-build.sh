#!/usr/bin/env bash
# One-shot WSL Ubuntu setup + Drox IDE linux-x64 release build.
# Run from Windows:  .\drox-engine\docs\operations\scripts\wsl-linux-build.ps1
# Or inside WSL:    bash ./drox-engine/docs/operations/scripts/wsl-linux-build.sh
# Doc: ../04-RELEASE-LINUX.md

set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
	echo "[wsl-linux-build] Run inside WSL Ubuntu (or via wsl-linux-build.ps1)." >&2
	exit 1
fi

if [[ -z "${HOME:-}" || "$HOME" == /mnt/* || "$HOME" == *:* ]]; then
	export HOME="/home/$(whoami)"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
# shellcheck source=/dev/null
source "$REPO_ROOT/scripts/lib/linux-npm-install.sh"
LOG_FILE="${REPO_ROOT}/.build/wsl-linux-build.log"
RESTORE_PS1='drox-engine/docs/operations/scripts/restore-windows-dev.ps1'

mkdir -p "${REPO_ROOT}/.build"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "==> Drox IDE linux build (WSL) - $(date -Iseconds)"
echo "==> Repo: $REPO_ROOT"
echo "==> Log:  $LOG_FILE"

step() { echo ""; echo "==> $*"; }

step "System packages (sudo may prompt for password)"
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libx11-dev libxkbfile-dev \
	libsecret-1-dev libkrb5-dev fakeroot rpm lintian curl git ca-certificates

if ! command -v node >/dev/null 2>&1; then
	step "Install Node via nvm (.nvmrc)"
	export NVM_DIR="${HOME}/.nvm"
	if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
		curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
	fi
	# shellcheck disable=SC1091
	source "${NVM_DIR}/nvm.sh"
	cd "$REPO_ROOT"
	nvm install
	nvm use
else
	step "Node already installed: $(node --version)"
fi

if ! command -v rustc >/dev/null 2>&1; then
	step "Install Rust (rustup)"
	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
	# shellcheck disable=SC1091
	source "${HOME}/.cargo/env"
else
	step "Rust already installed: $(rustc --version)"
fi

export DROX_PRODUCT_SURFACE=release
cd "$REPO_ROOT"

step "npm install for Linux (shared /mnt/c node_modules)"
linux_npm_install "$REPO_ROOT"
mkdir -p "${REPO_ROOT}/.build"
date -Iseconds > "${REPO_ROOT}/.build/linux-npm-touch"

step "build-release-linux.sh"
chmod +x scripts/build-release-linux.sh scripts/package-drox.sh \
	scripts/verify-packaged-linux.sh scripts/release-publish-linux.sh \
	scripts/lib/linux-npm-install.sh
./scripts/build-release-linux.sh --force-compile --skip-npm-install

if [[ -d "$(dirname "$REPO_ROOT")/Drox---IDE---OR" ]]; then
	step "release-publish-linux.sh"
	./scripts/release-publish-linux.sh
	UPLOAD="$(dirname "$REPO_ROOT")/Drox---IDE---OR/_upload"
	echo ""
	echo "Done. Deb in: $UPLOAD"
	ls -la "$UPLOAD"/*.deb 2>/dev/null || true
	echo ""
	echo "Upload to GitHub (from Windows PowerShell):"
	VER="$(node scripts/lib/drox-release-manifest.mjs version)"
	echo "  gh release upload v${VER} \"$(wslpath -w "$UPLOAD")/Drox-IDE-${VER}-linux-x64.deb\" --repo DroxKiwi/Drox---IDE---OR"
else
	echo ""
	echo "Build OK. Clone Drox---IDE---OR next to this repo, then:"
	echo "  ./scripts/release-publish-linux.sh"
fi

echo ""
echo "==> Windows dev: run .\\${RESTORE_PS1} from PowerShell before npm run watch."
