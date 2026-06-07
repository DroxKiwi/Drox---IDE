#!/usr/bin/env bash
# Package the Drox CLI binary into resources/drox/<platform>/ for Nexus IDE releases.
# Usage: ./scripts/package-drox.sh [release|debug]

set -euo pipefail

PROFILE="${1:-release}"
if [[ "$PROFILE" != "release" && "$PROFILE" != "debug" ]]; then
	echo "Usage: $0 [release|debug]" >&2
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DROX_ROOT="$REPO_ROOT/drox-engine/drox"

if [[ ! -f "$DROX_ROOT/Cargo.toml" ]]; then
	echo "Cargo workspace introuvable: $DROX_ROOT" >&2
	exit 1
fi

BIN='drox'
case "$(uname -s)" in
	Darwin)
		case "$(uname -m)" in
			arm64) PLATFORM_FOLDER='darwin-arm64' ;;
			*) PLATFORM_FOLDER='darwin-x64' ;;
		esac
		;;
	Linux)
		case "$(uname -m)" in
			aarch64|arm64) PLATFORM_FOLDER='linux-arm64' ;;
			armv7l|armhf) PLATFORM_FOLDER='linux-armhf' ;;
			*) PLATFORM_FOLDER='linux-x64' ;;
		esac
		;;
	*)
		# allow-any-unicode-next-line
		echo "Plateforme non supportée: $(uname -s)" >&2
		exit 1
		;;
esac

TARGET_DIR="$PROFILE"
BUILT="$DROX_ROOT/target/$TARGET_DIR/$BIN"

if [[ "$PROFILE" == "release" ]]; then
	CARGO_BUILD_ARGS=(build --release -p drox-cli)
else
	CARGO_BUILD_ARGS=(build -p drox-cli)
fi
echo "[package-drox] cargo ${CARGO_BUILD_ARGS[*]} ($PLATFORM_FOLDER)"
(
	cd "$DROX_ROOT"
	cargo "${CARGO_BUILD_ARGS[@]}"
)

if [[ ! -f "$BUILT" ]]; then
	echo "Binaire attendu introuvable: $BUILT" >&2
	exit 1
fi

DEST_DIR="$REPO_ROOT/resources/drox/$PLATFORM_FOLDER"
mkdir -p "$DEST_DIR"
DEST="$DEST_DIR/$BIN"
cp -f "$BUILT" "$DEST"
chmod +x "$DEST"
echo "[package-drox] OK -> $DEST"
