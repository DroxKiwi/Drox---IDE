#!/usr/bin/env bash
# Install or update Drox IDE from the GitHub release marked Latest.
# Re-running this script downloads that release again and upgrades the .deb.
#
#   ./scripts/install/install.sh
#
# Override the repo with DROX_GITHUB_REPO=owner/name.

set -euo pipefail

REPO="${DROX_GITHUB_REPO:-DroxKiwi/Drox---IDE}"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
	echo "This installer only supports 64-bit Linux (x86_64)." >&2
	exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
	echo "python3 is required to read the GitHub release." >&2
	exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
	echo "curl is required to download the package." >&2
	exit 1
fi

echo "Reading the latest release of ${REPO}..."
info="$(curl -fsSL \
	-H "User-Agent: Drox-Install" \
	-H "Accept: application/vnd.github+json" \
	"https://api.github.com/repos/${REPO}/releases/latest" \
	| python3 -c 'import json,sys; release=json.load(sys.stdin); asset=next((a for a in release.get("assets") or [] if str(a.get("name","")).endswith("-linux-x64.deb")), None); sys.exit("The latest release has no linux-x64 .deb.") if asset is None else None; print(release.get("tag_name") or ""); print(asset["name"]); print(asset["browser_download_url"]); print(asset.get("digest") or "")')"

tag="$(echo "$info" | sed -n "1p")"
name="$(echo "$info" | sed -n "2p")"
url="$(echo "$info" | sed -n "3p")"
digest="$(echo "$info" | sed -n "4p")"

dest="${TMPDIR:-/tmp}/${name}"
echo "Downloading ${tag} (${name})..."
curl -fL --retry 3 -H "User-Agent: Drox-Install" -o "$dest" "$url"

if [[ "$digest" == sha256:* ]]; then
	expected="${digest#sha256:}"
	echo "${expected}  ${dest}" | sha256sum -c -
fi

if [[ "$(id -u)" -eq 0 ]]; then
	apt_get=(apt-get)
else
	apt_get=(sudo apt-get)
fi

echo "Installing. An existing Drox IDE package is upgraded."
"${apt_get[@]}" update
"${apt_get[@]}" install -y "$dest"

echo "Drox IDE ${tag} is installed. Run this script again after a newer release is marked Latest."
