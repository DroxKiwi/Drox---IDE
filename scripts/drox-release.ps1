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

. (Join-Path $PSScriptRoot 'lib\drox-bundle-readiness.ps1')
Initialize-DroxBundleReadiness -RepoRoot $repoRoot

function Write-Banner([string]$Title) {
	Write-Host ''
	Write-Host ('=== {0} ===' -f $Title) -ForegroundColor Cyan
}

function Assert-ExternalExitSuccess {
	if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Assert-DroxBundleReadyForFastRelease {
	$issues = @(Get-DroxBundleReadinessIssues)
	if ($issues.Count -eq 0) { return }
	throw @"
[drox-release] -Fast refuse : le bundle n'est pas aligne sur droxVersion $(Get-PackageDroxVersion).
$(Format-DroxBundleReadinessReport -Issues $issues)
"@
}

function Invoke-BuildRelease {
	$buildScript = Join-Path $PSScriptRoot 'build-release-win32.ps1'
	# Hashtable splatting requis : un tableau de chaines (-WithSetup, etc.) est lie
	# en positionnel et atterrit sur DroxProfile (ValidateSet release|debug).
	$buildParams = @{ WithSetup = $true }
	if (-not $Full) { $buildParams.SkipNpmInstall = $true }
	if ($Fast) {
		Assert-DroxBundleReadyForFastRelease
		$buildParams.SkipCompile = $true
	}
	if ($Force) { $buildParams.ForceCompile = $true }
	if ($Force -and $Fast) {
		Write-Host '[drox-release] -Force ignore -Fast.' -ForegroundColor Yellow
		$buildParams.Remove('SkipCompile')
	}
	& $buildScript @buildParams
	Assert-ExternalExitSuccess
}

function Invoke-SyncWizard {
	$wizardScript = Join-Path $repoRoot 'scripts\sync-drox-inno-wizard.ps1'
	if (Test-Path $wizardScript) {
		Write-Banner 'Wizard Inno (BMP)'
		& $wizardScript
		Assert-ExternalExitSuccess
	}
}

function Invoke-PublishManifests {
	$noticeScript = Join-Path $repoRoot 'scripts\sync-release-notice.ps1'
	if (Test-Path $noticeScript) {
		& $noticeScript
		Assert-ExternalExitSuccess
	}
	$publishScript = Join-Path $PSScriptRoot 'release-publish-win32.ps1'
	$publishParams = @{}
	if ($ProductVersion) { $publishParams.ProductVersion = $ProductVersion }
	if ($DryRun) { $publishParams.DryRun = $true }
	& $publishScript @publishParams
	Assert-ExternalExitSuccess
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
		Assert-ExternalExitSuccess
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
		Assert-ExternalExitSuccess
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
