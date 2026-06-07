# Drox IDE - garde-fous release : bundle out-vscode-min + moteur alignes sur package.json (droxVersion).
# Dot-source depuis build-release-win32.ps1 et drox-release.ps1.

$script:DroxMinBundleMarker = 'resolved bundled engine'
$script:DroxBundleStampName = 'drox-bundle-stamp.json'

# Fichiers compiles requis (architecture chat / IDE 1.3.2+).
$script:DroxBundleSentinels = @(
	'vs\workbench\contrib\drox\browser\media\droxChat\session\lazy-history.js',
	'vs\workbench\contrib\drox\browser\media\droxChat\core\00-bootstrap.js',
	'vs\workbench\contrib\drox\browser\droxTelemetryContribution.js',
	'vs\workbench\contrib\drox\browser\droxHelpMenuContribution.js'
)

# Reliquats d'un vieux bundle (monolithe webview) - ne doivent plus etre dans out-vscode-min.
$script:DroxStaleBundleArtifacts = @(
	'vs\workbench\contrib\drox\browser\media\droxChat\00-context.js',
	'vs\workbench\contrib\drox\browser\media\droxChat\07-log.js',
	'vs\workbench\contrib\drox\browser\media\droxChat\09-host.js'
)

$script:DroxSourceRoots = @(
	'src\vs\workbench\contrib\drox',
	'drox-engine\drox\crates\drox-cli',
	'drox-engine\drox\crates\drox-engine'
)

function Initialize-DroxBundleReadiness {
	param([string]$RepoRoot)
	$script:DroxRepoRoot = $RepoRoot
	$script:DroxMinDir = Join-Path $RepoRoot 'out-vscode-min'
}

function Get-PackageDroxVersion {
	$pkgPath = Join-Path $script:DroxRepoRoot 'package.json'
	$pkg = Get-Content -Raw -Path $pkgPath | ConvertFrom-Json
	if ($pkg.droxVersion) { return [string]$pkg.droxVersion }
	return [string]$pkg.version
}

function Get-DroxBundleStampPath {
	param([string]$BaseDir = $script:DroxMinDir)
	Join-Path $BaseDir $script:DroxBundleStampName
}

function Get-GitHeadShort {
	Push-Location $script:DroxRepoRoot
	try {
		$head = (& git rev-parse --short HEAD 2>$null)
		if ($LASTEXITCODE -eq 0 -and $head) { return [string]$head.Trim() }
	} finally {
		Pop-Location
	}
	return $null
}

function Write-DroxBundleStamp {
	$stampPath = Get-DroxBundleStampPath
	$pkg = Get-Content -Raw (Join-Path $script:DroxRepoRoot 'package.json') | ConvertFrom-Json
	$payload = [ordered]@{
		droxVersion = Get-PackageDroxVersion
		vscodeBaseVersion = [string]$pkg.version
		builtAt = (Get-Date).ToUniversalTime().ToString('o')
		gitHead = Get-GitHeadShort
	}
	$json = $payload | ConvertTo-Json -Compress
	$utf8 = New-Object System.Text.UTF8Encoding $false
	[System.IO.File]::WriteAllText($stampPath, $json, $utf8)
	Write-Host "[drox-bundle] stamp ecrit : $stampPath ($($payload.droxVersion))" -ForegroundColor Green
}

function Read-DroxBundleStamp {
	param([string]$BaseDir = $script:DroxMinDir)
	$stampPath = Get-DroxBundleStampPath -BaseDir $BaseDir
	if (-not (Test-Path $stampPath)) { return $null }
	try {
		return Get-Content -Raw -Path $stampPath | ConvertFrom-Json
	} catch {
		return $null
	}
}

function Test-DroxEngineResolverInMinBundle {
	param([string]$BaseDir = $script:DroxMinDir)
	$mainJs = Join-Path $BaseDir 'main.js'
	if (-not (Test-Path $mainJs)) { return $false }
	return [bool](Select-String -Path $mainJs -Pattern $script:DroxMinBundleMarker -Quiet -ErrorAction SilentlyContinue)
}

function Get-LatestWriteTimeUnder {
	param(
		[string]$Root,
		[string[]]$Extensions = @('*.ts', '*.js', '*.css', '*.rs', '*.toml')
	)
	if (-not (Test-Path $Root)) { return $null }
	$latest = $null
	foreach ($ext in $Extensions) {
		Get-ChildItem -Path $Root -Recurse -File -Filter $ext -ErrorAction SilentlyContinue |
			Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.git\\|target\\|out-vscode' } |
			ForEach-Object {
				if (-not $latest -or $_.LastWriteTimeUtc -gt $latest) {
					$latest = $_.LastWriteTimeUtc
				}
			}
	}
	return $latest
}

function Get-DroxBundleBuiltAtUtc {
	param([string]$BaseDir = $script:DroxMinDir)
	$stamp = Read-DroxBundleStamp -BaseDir $BaseDir
	if ($stamp -and $stamp.builtAt) {
		try { return [datetime]::Parse($stamp.builtAt).ToUniversalTime() } catch { }
	}
	$mainJs = Join-Path $BaseDir 'main.js'
	if (Test-Path $mainJs) {
		return (Get-Item $mainJs).LastWriteTimeUtc
	}
	return $null
}

function Get-DroxBundleReadinessIssues {
	param([string]$BaseDir = $script:DroxMinDir)

	$issues = [System.Collections.Generic.List[string]]::new()
	$expectedVersion = Get-PackageDroxVersion

	$preload = Join-Path $BaseDir 'vs\base\parts\sandbox\electron-browser\preload.js'
	$chatCss = Join-Path $BaseDir 'vs\workbench\contrib\drox\browser\media\droxChatMvp.css'
	if (-not (Test-Path $preload)) { $issues.Add('preload.js manquant dans le bundle min') }
	if (-not (Test-Path $chatCss)) { $issues.Add('droxChatMvp.css manquant dans le bundle min') }
	if (-not (Test-DroxEngineResolverInMinBundle -BaseDir $BaseDir)) {
		$issues.Add("marqueur moteur '$($script:DroxMinBundleMarker)' absent de main.js")
	}

	foreach ($rel in $script:DroxBundleSentinels) {
		$p = Join-Path $BaseDir $rel
		if (-not (Test-Path $p)) {
			$issues.Add("sentinelle manquante : $rel")
		}
	}

	foreach ($rel in $script:DroxStaleBundleArtifacts) {
		$p = Join-Path $BaseDir $rel
		if (Test-Path $p) {
			$issues.Add("artefact obsolete present (vieux bundle) : $rel")
		}
	}

	$stamp = Read-DroxBundleStamp -BaseDir $BaseDir
	if (-not $stamp) {
		$issues.Add("fichier $($script:DroxBundleStampName) absent - rebundle obligatoire (-ForceCompile)")
	} elseif ([string]$stamp.droxVersion -ne $expectedVersion) {
		$issues.Add("stamp droxVersion=$($stamp.droxVersion) != package.json droxVersion=$expectedVersion")
	}

	$bundleBuiltAt = Get-DroxBundleBuiltAtUtc -BaseDir $BaseDir
	if ($bundleBuiltAt) {
		foreach ($relRoot in $script:DroxSourceRoots) {
			$abs = Join-Path $script:DroxRepoRoot $relRoot
			$latest = Get-LatestWriteTimeUnder -Root $abs
			if ($latest -and $latest -gt $bundleBuiltAt.AddSeconds(2)) {
				$issues.Add("sources plus recentes que le bundle : $relRoot (max $($latest.ToString('o')) > bundle $($bundleBuiltAt.ToString('o')))")
			}
		}
	}

	$embeddedEngine = Join-Path $script:DroxRepoRoot 'resources\drox\win32-x64\drox.exe'
	if (Test-Path $embeddedEngine) {
		$engineLatest = Get-LatestWriteTimeUnder -Root (Join-Path $script:DroxRepoRoot 'drox-engine\drox\crates') -Extensions @('*.rs', '*.toml')
		if ($engineLatest -and (Get-Item $embeddedEngine).LastWriteTimeUtc -lt $engineLatest.AddSeconds(-5)) {
			$issues.Add('resources/drox/win32-x64/drox.exe plus ancien que les sources Rust - relancer package-drox')
		}
	}

	return $issues
}

function Test-OutVscodeMinReady {
	param([string]$BaseDir = $script:DroxMinDir)
	return (Get-DroxBundleReadinessIssues -BaseDir $BaseDir).Count -eq 0
}

function Format-DroxBundleReadinessReport {
	param([string[]]$Issues)
	if ($Issues.Count -eq 0) { return 'Bundle min pret pour la release.' }
	$lines = @('[drox-bundle] Bundle min NON pret pour droxVersion ' + (Get-PackageDroxVersion) + ' :')
	foreach ($i in $Issues) { $lines += "  - $i" }
	$lines += ''
	$lines += 'Corrigez avec :'
	$lines += '  npm run drox:ship -- -Force'
	$lines += '  # ou .\scripts\build-release-win32.ps1 -SkipNpmInstall -ForceCompile -WithSetup'
	return ($lines -join [Environment]::NewLine)
}

function Test-DroxEngineFingerprintModern {
	param([string]$ExePath)
	if (-not (Test-Path -LiteralPath $ExePath)) { return $false }
	$bytes = [System.IO.File]::ReadAllBytes($ExePath)
	$text = [System.Text.Encoding]::UTF8.GetString($bytes)
	return ($text -match 'orchestration role_split') -and -not ($text -match 'gate chain step')
}

function Get-PackagedReleaseIntegrityIssues {
	param(
		[string]$PackagedDir,
		[string]$ExpectedVersion = (Get-PackageDroxVersion)
	)

	$issues = [System.Collections.Generic.List[string]]::new()
	$appOut = Join-Path $PackagedDir 'resources\app\out'

	if (-not (Test-Path (Join-Path $PackagedDir 'resources\app\product.json'))) {
		$issues.Add('product.json absent dans le package')
	} else {
		$product = Get-Content -Raw (Join-Path $PackagedDir 'resources\app\product.json') | ConvertFrom-Json
		if ([string]$product.droxVersion -ne $ExpectedVersion) {
			$issues.Add("product.json droxVersion=$($product.droxVersion) != attendu $ExpectedVersion")
		}
	}

	$stamp = Read-DroxBundleStamp -BaseDir $appOut
	if (-not $stamp) {
		$issues.Add("$($script:DroxBundleStampName) absent dans resources/app/out")
	} elseif ([string]$stamp.droxVersion -ne $ExpectedVersion) {
		$issues.Add("stamp package droxVersion=$($stamp.droxVersion) != attendu $ExpectedVersion")
	}

	if (-not (Test-DroxEngineResolverInMinBundle -BaseDir $appOut)) {
		$issues.Add("marqueur '$($script:DroxMinBundleMarker)' absent du main.js package")
	}

	foreach ($rel in $script:DroxBundleSentinels) {
		if (-not (Test-Path (Join-Path $appOut $rel))) {
			$issues.Add("package : sentinelle manquante $rel")
		}
	}
	foreach ($rel in $script:DroxStaleBundleArtifacts) {
		if (Test-Path (Join-Path $appOut $rel)) {
			$issues.Add("package : artefact obsolete $rel")
		}
	}

	$droxBinCandidates = @(
		(Join-Path $PackagedDir 'resources\drox\win32-x64\drox.exe')
		(Join-Path $PackagedDir 'resources\app\resources\drox\win32-x64\drox.exe')
	)
	$droxBin = $droxBinCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
	if (-not $droxBin) {
		$issues.Add('drox.exe embarque introuvable')
	} elseif (-not (Test-DroxEngineFingerprintModern -ExePath $droxBin)) {
		$issues.Add("drox.exe embarque n'est pas MODERN (role_split) : $droxBin")
	}

	return $issues
}

function Format-PackagedReleaseIntegrityReport {
	param([string[]]$Issues, [string]$PackagedDir)
	if ($Issues.Count -eq 0) { return "Package $PackagedDir aligne sur droxVersion $(Get-PackageDroxVersion)." }
	$lines = @("[drox-bundle] Package NON aligne ($PackagedDir) :")
	foreach ($i in $Issues) { $lines += "  - $i" }
	$lines += ''
	$lines += 'Relancez : npm run drox:ship -- -Force'
	return ($lines -join [Environment]::NewLine)
}
