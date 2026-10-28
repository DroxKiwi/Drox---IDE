# Forwarder -> scripts/release/wsl-linux-build-isolated.ps1
& (Join-Path $PSScriptRoot 'release\wsl-linux-build-isolated.ps1') @PSBoundParameters
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
