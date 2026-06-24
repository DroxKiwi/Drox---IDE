#!/usr/bin/env bash
# Build VS Code CLI (Rust) and stage tunnel binary for Linux desktop package.
#
# CI Microsoft mixes a separate CLI artifact into VSCode-linux-*/bin/<tunnelApplicationName>.
# Local Drox builds must do the same before prepare-deb (dpkg-shlibdeps scans that binary).
#
# Usage: ./scripts/stage-linux-cli-tunnel.sh [../VSCode-linux-x64]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${1:-$(cd "$REPO_ROOT/.." && pwd)/VSCode-linux-x64}"

TUNNEL_NAME="$(node -p "require('$REPO_ROOT/product.json').tunnelApplicationName")"
TUNNEL_BIN="$OUT_DIR/bin/$TUNNEL_NAME"
CLI_RELEASE="$REPO_ROOT/cli/target/release/code"
OPENSSL_DIR="$REPO_ROOT/cli/openssl/package/out/x64-linux"

if [[ -x "$TUNNEL_BIN" ]]; then
	echo "[stage-linux-cli-tunnel] Already present: $TUNNEL_BIN"
	exit 0
fi

if [[ ! -d "$OPENSSL_DIR/lib" ]]; then
	echo "[stage-linux-cli-tunnel] OpenSSL prebuilt missing under cli/openssl — run: npm run gulp -- compile-cli" >&2
	echo "[stage-linux-cli-tunnel] Or fetch @vscode/openssl-prebuilt into cli/openssl (see build/gulpfile.cli.ts)." >&2
	exit 1
fi

echo "[stage-linux-cli-tunnel] cargo build --release (cli/)..."
(
	cd "$REPO_ROOT/cli"
	export OPENSSL_DIR
	cargo build --release
)

if [[ ! -x "$CLI_RELEASE" ]]; then
	echo "[stage-linux-cli-tunnel] Missing CLI output: $CLI_RELEASE" >&2
	exit 1
fi

mkdir -p "$OUT_DIR/bin"
cp "$CLI_RELEASE" "$TUNNEL_BIN"
chmod 755 "$TUNNEL_BIN"
echo "[stage-linux-cli-tunnel] Installed $TUNNEL_BIN"
