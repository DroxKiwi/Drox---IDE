# Forwarder — implementation: drox-engine/docs/operations/scripts/restore-windows-dev.ps1
param([switch]$Quick)
$target = Join-Path $PSScriptRoot '..\drox-engine\docs\operations\scripts\restore-windows-dev.ps1'
if ($Quick) { & $target -ShimsOnly } else { & $target }
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
