#!/usr/bin/env bash
# Forwarder — implementation: docs/operations/scripts/wsl-linux-build.sh
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../docs/operations/scripts/wsl-linux-build.sh" "$@"
