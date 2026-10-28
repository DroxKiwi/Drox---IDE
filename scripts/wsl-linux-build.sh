#!/usr/bin/env bash
# Forwarder — implementation: scripts/release/wsl-linux-build.sh
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/release/wsl-linux-build.sh" "$@"
