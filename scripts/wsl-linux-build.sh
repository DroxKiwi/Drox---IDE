#!/usr/bin/env bash
# Forwarder — implementation: drox-engine/docs/operations/scripts/wsl-linux-build.sh
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../drox-engine/docs/operations/scripts/wsl-linux-build.sh" "$@"
