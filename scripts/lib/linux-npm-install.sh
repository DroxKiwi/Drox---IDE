#!/usr/bin/env bash
# npm install on Linux (WSL / CI). Always --force: lockfile lists win32 optional deps (EBADPLATFORM otherwise).

linux_npm_install() {
	local repo_root="${1:?repo root required}"
	(
		cd "$repo_root"
		echo "[linux-npm] npm install --force"
		npm install --force
	)
}
