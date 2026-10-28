# Forwarder -> scripts/release/build-release-win32.ps1
& (Join-Path $PSScriptRoot 'release\build-release-win32.ps1') @PSBoundParameters
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
