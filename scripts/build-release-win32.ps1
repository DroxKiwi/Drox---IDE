# Build Drox IDE - application packagée Windows x64 (F1)
# Produit : ..\VSCode-win32-x64\ (parent du repo)
#
# Usage:
#   .\scripts\build-release-win32.ps1
#   .\scripts\build-release-win32.ps1 -SkipNpmInstall -SkipElectron
#   .\scripts\build-release-win32.ps1 -WithSetup    # enchaîne F2 (installeur user)
#   .\scripts\build-release-win32.ps1 -ForceCompile # rebundle out-vscode-min (requis après modif TS Drox)
#
# Prerequis : Node (voir .nvmrc), Rust, ~15-25 Go disque, 1-3 h selon machine.

[CmdletBinding()]
param(
	[switch]$SkipNpmInstall,
	[switch]$SkipElectron,
	[switch]$SkipCompile,
	[switch]$ForceCompile,
	[ValidateSet('release', 'debug')]
	[string]$DroxProfile = 'release',
	[switch]$WithSetup,
	[switch]$WithInnoUpdaterOnly
)

$ErrorActionPreference = 'Stop'

if ($ForceCompile -and $SkipCompile) {
	Write-Host '[build-release] -ForceCompile annule -SkipCompile (recompilation obligatoire).' -ForegroundColor Yellow
	$SkipCompile = $false
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$parentRoot = Split-Path -Parent $repoRoot
$outDir = Join-Path $parentRoot 'VSCode-win32-x64'
$productShort = 'Drox IDE'

function Write-Step([string]$Message) {
	Write-Host ""
	Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Npm([string[]]$NpmArgs) {
	Push-Location $repoRoot
	$prevEap = $ErrorActionPreference
	$ErrorActionPreference = 'Continue'
	try {
		& npm @NpmArgs 2>&1 | ForEach-Object { Write-Host $_ }
		if ($LASTEXITCODE -ne 0) { throw "npm $($NpmArgs -join ' ') a echoue (code $LASTEXITCODE)" }
	} finally {
		$ErrorActionPreference = $prevEap
		Pop-Location
	}
}

function Add-WindowsSdkSignToolToPath {
	$kitsBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
	if (-not (Test-Path $kitsBin)) { return }
	$verDir = Get-ChildItem $kitsBin -Directory -ErrorAction SilentlyContinue |
		Sort-Object Name -Descending |
		Select-Object -First 1
	if (-not $verDir) { return }
	$toolDir = Join-Path $verDir.FullName 'x64'
	if (Test-Path (Join-Path $toolDir 'signtool.exe')) {
		$env:PATH = "$toolDir;$env:PATH"
		Write-Host "[build-release] signtool: $toolDir"
	}
}

function Invoke-Gulp([string]$TaskName) {
	Write-Step "gulp $TaskName"
	Add-WindowsSdkSignToolToPath
	Invoke-Npm @('run', 'gulp', '--', $TaskName)
}

. (Join-Path $PSScriptRoot 'lib\drox-bundle-readiness.ps1')
Initialize-DroxBundleReadiness -RepoRoot $repoRoot

function Ensure-OutVscodeMin {
	$issues = @(Get-DroxBundleReadinessIssues)
	$needsCompile = $ForceCompile -or ($issues.Count -gt 0)
	if (-not $needsCompile) {
		Write-Host "[build-release] Bundle min OK (droxVersion $(Get-PackageDroxVersion))." -ForegroundColor Green
		return
	}
	if ($SkipCompile -and -not $ForceCompile) {
		throw (Format-DroxBundleReadinessReport -Issues $issues)
	}
	if ($issues.Count -gt 0) {
		Write-Host (Format-DroxBundleReadinessReport -Issues $issues) -ForegroundColor Yellow
	}
	if ($ForceCompile) {
		Write-Host '[build-release] -ForceCompile : rebundle out-vscode-min (~15-45 min)' -ForegroundColor Yellow
	}
	Write-Step 'gulp core-ci-desktop - bundle out-vscode-min seulement (sans server/reh)'
	Invoke-Gulp 'core-ci-desktop'
	Write-DroxBundleStamp
	$after = @(Get-DroxBundleReadinessIssues)
	if ($after.Count -gt 0) {
		throw (Format-DroxBundleReadinessReport -Issues $after)
	}
	Write-Host "[build-release] Bundle min rebuilde pour droxVersion $(Get-PackageDroxVersion)." -ForegroundColor Green
}

Write-Host 'Drox IDE - build release win32-x64'
Write-Host "Repo : $repoRoot"
Write-Host "Sortie attendue : $outDir"

$logoPng = $null
foreach ($logoName in @('logo3.png', 'logo_drox.png', 'logo-drox.png')) {
	$candidate = Join-Path $repoRoot $logoName
	if (Test-Path $candidate) {
		$logoPng = $candidate
		break
	}
}
if ($logoPng) {
	Write-Step "sync-drox-win32-icons ($([IO.Path]::GetFileName($logoPng)) -> resources/win32)"
	& (Join-Path $repoRoot 'scripts\sync-drox-win32-icons.ps1') -SourcePng $logoPng
	if ($SkipElectron) {
		Write-Host '[build-release] -SkipElectron : l icone de Drox IDE.exe reste celle du cache Electron.' -ForegroundColor Yellow
		Write-Host '            Pour la barre des taches, relancez une fois SANS -SkipElectron (npm run electron).' -ForegroundColor Yellow
	}
}

if (-not $SkipNpmInstall) {
	Write-Step 'npm install'
	Invoke-Npm @('install')
}

if (-not $SkipElectron) {
	Write-Step 'npm run electron'
	Invoke-Npm @('run', 'electron')
}

Write-Step "package-drox ($DroxProfile)"
& (Join-Path $repoRoot 'scripts\package-drox.ps1') -Profile $DroxProfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($WithInnoUpdaterOnly) {
	if (-not (Test-Path $outDir)) {
		Write-Error "Dossier packagé introuvable : $outDir. Lancez d'abord un build complet sans -WithInnoUpdaterOnly."
	}
	Invoke-Gulp 'vscode-win32-x64-inno-updater'
	exit 0
}

Ensure-OutVscodeMin

$copilotSdk = Join-Path $repoRoot '.build\extensions\copilot\node_modules\@github\copilot\sdk'
if (-not (Test-Path $copilotSdk)) {
	Write-Step 'gulp compile-copilot-extension-build (requis pour package win32)'
	Invoke-Gulp 'compile-copilot-extension-build'
}

Write-Step 'gulp vscode-win32-x64-min-ci - package Electron'
Invoke-Gulp 'vscode-win32-x64-min-ci'

Write-Step 'gulp vscode-win32-x64-inno-updater'
Invoke-Gulp 'vscode-win32-x64-inno-updater'

if ($WithSetup) {
	& (Join-Path $PSScriptRoot 'ensure-inno-setup.ps1')
	if ($LASTEXITCODE -ne 0) { throw 'Inno Setup 6.6+ requis (voir scripts/ensure-inno-setup.ps1)' }
	Write-Step 'gulp vscode-win32-x64-user-setup - installeur Inno'
	Invoke-Gulp 'vscode-win32-x64-user-setup'
	$setupDir = Join-Path $repoRoot '.build\win32-x64\user-setup'
	if (Test-Path $setupDir) {
		Write-Host "Installeur(s) : $setupDir" -ForegroundColor Green
		Get-ChildItem $setupDir -Filter '*.exe' | ForEach-Object { Write-Host "  $($_.FullName)" }
	}
}

# --- Verifications smoke F1 ---
Write-Step 'Verifications'

& (Join-Path $repoRoot 'scripts\verify-legal-package.ps1') -PackagedDir $outDir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$exe = Join-Path $outDir "$productShort.exe"
if (-not (Test-Path $exe)) {
	# repli si le nom diffère
	$exe = Get-ChildItem $outDir -Filter '*.exe' -ErrorAction SilentlyContinue |
		Where-Object { $_.Name -notmatch 'inno|unins|elevate|Code Helper' } |
		Select-Object -First 1 -ExpandProperty FullName
}

if (-not $exe -or -not (Test-Path $exe)) {
	Write-Error "Exécutable principal introuvable sous $outDir"
}

$droxBinCandidates = @(
	Join-Path $outDir 'resources\drox\win32-x64\drox.exe'
	Join-Path $outDir 'resources\app\resources\drox\win32-x64\drox.exe'
)
$droxBin = $droxBinCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $droxBin) {
	Write-Error @"
Moteur embarque absent sous $outDir
  Attendu: $($droxBinCandidates[0])
  Lancez: npm run package-drox puis rebuild (gulp copie resources/drox/**).
"@
}

$packageIssues = @(Get-PackagedReleaseIntegrityIssues -PackagedDir $outDir)
if ($packageIssues.Count -gt 0) {
	throw (Format-PackagedReleaseIntegrityReport -Issues $packageIssues -PackagedDir $outDir)
}
Write-Host (Format-PackagedReleaseIntegrityReport -Issues @() -PackagedDir $outDir) -ForegroundColor Green

$forbidden = @(
	Join-Path $outDir 'resources\app\src'
	Join-Path $outDir 'resources\app\drox-engine'
)
foreach ($path in $forbidden) {
	if (Test-Path $path) {
		Write-Warning "Présence inattendue (sources) : $path"
	}
}

Write-Host ""
Write-Host "Build F1 terminé." -ForegroundColor Green
Write-Host "  IDE      : $exe"
if (Test-Path $droxBin) { Write-Host "  Moteur   : $droxBin" }
Write-Host ""
Write-Host 'Smoke manuel : lancer Drox IDE.exe, palette Drox Open Chat, run minimal.'
Write-Host "Checklist    : drox-engine/docs/1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md §8"
