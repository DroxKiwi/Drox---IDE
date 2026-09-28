# Restore full Windows dev environment after a Linux release build in WSL.
#
# WSL `npm install` on /mnt/c leaves:
#   - Linux shims instead of node_modules/.bin/*.cmd  → npm run watch fails
#   - ELF .node binaries instead of Win32 PE          → scripts\code.bat fails
#
# Usage (PowerShell, from repo root):
#   .\drox-engine\docs\operations\scripts\restore-windows-dev.ps1
#   .\drox-engine\docs\operations\scripts\restore-windows-dev.ps1 -ShimsOnly
#
# Stop `npm run watch` and close Drox/VS Code dev instances before running.

[CmdletBinding()]
param(
	[switch]$ShimsOnly,
	[switch]$IncludeExtensions
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
	Write-Error 'Run this script on Windows after a WSL Linux build.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$binDir = Join-Path $repoRoot 'node_modules\.bin'
$shimNames = @('npm-run-all2.cmd', 'gulp.cmd', 'electron.cmd')

$nativeProbePaths = @(
	'node_modules\@vscode\policy-watcher\build\Release\vscode-policy-watcher.node',
	'node_modules\@vscode\native-watchdog\build\Release\watchdog.node',
	'node_modules\@vscode\spdlog\build\Release\spdlog.node',
	'node_modules\@vscode\sqlite3\build\Release\vscode-sqlite3.node',
	'node_modules\@parcel\watcher\build\Release\watcher.node',
	'node_modules\native-keymap\build\Release\keymapping.node',
	'node_modules\node-pty\build\Release\pty.node',
	'node_modules\@vscode\windows-mutex\build\Release\CreateMutex.node',
	'node_modules\@vscode\windows-registry\build\Release\winregistry.node',
	'node_modules\@vscode\windows-process-tree\build\Release\windows_process_tree.node'
)

function Test-IsElfBinary([string]$Path) {
	$bytes = [System.IO.File]::ReadAllBytes($Path)
	return $bytes.Length -ge 4 -and $bytes[0] -eq 0x7F -and $bytes[1] -eq 0x45 -and $bytes[2] -eq 0x4C -and $bytes[3] -eq 0x46
}

function Test-IsPeBinary([string]$Path) {
	$bytes = [System.IO.File]::ReadAllBytes($Path)
	return $bytes.Length -ge 2 -and $bytes[0] -eq 0x4D -and $bytes[1] -eq 0x5A
}

function Test-WindowsDevShimsReady {
	if (-not (Test-Path $binDir)) { return $false }
	foreach ($name in $shimNames) {
		if (-not (Test-Path (Join-Path $binDir $name))) { return $false }
	}
	return $true
}

function Invoke-RepoNpm {
	param(
		[string[]]$NpmArgs
	)
	Push-Location $repoRoot
	$prevEap = $ErrorActionPreference
	$ErrorActionPreference = 'Continue'
	try {
		& npm @NpmArgs 2>&1 | ForEach-Object { Write-Host $_ }
		if ($LASTEXITCODE -ne 0) {
			throw "npm $($NpmArgs -join ' ') a echoue (code $LASTEXITCODE)"
		}
	} finally {
		$ErrorActionPreference = $prevEap
		Pop-Location
	}
}

function Get-NpmPackageFromNodePath([string]$FilePath, [string]$ModuleRoot) {
	$current = Split-Path $FilePath -Parent
	while ($current) {
		if (-not $current.StartsWith($ModuleRoot, [StringComparison]::OrdinalIgnoreCase)) {
			break
		}
		$pkgJson = Join-Path $current 'package.json'
		if (Test-Path $pkgJson) {
			$name = (Get-Content $pkgJson -Raw | ConvertFrom-Json).name
			$npmRoot = if ($ModuleRoot.EndsWith('remote\node_modules')) { 'remote' } else { '.' }
			return @{ Name = [string]$name; Root = $current; NpmRoot = $npmRoot }
		}
		$parent = Split-Path $current -Parent
		if (-not $parent -or $parent -eq $current) { break }
		$current = $parent
	}
	return $null
}

function Get-LinuxContaminatedNativeModules([string[]]$ModuleRoots) {
	$packages = @{}
	foreach ($moduleRoot in $ModuleRoots) {
		if (-not (Test-Path $moduleRoot)) { continue }
		Get-ChildItem -Path $moduleRoot -Recurse -Filter '*.node' -File -ErrorAction SilentlyContinue |
			Where-Object {
				$_.FullName -match '\\build\\Release\\' -and
				$_.FullName -notmatch '\\obj\.target\\' -and
				$_.FullName -notmatch '\\prebuilds\\'
			} |
			ForEach-Object {
				if (Test-IsElfBinary $_.FullName) {
					$pkg = Get-NpmPackageFromNodePath $_.FullName $moduleRoot
					if ($pkg -and -not $packages.ContainsKey($pkg.Name)) {
						$packages[$pkg.Name] = $pkg
					}
				}
			}
	}
	return $packages
}

function Remove-NativeBuildArtifacts([string]$PackageRoot) {
	Get-ChildItem -Path $PackageRoot -Recurse -Directory -Filter 'build' -ErrorAction SilentlyContinue |
		Where-Object { Test-Path (Join-Path $_.FullName 'Release') } |
		ForEach-Object {
			Remove-Item -LiteralPath $_.FullName -Recurse -Force
		}
}

function Restore-WindowsShims {
	if (Test-WindowsDevShimsReady) {
		Write-Host 'Shims Windows OK (node_modules\.bin\*.cmd).' -ForegroundColor DarkGray
		return
	}

	Write-Host '==> npm install (shims Windows + postinstall)' -ForegroundColor Yellow
	Invoke-RepoNpm -NpmArgs @('install')

	if (-not (Test-WindowsDevShimsReady)) {
		Write-Host 'Shims absents — npm install sans scripts puis complet…' -ForegroundColor Yellow
		Invoke-RepoNpm -NpmArgs @('install', '--ignore-scripts')
		Invoke-RepoNpm -NpmArgs @('install')
	}

	if (-not (Test-WindowsDevShimsReady)) {
		throw @"
Les binaires Windows (node_modules\.bin\*.cmd) sont toujours manquants.
Essayez :
  cd `"$repoRoot`"
  Remove-Item -Recurse -Force node_modules
  npm install
"@
	}
}

function Restore-WindowsNativeModules([hashtable]$Packages) {
	if ($Packages.Count -eq 0) {
		Write-Host 'Modules natifs racine OK (pas de .node ELF detecte).' -ForegroundColor DarkGray
		return
	}

	Write-Host "==> Recompilation Win32 de $($Packages.Count) module(s) natif(s)" -ForegroundColor Yellow

	$byNpmRoot = @{}
	foreach ($name in ($Packages.Keys | Sort-Object)) {
		$info = $Packages[$name]
		$npmRoot = $info.NpmRoot
		if (-not $byNpmRoot.ContainsKey($npmRoot)) {
			$byNpmRoot[$npmRoot] = [System.Collections.Generic.List[string]]::new()
		}
		$byNpmRoot[$npmRoot].Add($name)
		Write-Host "    - $name ($npmRoot)"
		try {
			Remove-NativeBuildArtifacts -PackageRoot $info.Root
		} catch {
			throw @"
Impossible de supprimer les artefacts build pour $name ($($info.Root)).
Arretez npm run watch et fermez .\scripts\code.bat puis relancez ce script.
Erreur : $($_.Exception.Message)
"@
		}
	}

	foreach ($npmRoot in ($byNpmRoot.Keys | Sort-Object)) {
		$names = $byNpmRoot[$npmRoot] | Sort-Object -Unique
		$cwd = if ($npmRoot -eq 'remote') { Join-Path $repoRoot 'remote' } else { $repoRoot }
		Push-Location $cwd
		$prevEap = $ErrorActionPreference
		$ErrorActionPreference = 'Continue'
		try {
			Write-Host "==> npm rebuild ($npmRoot): $($names -join ', ')" -ForegroundColor DarkYellow
			& npm rebuild @names 2>&1 | ForEach-Object { Write-Host $_ }
			if ($LASTEXITCODE -ne 0) {
				throw "npm rebuild a echoue dans $npmRoot (code $LASTEXITCODE)"
			}
		} finally {
			$ErrorActionPreference = $prevEap
			Pop-Location
		}
	}
}

function Test-NativeProbesReady {
	$missing = @()
	$elf = @()
	foreach ($rel in $nativeProbePaths) {
		$path = Join-Path $repoRoot $rel
		if (-not (Test-Path $path)) { continue }
		if (Test-IsElfBinary $path) { $elf += $rel }
		elseif (-not (Test-IsPeBinary $path)) { $missing += $rel }
	}
	return @{ Elf = $elf; Invalid = $missing }
}

Write-Host 'Drox IDE - restauration environnement dev Windows' -ForegroundColor Cyan
Write-Host "Repo: $repoRoot"
Write-Host ''
Write-Host 'Conseil : arretez npm run watch et fermez les instances .\scripts\code.bat avant de continuer.' -ForegroundColor DarkYellow
Write-Host ''

Restore-WindowsShims

if ($ShimsOnly) {
	Write-Host ''
	Write-Host 'OK (shims seulement) — npm run watch devrait fonctionner.' -ForegroundColor Green
	exit 0
}

$scanRoots = @(
	(Join-Path $repoRoot 'node_modules'),
	(Join-Path $repoRoot 'remote\node_modules')
)
if ($IncludeExtensions) {
	$scanRoots += Join-Path $repoRoot 'extensions\node_modules'
}

$contaminated = Get-LinuxContaminatedNativeModules -ModuleRoots $scanRoots
Restore-WindowsNativeModules -Packages $contaminated

$remaining = Get-LinuxContaminatedNativeModules -ModuleRoots $scanRoots
if ($remaining.Count -gt 0) {
	Write-Host 'ELF restants — postinstall force puis rebuild…' -ForegroundColor Yellow
	Remove-Item -Force -ErrorAction SilentlyContinue @(
		(Join-Path $repoRoot 'node_modules\.postinstall-state'),
		(Join-Path $repoRoot 'node_modules\.postinstall-state-contents')
	)
	Push-Location $repoRoot
	$prevEap = $ErrorActionPreference
	$ErrorActionPreference = 'Continue'
	try {
		& node build/npm/fast-install.ts --force 2>&1 | ForEach-Object { Write-Host $_ }
		if ($LASTEXITCODE -ne 0) {
			throw "fast-install --force a echoue (code $LASTEXITCODE)"
		}
	} finally {
		$ErrorActionPreference = $prevEap
		Pop-Location
	}
	Restore-WindowsNativeModules -Packages $remaining
	$remaining = Get-LinuxContaminatedNativeModules -ModuleRoots $scanRoots
}

$probes = Test-NativeProbesReady
if ($remaining.Count -gt 0 -or $probes.Elf.Count -gt 0) {
	$lines = @('Des modules natifs Linux sont encore presents :')
	foreach ($name in $remaining.Keys) { $lines += "  - $name" }
	foreach ($rel in $probes.Elf) { $lines += "  - $rel (ELF)" }
	$lines += ''
	$lines += 'Arretez watch/code.bat puis relancez ce script.'
	$lines += 'Sinon : Remove-Item -Recurse -Force node_modules; npm install'
	throw ($lines -join "`n")
}

$stamp = Join-Path $repoRoot '.build\linux-npm-touch'
if (Test-Path $stamp) {
	Remove-Item -Force $stamp
}

Write-Host ''
Write-Host 'OK — vous pouvez relancer :' -ForegroundColor Green
Write-Host '  npm run watch'
Write-Host '  .\scripts\code.bat'
exit 0
