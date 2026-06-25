# Launch Drox IDE Linux release build inside WSL Ubuntu.
#
# Usage (PowerShell, from repo root):
#   .\drox-engine\docs\operations\scripts\wsl-linux-build.ps1
#   .\drox-engine\docs\operations\scripts\wsl-linux-build.ps1 -Distro Ubuntu-24.04
#   .\drox-engine\docs\operations\scripts\wsl-linux-build.ps1 -StopWatch:$false
#
# First run: 1-3 h (npm + gulp). Log: .build/wsl-linux-build.log
# Doc: ../04-RELEASE-LINUX.md · ../06-HOTFIX-LATEST.md

[CmdletBinding()]
param(
	[string]$Distro = '',
	[switch]$StopWatch
)

$ErrorActionPreference = 'Stop'

# Release build: stop watch/code.bat by default (shared node_modules on /mnt/c).
if (-not $PSBoundParameters.ContainsKey('StopWatch')) {
	$StopWatch = $true
}

if (-not $Distro) {
	$installed = @(wsl -l -q | ForEach-Object { $_.Trim() } | Where-Object { $_ })
	if ($installed -contains 'Ubuntu-24.04') {
		$Distro = 'Ubuntu-24.04'
	} elseif ($installed -contains 'Ubuntu') {
		$Distro = 'Ubuntu'
	} else {
		$Distro = $installed[0]
	}
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$drive = $repoRoot.Substring(0, 1).ToLowerInvariant()
$rest = ($repoRoot.Substring(2) -replace '\\', '/').TrimStart('/')
$wslScript = "/mnt/$drive/$rest/drox-engine/docs/operations/scripts/wsl-linux-build.sh"

Write-Host 'Drox IDE - Linux build via WSL' -ForegroundColor Cyan -NoNewline
Write-Host " ($Distro)"
Write-Host "Repo (WSL): /mnt/$drive/$rest"
Write-Host "Log:        $repoRoot\.build\wsl-linux-build.log"
Write-Host ''

& (Join-Path $PSScriptRoot 'prepare-wsl-linux-build.ps1') -StopWatch:$StopWatch

Write-Host ''
Write-Host "Setting default WSL distro to $Distro..." -ForegroundColor Yellow
wsl --set-default $Distro

Write-Host 'Starting build in WSL (sudo password may be requested)...' -ForegroundColor Yellow
Write-Host ''

wsl -d $Distro -- bash -lc "chmod +x '$wslScript' && '$wslScript'"
$wslExit = $LASTEXITCODE

$restoreScript = Join-Path $PSScriptRoot 'restore-windows-dev.ps1'
Write-Host ''
Write-Host 'Restoring Windows npm shims (required after WSL build)...' -ForegroundColor Yellow
& $restoreScript
if (-not $?) {
	Write-Warning 'restore-windows-dev.ps1 failed — run it manually before npm run watch / code.bat.'
}

if ($wslExit -ne 0) {
	Write-Error "WSL build failed (exit $wslExit). See .build/wsl-linux-build.log"
}

Write-Host ''
Write-Host 'Build finished.' -ForegroundColor Green
$upload = Join-Path (Split-Path -Parent $repoRoot) 'Drox---IDE---OR\_upload'
if (Test-Path $upload) {
	Get-ChildItem $upload -Filter '*.deb' | ForEach-Object { Write-Host "  $($_.FullName)" }
}
