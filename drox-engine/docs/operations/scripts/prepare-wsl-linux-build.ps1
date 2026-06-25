# Prepare shared /mnt/c node_modules before a WSL Linux release build.
#
# WSL cannot reliably unlink Windows .exe under build/node_modules (EIO on esbuild.exe).
# Move nested node_modules aside from Windows *before* launching wsl-linux-build.sh.
#
# Usage (PowerShell, repo root):
#   .\drox-engine\docs\operations\scripts\prepare-wsl-linux-build.ps1
#   .\drox-engine\docs\operations\scripts\prepare-wsl-linux-build.ps1 -StopWatch

[CmdletBinding()]
param(
	[switch]$StopWatch
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
	Write-Error 'Run on Windows before wsl-linux-build.ps1.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path

$nestedModuleDirs = @(
	'build\node_modules',
	'remote\node_modules',
	'remote\web\node_modules'
)

$postinstallState = @(
	'node_modules\.postinstall-state',
	'node_modules\.postinstall-state-contents'
)

function Get-RepoDevProcesses {
	$repoNorm = $repoRoot.ToLowerInvariant()
	Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
		Where-Object {
			$cmd = [string]$_.CommandLine
			if (-not $cmd -or -not $cmd.ToLowerInvariant().Contains($repoNorm)) {
				return $false
			}
			$name = $_.Name.ToLowerInvariant()
			return $name -eq 'node.exe' -or
				$name -eq 'electron.exe' -or
				$name -like 'drox*.exe' -or
				$name -like 'code*.exe'
		} |
		Select-Object ProcessId, Name, CommandLine
}

function Format-ProcessLine($process) {
	$short = if ($process.CommandLine.Length -gt 120) {
		$process.CommandLine.Substring(0, 117) + '...'
	} else {
		$process.CommandLine
	}
	return "  PID $($process.ProcessId) ($($process.Name)): $short"
}

function Stop-RepoDevProcesses {
	for ($attempt = 1; $attempt -le 2; $attempt++) {
		$targets = @(Get-RepoDevProcesses)
		if ($targets.Count -eq 0) { return }

		if ($attempt -eq 1) {
			Write-Host "==> Arret de $($targets.Count) processus dev sur ce repo (watch / code.bat…)" -ForegroundColor Yellow
		} else {
			Write-Host "==> Nouvelle tentative d'arret ($($targets.Count) processus restants)…" -ForegroundColor Yellow
		}

		foreach ($p in $targets) {
			Write-Host (Format-ProcessLine $p) -ForegroundColor DarkGray
			# /T kills child esbuild --watch processes spawned by npm-run-all
			Start-Process -FilePath 'taskkill.exe' -ArgumentList '/F', '/T', '/PID', $p.ProcessId -Wait -NoNewWindow -ErrorAction SilentlyContinue | Out-Null
		}
		Start-Sleep -Seconds 3
	}
}

function Assert-NoRepoDevProcesses {
	$lockers = @(Get-RepoDevProcesses)
	if ($lockers.Count -eq 0) { return }

	$lines = @(
		'Processus dev encore actifs sur ce repo (verrouillent build\node_modules\esbuild.exe) :'
	)
	foreach ($p in $lockers) {
		$lines += Format-ProcessLine $p
	}
	$lines += ''
	if ($StopWatch) {
		$lines += 'Impossible de tous les arreter. Fermez les terminaux watch / instances Drox restantes, puis relancez.'
	} else {
		$lines += 'Relancez avec -StopWatch (defaut sur wsl-linux-build.ps1) :'
		$lines += '  .\drox-engine\docs\operations\scripts\wsl-linux-build.ps1'
	}
	throw ($lines -join "`n")
}

function Remove-OldModuleBackups([string]$ParentDir) {
	Get-ChildItem -LiteralPath $ParentDir -Directory -Filter 'node_modules.win.bak.*' -ErrorAction SilentlyContinue |
		ForEach-Object {
			Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
		}
}

function Move-Aside-NestedModules([string]$RelativePath) {
	$path = Join-Path $repoRoot $RelativePath
	if (-not (Test-Path -LiteralPath $path)) {
		Remove-OldModuleBackups (Split-Path $path -Parent)
		return
	}

	$parent = Split-Path $path -Parent
	$stamp = Get-Date -Format 'yyyyMMddHHmmss'
	$bakName = "node_modules.win.bak.$stamp"

	Write-Host "==> Deplacement $RelativePath -> $(Split-Path $RelativePath -Parent)\$bakName" -ForegroundColor Yellow
	try {
		Rename-Item -LiteralPath $path -NewName $bakName -Force
	} catch {
		throw @"
Impossible de deplacer $RelativePath (fichiers verrouilles, ex. esbuild.exe).
Relancez avec -StopWatch ou fermez watch / code.bat manuellement :
  .\drox-engine\docs\operations\scripts\wsl-linux-build.ps1

Erreur : $($_.Exception.Message)
"@
	}

	Remove-OldModuleBackups $parent
}

Write-Host 'Drox IDE - preparation build Linux (Windows)' -ForegroundColor Cyan
Write-Host "Repo: $repoRoot"
Write-Host ''

if ($StopWatch) {
	Stop-RepoDevProcesses
} else {
	Write-Host 'Astuce : wsl-linux-build.ps1 active -StopWatch par defaut.' -ForegroundColor DarkYellow
	Write-Host ''
}

Assert-NoRepoDevProcesses

foreach ($rel in $nestedModuleDirs) {
	Move-Aside-NestedModules -RelativePath $rel
}

foreach ($rel in $postinstallState) {
	$path = Join-Path $repoRoot $rel
	if (Test-Path -LiteralPath $path) {
		Write-Host "==> Suppression $rel (force postinstall Linux)" -ForegroundColor DarkGray
		Remove-Item -LiteralPath $path -Force
	}
}

Write-Host ''
Write-Host 'OK — pret pour wsl-linux-build.ps1' -ForegroundColor Green
