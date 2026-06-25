#!/usr/bin/env bash
# npm install on Linux when node_modules may come from Windows (/mnt/c shared tree).
# Always use --force if node_modules already exists (EBADPLATFORM on @*-win32-* otherwise).

linux_npm_install() {
	local repo_root="${1:?repo root required}"
	(
		cd "$repo_root"
		# Nested node_modules (build/, remote/) must be removed from Windows before WSL npm
		# (prepare-wsl-linux-build.ps1). WSL unlink on .exe under /mnt/c → EIO.
		if [[ -d node_modules ]]; then
			echo "[linux-npm] node_modules partage Windows/WSL — npm install --force"
			npm install --force
		else
			npm install
		fi
	)
}
