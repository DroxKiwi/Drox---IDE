#!/usr/bin/env bash
# npm install on Linux (WSL / CI). Always --force: lockfile lists win32 optional deps (EBADPLATFORM otherwise).

# shellcheck source=linux-strip-packaged-natives.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/linux-strip-packaged-natives.sh"

linux_npm_install() {
	local repo_root="${1:?repo root required}"
	(
		cd "$repo_root"
		echo "[linux-npm] npm install --force"
		npm install --force
	)
	for dir in "" extensions remote; do
		if [[ -z "$dir" ]]; then
			linux_strip_parcel_watchers "$repo_root"
		else
			linux_strip_parcel_watchers "$repo_root/$dir"
		fi
	done
}
