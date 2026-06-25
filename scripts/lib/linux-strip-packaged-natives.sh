#!/usr/bin/env bash
# Remove musl / wrong-platform native modules from a packaged Linux tree or node_modules.
# Used before .deb (dpkg-shlibdeps) and after npm install on Linux.

linux_strip_parcel_watchers() {
	local base="${1:?base path (packaged dir or repo root)}"
	local nm="$base/resources/app/node_modules"
	if [[ ! -d "$nm" ]]; then
		nm="$base/node_modules"
	fi
	local parcel="$nm/@parcel"
	if [[ ! -d "$parcel" ]]; then
		return 0
	fi
	find "$parcel" -mindepth 1 -maxdepth 1 -type d -name 'watcher-*' -print -exec rm -rf {} + 2>/dev/null || true
}

linux_strip_packaged_non_glibc() {
	local packaged_dir="${1:?packaged dir}"
	linux_strip_parcel_watchers "$packaged_dir"
}
