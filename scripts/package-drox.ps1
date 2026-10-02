# Package the Drox CLI binary into resources/drox/<platform>/ for Nexus IDE releases.
# Usage: .\scripts\package-drox.ps1 [-Profile release|debug]

param(
	[ValidateSet('release', 'debug')]
	[string]$Profile = 'release'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$droxCrateRoot = Join-Path $repoRoot 'drox-engine\drox'

if (-not (Test-Path (Join-Path $droxCrateRoot 'Cargo.toml'))) {
	Write-Error "Cargo workspace introuvable: $droxCrateRoot"
}

$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -eq 'ARM64') {
	$platformFolder = 'win32-arm64'
} else {
	$platformFolder = 'win32-x64'
}

$binName = 'drox.exe'
$targetDir = if ($Profile -eq 'release') { 'release' } else { 'debug' }
# Pin target dir: agent/sandbox shells may redirect CARGO_TARGET_DIR to a cache,
# which would leave the repo target/ stale while package-drox copies the old binary.
$env:CARGO_TARGET_DIR = Join-Path $droxCrateRoot 'target'
$built = Join-Path $env:CARGO_TARGET_DIR "$targetDir\$binName"

$cargoArgs = if ($Profile -eq 'release') { @('build', '--release', '-p', 'drox-cli') } else { @('build', '-p', 'drox-cli') }
if ($Profile -eq 'release') {
	$env:DROX_OMIT_DEV_BUILD = '1'
} else {
	Remove-Item Env:DROX_OMIT_DEV_BUILD -ErrorAction SilentlyContinue
}
Write-Host "[package-drox] cargo $($cargoArgs -join ' ') ($platformFolder) DROX_OMIT_DEV_BUILD=$($env:DROX_OMIT_DEV_BUILD)"
Push-Location $droxCrateRoot
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
	& cargo @cargoArgs 2>&1 | ForEach-Object { Write-Host $_ }
	if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
	$ErrorActionPreference = $prevEap
	Pop-Location
}

if (-not (Test-Path $built)) {
	Write-Error "Binaire attendu introuvable: $built"
}

$destDir = Join-Path $repoRoot "resources\drox\$platformFolder"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$dest = Join-Path $destDir $binName

Copy-Item -Force $built $dest
Write-Host "[package-drox] OK -> $dest"

# Ship default MiniLM GGUF next to the engine (inherent to the app - no user download).
$modelsSrc = Join-Path $repoRoot 'drox-engine\models\all-MiniLM-L6-v2.Q4_K_M.gguf'
$modelsDestDir = Join-Path $repoRoot 'resources\drox\models'
$modelsDest = Join-Path $modelsDestDir 'all-MiniLM-L6-v2.Q4_K_M.gguf'
if (Test-Path $modelsSrc) {
	New-Item -ItemType Directory -Force -Path $modelsDestDir | Out-Null
	Copy-Item -Force $modelsSrc $modelsDest
	Write-Host "[package-drox] embed model OK -> $modelsDest"
} else {
	Write-Warning "[package-drox] MiniLM GGUF missing at $modelsSrc - run scripts/fetch-drox-embed-model.ps1 before shipping (users must not download this)."
}
