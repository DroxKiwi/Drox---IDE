# Forwarder -> scripts/release/release-publish-win32.ps1
& (Join-Path $PSScriptRoot 'release\release-publish-win32.ps1') @PSBoundParameters
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
