#!/usr/bin/env bash
# One-shot WSL Ubuntu setup + Drox IDE linux-x64 release build.
# Called by wsl-linux-build-isolated.ps1 on ~/Drox---IDE (ext4).
# Manual: cd ~/Drox---IDE && bash scripts/release/wsl-linux-build.sh
# Doc: docs/release/04-RELEASE-LINUX.md

set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
	echo "[wsl-linux-build] Run inside WSL Ubuntu (~/Drox---IDE or via wsl-linux-build-isolated.ps1)." >&2
	exit 1
fi

if [[ -z "${HOME:-}" || "$HOME" == /mnt/* || "$HOME" == *:* ]]; then
	export HOME="/home/$(whoami)"
fi

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_ROOT="$(cd "$RELEASE_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPTS_ROOT/.." && pwd)"
# shellcheck source=../lib/linux-npm-install.sh
source "$SCRIPTS_ROOT/lib/linux-npm-install.sh"
LOG_FILE="${REPO_ROOT}/.build/wsl-linux-build.log"
RESTORE_PS1='scripts/release/restore-windows-dev.ps1'

mkdir -p "${REPO_ROOT}/.build"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "==> Drox IDE linux build (WSL) - $(date -Iseconds)"
echo "==> Repo: $REPO_ROOT"
echo "==> Log:  $LOG_FILE"

step() { echo ""; echo "==> $*"; }

ensure_system_packages() {
	local pkgs=(build-essential pkg-config libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev fakeroot rpm lintian curl git ca-certificates)
	local missing=()
	for p in "${pkgs[@]}"; do
		if ! dpkg -s "$p" >/dev/null 2>&1; then
			missing+=("$p")
		fi
	done
	if [[ ${#missing[@]} -eq 0 ]]; then
		step "System packages OK (deja installes)"
		return 0
	fi
	if ! sudo -n true 2>/dev/null; then
		echo "" >&2
		echo "[wsl-linux-build] sudo demande votre mot de passe Ubuntu (une fois)." >&2
		echo "  Ouvrez un terminal WSL interactif et lancez :" >&2
		echo "    wsl -d Ubuntu-24.04" >&2
		echo "    sudo apt-get update && sudo apt-get install -y ${pkgs[*]}" >&2
		echo "  Puis relancez le build depuis PowerShell." >&2
		echo "" >&2
		echo "  Ou lancez tout le build depuis WSL (mot de passe demande ici) :" >&2
		echo "    cd ~/Drox---IDE && bash scripts/release/wsl-linux-build.sh" >&2
		echo "" >&2
		exit 1
	fi
	step "System packages (apt install)"
	sudo apt-get update
	sudo apt-get install -y "${pkgs[@]}"
}

step "System packages"
ensure_system_packages

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

step "npm install for Linux"
linux_npm_install "$REPO_ROOT"
mkdir -p "${REPO_ROOT}/.build"
date -Iseconds > "${REPO_ROOT}/.build/linux-npm-touch"

step "build-release-linux.sh"
chmod +x "$RELEASE_DIR/build-release-linux.sh" "$SCRIPTS_ROOT/package-drox.sh" \
	"$SCRIPTS_ROOT/verify-packaged-linux.sh" "$RELEASE_DIR/release-publish-linux.sh" \
	"$SCRIPTS_ROOT/lib/linux-npm-install.sh" "$SCRIPTS_ROOT/lib/linux-strip-packaged-natives.sh"
"$RELEASE_DIR/build-release-linux.sh" --force-compile --skip-npm-install

RELEASES_REPO="${DROX_RELEASES_REPO:-$REPO_ROOT}"
if [[ -d "$RELEASES_REPO/.git" ]]; then
	step "release-publish-linux.sh"
	DROX_RELEASES_REPO="$RELEASES_REPO" "$RELEASE_DIR/release-publish-linux.sh"
	UPLOAD="$RELEASES_REPO/_upload"
	echo ""
	echo "Done. Deb in: $UPLOAD"
	ls -la "$UPLOAD"/*.deb 2>/dev/null || true
	echo ""
	echo "Upload to GitHub (from Windows PowerShell):"
	VER="$(node "$SCRIPTS_ROOT/lib/drox-release-manifest.mjs" version)"
	echo "  gh release upload v${VER} \"$(wslpath -w "$UPLOAD" 2>/dev/null || echo "$UPLOAD")/Drox-IDE-${VER}-linux-x64.deb\" --repo DroxKiwi/Drox---IDE --clobber"
else
	echo ""
	echo "Build OK. Publier le manifeste :"
	echo "  DROX_RELEASES_REPO=\$PWD $RELEASE_DIR/release-publish-linux.sh"
fi

if [[ "$REPO_ROOT" == /mnt/* ]]; then
	echo ""
	echo "==> Windows dev: run .\\${RESTORE_PS1} from PowerShell before npm run watch."
fi
