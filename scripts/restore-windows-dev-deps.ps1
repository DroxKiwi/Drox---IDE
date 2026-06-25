# Forwarder — implementation: drox-engine/docs/operations/scripts/restore-windows-dev-deps.ps1
param([switch]$Quick)
$target = Join-Path $PSScriptRoot '..\drox-engine\docs\operations\scripts\restore-windows-dev-deps.ps1'
& $target @PSBoundParameters
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
