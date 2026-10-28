#!/usr/bin/env bash
# Forwarder — implementation: scripts/release/release-publish-linux.sh
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/release/release-publish-linux.sh" "$@"
