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
$built = Join-Path $droxCrateRoot "target\$targetDir\$binName"

Write-Host "[package-drox] cargo build --$Profile -p drox-cli ($platformFolder)"
Push-Location $droxCrateRoot
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
	cargo build --$Profile -p drox-cli 2>&1 | ForEach-Object { Write-Host $_ }
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
