# Launch Drox IDE Linux release build inside WSL Ubuntu.
#
# Usage (PowerShell, from repo root):
#   .\scripts\wsl-linux-build.ps1
#   .\scripts\wsl-linux-build.ps1 -Distro Ubuntu
#
# First run: 1-3 h (npm + gulp). Log: .build/wsl-linux-build.log

[CmdletBinding()]
param(
	# Prefer Ubuntu-24.04 when installed: default "Ubuntu" is often Ubuntu 26.04 (nvm / dpkg-shlibdeps fail there).
	[string]$Distro = ''
)

$ErrorActionPreference = 'Stop'

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
$repoRoot = Split-Path -Parent $PSScriptRoot
$wslScript = '/mnt/c/Users/coren/Desktop/GitHub/Drox---IDE/scripts/wsl-linux-build.sh'

# Derive WSL path from actual repo location (handles non-default clone path)
$drive = $repoRoot.Substring(0, 1).ToLowerInvariant()
$rest = $repoRoot.Substring(2) -replace '\\', '/'
$wslScript = "/mnt/$drive/$rest/scripts/wsl-linux-build.sh"

Write-Host "Drox IDE - Linux build via WSL ($Distro)" -ForegroundColor Cyan
Write-Host "Repo (WSL): /mnt/$drive/$rest"
Write-Host "Log:        $repoRoot\.build\wsl-linux-build.log"
Write-Host ""
Write-Host "Setting default WSL distro to $Distro..." -ForegroundColor Yellow
wsl --set-default $Distro

Write-Host "Starting build in WSL (sudo password may be requested)..." -ForegroundColor Yellow
Write-Host ""

wsl -d $Distro -- bash -lc "chmod +x '$wslScript' && '$wslScript'"

if ($LASTEXITCODE -ne 0) {
	Write-Error "WSL build failed (exit $LASTEXITCODE). See .build/wsl-linux-build.log"
}

Write-Host ""
Write-Host "Build finished." -ForegroundColor Green
$upload = Join-Path (Split-Path -Parent $repoRoot) 'Drox---IDE---OR\_upload'
if (Test-Path $upload) {
	Get-ChildItem $upload -Filter '*.deb' | ForEach-Object { Write-Host "  $($_.FullName)" }
}
