# Synchronise NOTICE.md vers le repo releases (D2.3).
#
# Usage:
#   .\scripts\sync-release-notice.ps1
#   .\scripts\sync-release-notice.ps1 -ReleasesRepo C:\path\other -Force

[CmdletBinding()]
param(
	[string]$ReleasesRepo = '',
	[switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$template = Join-Path $repoRoot 'scripts\templates\NOTICE.md'

if (-not (Test-Path $template)) {
	Write-Error "Template introuvable : $template"
}

if (-not $ReleasesRepo) {
	$ReleasesRepo = $repoRoot
}

if (-not (Test-Path $ReleasesRepo)) {
	Write-Error "Repo releases introuvable : $ReleasesRepo"
}

# Sources = canal Releases : NOTICE.md racine fait foi, ne pas ecraser avec le template.
$resolvedRoot = (Resolve-Path $repoRoot).Path
$resolvedDestRepo = (Resolve-Path $ReleasesRepo).Path
if ($resolvedRoot -eq $resolvedDestRepo -and -not $Force) {
	Write-Host '[sync-release-notice] NOTICE.md source deja en place (skip)' -ForegroundColor DarkGray
	exit 0
}

$dest = Join-Path $ReleasesRepo 'NOTICE.md'
$srcHash = (Get-FileHash -Algorithm SHA256 -Path $template).Hash
$destHash = if (Test-Path $dest) { (Get-FileHash -Algorithm SHA256 -Path $dest).Hash } else { '' }

if (-not $Force -and $srcHash -eq $destHash) {
	Write-Host '[sync-release-notice] NOTICE.md deja a jour' -ForegroundColor DarkGray
	exit 0
}

$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($dest, (Get-Content -Raw -Path $template), $utf8)
Write-Host "[sync-release-notice] OK -> $dest" -ForegroundColor Green
