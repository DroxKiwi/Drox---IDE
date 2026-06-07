# Verifie les artefacts legaux requis avant ship Drox IDE (D2.1).
#
# Usage:
#   .\scripts\verify-legal-package.ps1
#   .\scripts\verify-legal-package.ps1 -PackagedDir ..\VSCode-win32-x64

[CmdletBinding()]
param(
	[string]$PackagedDir = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

$requiredRoot = @(
	'LICENSE.txt',
	'ThirdPartyNotices.txt',
	'NOTICE-DROX.txt',
	'LICENSE-INSTALL.txt'
)

$failures = @()

foreach ($rel in $requiredRoot) {
	$path = Join-Path $repoRoot $rel
	if (-not (Test-Path $path)) {
		$failures += "Fichier racine manquant : $rel"
		continue
	}
	if ((Get-Item $path).Length -lt 32) {
		$failures += "Fichier racine trop court : $rel"
	}
}

$tpn = Join-Path $repoRoot 'ThirdPartyNotices.txt'
if (Test-Path $tpn) {
	$tpnText = Get-Content -Raw -Path $tpn
	if ($tpnText -notmatch 'NOTICES') {
		$failures += 'ThirdPartyNotices.txt : entete NOTICES introuvable'
	}
	if ($tpnText.Length -lt 5000) {
		$failures += 'ThirdPartyNotices.txt : contenu suspect (trop court)'
	}
}

if ($PackagedDir) {
	$appRoot = Join-Path $PackagedDir 'resources\app'
	if (-not (Test-Path $appRoot)) {
		$failures += "Package introuvable : $appRoot"
	} else {
		foreach ($rel in @('LICENSE.txt', 'ThirdPartyNotices.txt', 'NOTICE-DROX.txt')) {
			$path = Join-Path $appRoot $rel
			if (-not (Test-Path $path)) {
				$failures += "Package sans $rel sous resources/app"
			}
		}
	}
}

if ($failures.Count -gt 0) {
	Write-Host '[verify-legal-package] ECHEC' -ForegroundColor Red
	foreach ($f in $failures) { Write-Host "  - $f" }
	exit 1
}

Write-Host '[verify-legal-package] OK — LICENSE.txt, ThirdPartyNotices.txt, NOTICE-DROX.txt, LICENSE-INSTALL.txt' -ForegroundColor Green
Write-Host '  Regeneration complete ThirdPartyNotices : outil OSS Microsoft (rebase upstream) si deps changent.' -ForegroundColor DarkGray
