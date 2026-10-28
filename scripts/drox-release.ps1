# Forwarder -> scripts/release/drox-release.ps1
& (Join-Path $PSScriptRoot 'release\drox-release.ps1') @PSBoundParameters
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
