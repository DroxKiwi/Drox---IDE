# Smoke tests unitaires Drox (fork Nexus IDE)
# allow-any-unicode-next-line
# Prérequis : npm run compile (ou watch actif)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host '=== Drox unit tests (Node / Mocha) ===' -ForegroundColor Cyan
node test/unit/node/index.js --runGlob "**/vs/workbench/contrib/drox/test/**/*.test.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '=== Drox unit tests OK ===' -ForegroundColor Green
