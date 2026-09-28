#!/usr/bin/env bash
# One-shot WSL Ubuntu setup + Drox IDE linux-x64 release build.
# Called by wsl-linux-build-isolated.ps1 on ~/Drox---IDE (ext4).
# Manual: cd ~/Drox---IDE && bash docs/operations/scripts/wsl-linux-build.sh
# Doc: ../04-RELEASE-LINUX.md

set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
	echo "[wsl-linux-build] Run inside WSL Ubuntu (~/Drox---IDE or via wsl-linux-build-isolated.ps1)." >&2
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
RESTORE_PS1='docs/operations/scripts/restore-windows-dev.ps1'

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
		echo "    cd ~/Drox---IDE && bash docs/operations/scripts/wsl-linux-build.sh" >&2
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
chmod +x scripts/build-release-linux.sh scripts/package-drox.sh \
	scripts/verify-packaged-linux.sh scripts/release-publish-linux.sh \
	scripts/lib/linux-npm-install.sh scripts/lib/linux-strip-packaged-natives.sh
./scripts/build-release-linux.sh --force-compile --skip-npm-install

OR_REPO="${DROX_RELEASES_REPO:-$(dirname "$REPO_ROOT")/Drox---IDE---OR}"
if [[ -d "$OR_REPO/.git" ]]; then
	step "release-publish-linux.sh"
	DROX_RELEASES_REPO="$OR_REPO" ./scripts/release-publish-linux.sh
	UPLOAD="$OR_REPO/_upload"
	echo ""
	echo "Done. Deb in: $UPLOAD"
	ls -la "$UPLOAD"/*.deb 2>/dev/null || true
	echo ""
	echo "Upload to GitHub (from Windows PowerShell):"
	VER="$(node scripts/lib/drox-release-manifest.mjs version)"
	echo "  gh release upload v${VER} \"$(wslpath -w "$UPLOAD" 2>/dev/null || echo "$UPLOAD")/Drox-IDE-${VER}-linux-x64.deb\" --repo DroxKiwi/Drox---IDE---OR --clobber"
else
	echo ""
	echo "Build OK. Publier le manifeste (voir 04-RELEASE-LINUX.md §4) :"
	echo "  DROX_RELEASES_REPO=/mnt/c/.../Drox---IDE---OR ./scripts/release-publish-linux.sh"
fi

if [[ "$REPO_ROOT" == /mnt/* ]]; then
	echo ""
	echo "==> Windows dev: run .\\${RESTORE_PS1} from PowerShell before npm run watch."
fi
