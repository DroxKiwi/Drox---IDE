# Pre-vols automatises P3 - orchestration v1_2 (no Ollama)
# Usage: .\scripts\smoke-orchestration-preflight.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host '=== P3 preflight: Rust (orchestration + engine) ===' -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot 'drox-engine\drox')
cargo test -p drox-engine orchestration --quiet
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
cargo test -p drox-engine run_spec --quiet
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
cargo test -p drox-engine delegate_report --quiet
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
cargo test -p drox-cli agent_run_params --quiet
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host '=== P3 preflight: Drox IDE unit tests ===' -ForegroundColor Cyan
& (Join-Path $repoRoot 'scripts\test-drox.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '=== P3 preflight OK ===' -ForegroundColor Green
Write-Host 'Manuel: docs/1.2.0/steps/11-operations/SMOKE-ORCHESTRATION-1.2.0.md (scenarios 1-3)' -ForegroundColor Yellow
