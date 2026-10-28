# Forwarder -> scripts/release/restore-windows-dev-deps.ps1
param([switch]$Quick)
$target = Join-Path $PSScriptRoot 'release\restore-windows-dev-deps.ps1'
if ($Quick) { & $target -Quick } else { & $target }
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
