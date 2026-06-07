# Drox IDE - pipeline release Windows simplifie (build installeur + manifestes).
#
# Usage:
#   npm run drox:build              # installeur (SkipNpmInstall, compile si besoin)
#   npm run drox:build -- -Fast     # re-package rapide (-SkipCompile)
#   npm run drox:build -- -Force    # rebundle out-vscode-min
#   npm run drox:build -- -Full     # npm install + electron (1er build / icone exe)
#   npm run drox:ship               # build + prepare repo releases (latest.json)
#   npm run drox:publish            # manifestes seulement (setup deja builde)
#
# Voir RULES.md section Build & release Windows.

[CmdletBinding()]
param(
	[ValidateSet('build', 'ship', 'publish')]
	[string]$Action = 'build',

	# Premier build ou changement icone exe : inclut npm install + electron.
	[switch]$Full,

	# Re-package sans recompiler TypeScript (build deja a jour).
	[switch]$Fast,

	# Rebunde out-vscode-min (~15-45 min) apres modif contrib/drox.
	[switch]$Force,

	[switch]$DryRun,
	[string]$ProductVersion = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Write-Banner([string]$Title) {
	Write-Host ''
	Write-Host ('=== {0} ===' -f $Title) -ForegroundColor Cyan
}

function Invoke-BuildRelease {
	$buildScript = Join-Path $PSScriptRoot 'build-release-win32.ps1'
	$buildArgs = @('-WithSetup')
	if (-not $Full) { $buildArgs += '-SkipNpmInstall' }
	if ($Fast) { $buildArgs += '-SkipCompile' }
	if ($Force) { $buildArgs += '-ForceCompile' }
	if ($Force -and $Fast) {
		Write-Host '[drox-release] -Force ignore -Fast.' -ForegroundColor Yellow
		$buildArgs = $buildArgs | Where-Object { $_ -ne '-SkipCompile' }
	}
	& $buildScript @buildArgs
	if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Invoke-SyncWizard {
	$wizardScript = Join-Path $repoRoot 'scripts\sync-drox-inno-wizard.ps1'
	if (Test-Path $wizardScript) {
		Write-Banner 'Wizard Inno (BMP)'
		& $wizardScript
		if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
	}
}

function Invoke-PublishManifests {
	$noticeScript = Join-Path $repoRoot 'scripts\sync-release-notice.ps1'
	if (Test-Path $noticeScript) {
		& $noticeScript
		if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
	}
	$publishScript = Join-Path $PSScriptRoot 'release-publish-win32.ps1'
	$publishArgs = @()
	if ($ProductVersion) { $publishArgs += '-ProductVersion', $ProductVersion }
	if ($DryRun) { $publishArgs += '-DryRun' }
	& $publishScript @publishArgs
	if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Get-DroxVersion {
	$pkg = Get-Content -Raw (Join-Path $repoRoot 'package.json') | ConvertFrom-Json
	if ($pkg.droxVersion) { return [string]$pkg.droxVersion }
	return '1.3.1'
}

$version = if ($ProductVersion) { $ProductVersion } else { Get-DroxVersion }
Write-Host ('Drox release - action={0}  droxVersion={1}' -f $Action, $version) -ForegroundColor Green
if ($Full) { Write-Host '  mode: Full (npm install + electron)' }
elseif ($Fast) { Write-Host '  mode: Fast (-SkipCompile)' }
elseif ($Force) { Write-Host '  mode: Force (-ForceCompile)' }
else { Write-Host '  mode: standard (compile si bundle obsolete)' }

	switch ($Action) {
	'build' {
		& (Join-Path $repoRoot 'scripts\verify-legal-package.ps1')
		if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
		Invoke-SyncWizard
		Write-Banner 'Build F1+F2 (app + installeur)'
		Invoke-BuildRelease
		$setupDir = Join-Path $repoRoot '.build\win32-x64\user-setup'
		Write-Host ''
		Write-Host 'Termine. Installeur :' -ForegroundColor Green
		if (Test-Path $setupDir) {
			Get-ChildItem $setupDir -Filter 'Drox-IDE-UserSetup-*.exe' -ErrorAction SilentlyContinue |
				ForEach-Object { Write-Host ('  {0}' -f $_.FullName) }
		}
		Write-Host ''
		Write-Host 'Suite : npm run drox:ship   (manifestes + instructions gh release)' -ForegroundColor Yellow
	}
	'publish' {
		Write-Banner 'Manifestes (repo releases)'
		Invoke-PublishManifests
	}
	'ship' {
		& (Join-Path $repoRoot 'scripts\verify-legal-package.ps1')
		if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
		Invoke-SyncWizard
		Write-Banner 'Build F1+F2'
		Invoke-BuildRelease
		Write-Banner 'Manifestes F3'
		Invoke-PublishManifests
		Write-Host ''
		Write-Host ('Pipeline termine (droxVersion {0}).' -f $version) -ForegroundColor Green
		Write-Host 'Reste : commit + push dans Drox---IDE---OR, puis gh release create (voir sortie ci-dessus).' -ForegroundColor Yellow
	}
}
