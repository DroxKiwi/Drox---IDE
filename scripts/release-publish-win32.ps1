# Publish Drox IDE win32 installer artifacts to the drox-ide-releases repo.
#
# Prerequisite: build with setup (garde-fous alignement droxVersion)
#   npm run drox:ship -- -Force
#
# Usage:
#   .\scripts\release-publish-win32.ps1
#   .\scripts\release-publish-win32.ps1 -ProductVersion 1.3.1 -SetupExe .\path\setup.exe

[CmdletBinding()]
param(
	[string]$ProductVersion = '',
	[string]$SetupExe = '',
	[string]$ReleasesRepo = '',
	[string]$GitHubOrg = 'DroxKiwi',
	[string]$GitHubRepo = 'Drox---IDE',
	[switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-DroxProductVersionFromJson {
	$pkgPath = Join-Path $repoRoot 'package.json'
	$pkg = Get-Content -Raw -Path $pkgPath | ConvertFrom-Json
	if ($pkg.droxVersion) { return [string]$pkg.droxVersion }
	return '1.3.1'
}

if (-not $ProductVersion) {
	$ProductVersion = Get-DroxProductVersionFromJson
}

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
	$utf8 = New-Object System.Text.UTF8Encoding $false
	[System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Write-Utf8NoBomLines([string]$Path, [string[]]$Lines) {
	$utf8 = New-Object System.Text.UTF8Encoding $false
	[System.IO.File]::WriteAllLines($Path, $Lines, $utf8)
}

if (-not $ReleasesRepo) {
	$ReleasesRepo = $repoRoot
}

if (-not $SetupExe) {
	$setupDir = Join-Path $repoRoot '.build\win32-x64\user-setup'
	if (-not (Test-Path $setupDir)) {
		Write-Error "Dossier installeur introuvable : $setupDir. Relancez le build avec -WithSetup."
	}
	$SetupExe = Get-ChildItem $setupDir -Filter 'Drox-IDE-UserSetup-*.exe' -ErrorAction SilentlyContinue |
		Sort-Object LastWriteTime -Descending |
		Select-Object -First 1 -ExpandProperty FullName
	if (-not $SetupExe) {
		$SetupExe = Get-ChildItem $setupDir -Filter '*.exe' |
			Sort-Object LastWriteTime -Descending |
			Select-Object -First 1 -ExpandProperty FullName
	}
}

if (-not $SetupExe -or -not (Test-Path $SetupExe)) {
	Write-Error 'Installeur introuvable. Passez -SetupExe ou generez-le avec -WithSetup.'
}

$packagedDir = Join-Path (Split-Path -Parent $repoRoot) 'VSCode-win32-x64'
if (Test-Path $packagedDir) {
	. (Join-Path $PSScriptRoot 'lib\drox-bundle-readiness.ps1')
	Initialize-DroxBundleReadiness -RepoRoot $repoRoot
	$publishIssues = @(Get-PackagedReleaseIntegrityIssues -PackagedDir $packagedDir -ExpectedVersion $ProductVersion)
	if ($publishIssues.Count -gt 0) {
		throw (Format-PackagedReleaseIntegrityReport -Issues $publishIssues -PackagedDir $packagedDir)
	}
	Write-Host "[release-publish] Package aligne sur droxVersion $ProductVersion." -ForegroundColor Green
}

if (-not (Test-Path $ReleasesRepo)) {
	Write-Error "Repo releases introuvable : $ReleasesRepo"
}

$setupName = "Drox-IDE-Setup-$ProductVersion-win32-x64.exe"
$versionDir = Join-Path $ReleasesRepo "stable\$ProductVersion"
$stableDir = Join-Path $ReleasesRepo 'stable'
# Installeur : hors git (limite GitHub 100 Mo) — upload via gh release create
$uploadDir = Join-Path $ReleasesRepo '_upload'
$destSetup = Join-Path $uploadDir $setupName
$shaFile = Join-Path $versionDir 'SHA256SUMS'
$releaseNotes = Join-Path $versionDir 'RELEASE_NOTES.md'
$latestJson = Join-Path $stableDir 'latest.json'

Write-Host "Source setup : $SetupExe"
Write-Host "Version      : $ProductVersion"
Write-Host "Dest repo    : $ReleasesRepo"

$hash = (Get-FileHash -Algorithm SHA256 -Path $SetupExe).Hash.ToLowerInvariant()
$sizeBytes = (Get-Item $SetupExe).Length
$released = (Get-Date -Format 'yyyy-MM-dd')
$downloadBase = "https://github.com/$GitHubOrg/$GitHubRepo/releases/download/v$ProductVersion"

$manifest = [ordered]@{
	version        = $ProductVersion
	released       = $released
	productVersion = $ProductVersion
	platforms      = [ordered]@{
		'win32-x64' = [ordered]@{
			installerUrl = "$downloadBase/$setupName"
			sha256       = $hash
			sizeBytes    = $sizeBytes
		}
	}
	mandatory      = $false
	notesUrl       = "https://github.com/$GitHubOrg/$GitHubRepo/blob/main/stable/$ProductVersion/RELEASE_NOTES.md"
}

if ($DryRun) {
	Write-Host '[dry-run] SHA256:' $hash
	Write-Host '[dry-run] Size:' $sizeBytes
	$manifest | ConvertTo-Json -Depth 5 | Write-Host
	return
}

New-Item -ItemType Directory -Force -Path $versionDir, $uploadDir | Out-Null
Copy-Item -Force $SetupExe $destSetup
Write-Host "Copie (hors git, pour gh release) -> $destSetup"

Write-Utf8NoBomLines $shaFile @("$hash  $setupName")
Write-Host "SHA256 -> $shaFile"

if (-not (Test-Path $releaseNotes)) {
	Write-Utf8NoBomLines $releaseNotes @(
		"# Drox IDE $ProductVersion",
		'',
		'## Nouveautés',
		'- Première distribution packagée Windows (installeur user).',
		'- Moteur Drox embarqué (`resources/drox/`).',
		'- Chat Drox + intégration Ollama.',
		'',
		'## Prérequis',
		'- Windows 10 ou plus récent (64 bits)',
		'- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (souvent déjà installé)',
		'- [Ollama](https://ollama.com/) pour le chat local (optionnel mais recommandé)',
		'',
		'## Licence',
		'Basé sur Code OSS (MIT). Voir [NOTICE.md](../../NOTICE.md).'
	)
	Write-Host "RELEASE_NOTES cree -> $releaseNotes"
}

$mergeManifest = Join-Path $repoRoot 'scripts\lib\drox-release-manifest.mjs'
& node $mergeManifest merge `
	--releases-repo $ReleasesRepo `
	--version $ProductVersion `
	--platform win32-x64 `
	--installer-url "$downloadBase/$setupName" `
	--sha256 $hash `
	--size-bytes $sizeBytes `
	--released $released
if ($LASTEXITCODE -ne 0) { throw 'drox-release-manifest merge failed' }
Write-Host "latest.json -> $latestJson (merge win32-x64)"

Write-Host ''
Write-Host 'Manifestes prepares (versionnes dans git).' -ForegroundColor Green
Write-Host "Installeur local : $destSetup (dossier _upload/, gitignore)" -ForegroundColor Yellow
Write-Host ''
Write-Host 'Etapes GitHub :'
Write-Host "  1. cd `"$ReleasesRepo`""
Write-Host '  2. git add .gitignore stable/ NOTICE.md README.md'
Write-Host "  3. git commit -m `"Release v$ProductVersion win32-x64 (manifest)`""
Write-Host '  4. git push'
Write-Host "  5. gh release create v$ProductVersion `"$destSetup`" --repo $GitHubOrg/$GitHubRepo --title `"Drox IDE $ProductVersion`" --notes-file `"$releaseNotes`""
