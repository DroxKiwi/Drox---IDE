# Forwarder -> scripts/release/restore-windows-dev.ps1
param([switch]$Quick)
$target = Join-Path $PSScriptRoot 'release\restore-windows-dev.ps1'
if ($Quick) { & $target -ShimsOnly } else { & $target @PSBoundParameters }
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
