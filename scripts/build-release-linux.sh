#!/usr/bin/env bash
# Forwarder — implementation: scripts/release/build-release-linux.sh
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/release/build-release-linux.sh" "$@"
