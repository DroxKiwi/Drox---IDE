# Installe ou verifie Inno Setup 6.6+ pour compiler l'installeur Drox (dark mode natif).
# Le paquet npm "innosetup" embarque encore ISCC 6.4.1 — insuffisant pour WizardStyle=dark.
#
# Usage:
#   .\scripts\ensure-inno-setup.ps1
#   .\scripts\ensure-inno-setup.ps1 -Vendor   # extrait ISCC dans build\win32\inno-setup-6 (CI / sans winget)

[CmdletBinding()]
param(
	[switch]$Vendor,
	[string]$Version = '6.7.3'
)

$ErrorActionPreference = 'Stop'
$MinVersion = [version]'6.6.0'

$repoRoot = Split-Path -Parent $PSScriptRoot
$vendorDir = Join-Path $repoRoot 'build\win32\inno-setup-6'
$vendorIscc = Join-Path $vendorDir 'ISCC.exe'

function Get-IsccVersion([string]$IsccPath) {
	if (-not (Test-Path -LiteralPath $IsccPath)) { return $null }
	return (Get-Item -LiteralPath $IsccPath).VersionInfo.ProductVersion
}

function Get-IsccCopyrightYear([string]$IsccPath) {
	if (-not (Test-Path -LiteralPath $IsccPath)) { return $null }
	$out = [string](cmd /c "`"$IsccPath`" 2>&1")
	if ($out -match 'Copyright \(C\) 1997-(\d{4})') { return [int]$Matches[1] }
	return $null
}

function Test-IsccOk([string]$IsccPath) {
	if ($IsccPath -like '*\node_modules\innosetup\*') { return $false }
	if (-not (Test-Path -LiteralPath $IsccPath)) { return $false }
	$v = Get-IsccVersion $IsccPath
	if ($v) {
		try { if ([version]$v -ge $MinVersion) { return $true } } catch { }
	}
	$year = Get-IsccCopyrightYear $IsccPath
	return ($year -ge 2026)
}

function Find-ExistingIscc {
	if ($env:INNO_SETUP_ISCC -and (Test-IsccOk $env:INNO_SETUP_ISCC)) {
		return @{ Path = $env:INNO_SETUP_ISCC; Source = 'INNO_SETUP_ISCC' }
	}
	if (Test-IsccOk $vendorIscc) {
		return @{ Path = $vendorIscc; Source = 'vendored' }
	}
	foreach ($root in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
		if (-not $root) { continue }
		$p = Join-Path $root 'Inno Setup 6\ISCC.exe'
		if (Test-IsccOk $p) {
			return @{ Path = $p; Source = $root }
		}
	}
	if ($env:LOCALAPPDATA) {
		$p = Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'
		if (Test-IsccOk $p) {
			return @{ Path = $p; Source = 'LOCALAPPDATA' }
		}
	}
	return $null
}

function Install-VendoredInno {
	$tag = "is_6_7_3"
	if ($Version -ne '6.7.3') {
		Write-Warning "Vendor automatique teste pour 6.7.3 ; version demandee: $Version"
	}
	$url = "https://github.com/jrsoftware/issrc/releases/download/$tag/innosetup-$Version.exe"
	$installer = Join-Path $env:TEMP "innosetup-$Version.exe"

	Write-Host "[ensure-inno] Telechargement Inno Setup $Version ..."
	Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing

	New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null
	Write-Host "[ensure-inno] Installation silencieuse -> $vendorDir"
	$proc = Start-Process -FilePath $installer -ArgumentList @(
		'/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/NOICONS',
		"/DIR=$vendorDir"
	) -Wait -PassThru
	if ($proc.ExitCode -ne 0) {
		throw "Installateur Inno a quitte avec le code $($proc.ExitCode)"
	}
	Remove-Item -Force $installer -ErrorAction SilentlyContinue
}

$found = Find-ExistingIscc
if ($found) {
	$banner = Get-IsccCopyrightYear $found.Path
	$label = if ($banner) { "banner $banner" } else { "v$(Get-IsccVersion $found.Path)" }
	Write-Host "[ensure-inno] OK: $($found.Path) ($label, $($found.Source))"
	exit 0
}

if ($Vendor) {
	Install-VendoredInno
	if (Test-IsccOk $vendorIscc) {
		Write-Host "[ensure-inno] OK: $vendorIscc (v$(Get-IsccVersion $vendorIscc))"
		exit 0
	}
	throw "ISCC vendored introuvable apres installation: $vendorIscc"
}

Write-Host '[ensure-inno] Inno Setup 6.6+ absent. Tentative winget ...'
$winget = Get-Command winget -ErrorAction SilentlyContinue
if ($winget) {
	& winget install --id JRSoftware.InnoSetup -e --accept-package-agreements --accept-source-agreements 2>&1 | Out-Host
	$found = Find-ExistingIscc
	if ($found) {
		Write-Host "[ensure-inno] OK: $($found.Path) (banner $(Get-IsccCopyrightYear $found.Path), $($found.Source))"
		exit 0
	}
}

Write-Host '[ensure-inno] winget indisponible ou echec. Utilisez -Vendor pour extraire ISCC dans le repo.'
Write-Host '  .\scripts\ensure-inno-setup.ps1 -Vendor'
exit 1
