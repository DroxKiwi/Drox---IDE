# Ensure local dogfood uses a fresh `out/` (and optionally aligned drox.exe).
#
# `code.bat` / preLaunch only transpile when `out/main.js` is missing - a half-stale
# `out/` after an arbo n+1 (folder vs old .js) or a dead `npm run watch` is silent.
#
# Usage:
#   .\scripts\ensure-dev-out.ps1              # check + transpile if needed
#   .\scripts\ensure-dev-out.ps1 -Force       # always transpile-client
#   .\scripts\ensure-dev-out.ps1 -CheckOnly   # report, exit 1 if stale (no writes)
#   .\scripts\ensure-dev-out.ps1 -SyncEngine  # also align resources/drox <- target/debug
#   .\scripts\ensure-dev-out.ps1 -Launch      # then .\scripts\code.bat (remaining args)
#   .\scripts\code-dogfood.bat                # wrapper: ensure + launch

param(
	[switch]$Force,
	[switch]$CheckOnly,
	[switch]$SyncEngine,
	[switch]$Launch,
	[ValidateSet('drox', 'all')]
	[string]$Scope = 'drox',
	[Parameter(ValueFromRemainingArguments = $true)]
	[string[]]$LaunchArgs = @()
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Write-Step([string]$msg) { Write-Host "[ensure-dev-out] $msg" }

function Get-SrcRoots {
	switch ($Scope) {
		'drox' { @(Join-Path $repoRoot 'src\vs\workbench\contrib\drox') }
		'all' { @(Join-Path $repoRoot 'src') }
	}
}

function Get-SrcRootPrefix {
	return (Join-Path $repoRoot 'src')
}

function Get-OutPathForSrc([string]$srcFile) {
	$prefix = Get-SrcRootPrefix
	$rel = $srcFile.Substring($prefix.Length).TrimStart('\', '/')
	$outRel = [System.IO.Path]::ChangeExtension($rel, '.js')
	return Join-Path $repoRoot (Join-Path 'out' $outRel)
}

function Get-StaleOutShadows {
	# Arbo n+1: src/foo/index.ts exists but out/foo.js (old monolith) remains.
	$shadows = [System.Collections.Generic.List[string]]::new()
	$prefix = Get-SrcRootPrefix
	foreach ($root in Get-SrcRoots) {
		if (-not (Test-Path -LiteralPath $root)) { continue }
		$dirs = Get-ChildItem -LiteralPath $root -Recurse -Directory -ErrorAction SilentlyContinue
		foreach ($dir in $dirs) {
			$indexTs = Join-Path $dir.FullName 'index.ts'
			if (-not (Test-Path -LiteralPath $indexTs)) { continue }
			$relDir = $dir.FullName.Substring($prefix.Length).TrimStart('\', '/')
			$shadow = Join-Path $repoRoot (Join-Path 'out' ($relDir + '.js'))
			if (Test-Path -LiteralPath $shadow -PathType Leaf) {
				$shadows.Add($shadow)
			}
		}
	}
	return $shadows
}

function Get-OutFreshnessReport {
	$report = [pscustomobject]@{
		Ok      = $true
		Checked = 0
		Reasons = [System.Collections.Generic.List[string]]::new()
		Samples = [System.Collections.Generic.List[string]]::new()
	}

	$mainJs = Join-Path $repoRoot 'out\main.js'
	if (-not (Test-Path -LiteralPath $mainJs)) {
		$report.Ok = $false
		$report.Reasons.Add('out/main.js missing')
		return $report
	}

	foreach ($root in Get-SrcRoots) {
		if (-not (Test-Path -LiteralPath $root)) { continue }
		$files = Get-ChildItem -LiteralPath $root -Recurse -Filter '*.ts' -File -ErrorAction SilentlyContinue |
			Where-Object { $_.Name -notlike '*.d.ts' -and $_.FullName -notmatch '[\\/]typings[\\/]' }
		foreach ($f in $files) {
			$report.Checked++
			$outJs = Get-OutPathForSrc $f.FullName
			$rel = $f.FullName.Substring($repoRoot.Length + 1)
			if (-not (Test-Path -LiteralPath $outJs)) {
				$report.Ok = $false
				$report.Reasons.Add('missing out counterpart')
				if ($report.Samples.Count -lt 8) { $report.Samples.Add("missing out: $rel") }
				continue
			}
			$srcTime = $f.LastWriteTimeUtc
			$outTime = (Get-Item -LiteralPath $outJs).LastWriteTimeUtc
			if ($outTime -lt $srcTime.AddSeconds(-2)) {
				$report.Ok = $false
				$report.Reasons.Add('out older than src')
				if ($report.Samples.Count -lt 8) { $report.Samples.Add("stale: $rel") }
			}
		}
	}

	return $report
}

function Invoke-TranspileClient {
	Write-Step 'npm run transpile-client ...'
	$prev = $ErrorActionPreference
	$ErrorActionPreference = 'Continue'
	try {
		& npm run transpile-client
		if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
	} finally {
		$ErrorActionPreference = $prev
	}
}

function Test-EngineAligned {
	$arch = $env:PROCESSOR_ARCHITECTURE
	$platformFolder = if ($arch -eq 'ARM64') { 'win32-arm64' } else { 'win32-x64' }
	$debug = Join-Path $repoRoot 'drox-engine\drox\target\debug\drox.exe'
	$snap = Join-Path $repoRoot "resources\drox\$platformFolder\drox.exe"
	if (-not (Test-Path -LiteralPath $debug)) {
		return [pscustomobject]@{ Ok = $false; Reason = "missing $debug"; HashDebug = '' }
	}
	if (-not (Test-Path -LiteralPath $snap)) {
		return [pscustomobject]@{ Ok = $false; Reason = "missing $snap"; HashDebug = '' }
	}
	$h1 = (Get-FileHash -LiteralPath $debug -Algorithm SHA256).Hash
	$h2 = (Get-FileHash -LiteralPath $snap -Algorithm SHA256).Hash
	if ($h1 -ne $h2) {
		return [pscustomobject]@{ Ok = $false; Reason = 'hash mismatch debug vs resources'; HashDebug = $h1 }
	}
	return [pscustomobject]@{ Ok = $true; Reason = ''; HashDebug = $h1 }
}

# --- main ---
Write-Step "repo=$repoRoot Scope=$Scope"

$shadows = @(Get-StaleOutShadows)
if ($shadows.Count -gt 0) {
	Write-Step "stale out shadow(s) (n+1 folder vs old .js): $($shadows.Count)"
	$shadows | ForEach-Object { Write-Step "  - $_" }
}

$fresh = Get-OutFreshnessReport
if ($fresh.Ok) {
	Write-Step "freshness OK ($($fresh.Checked) .ts under Scope=$Scope)"
} else {
	Write-Step "freshness STALE ($($fresh.Reasons[0]))"
	$fresh.Samples | ForEach-Object { Write-Step "  - $_" }
}

$dirty = (-not $fresh.Ok) -or ($shadows.Count -gt 0)

if ($CheckOnly) {
	if ($dirty -or $Force) {
		Write-Step 'CheckOnly: STALE - run: .\scripts\ensure-dev-out.ps1   (or code-dogfood.bat)'
		exit 1
	}
	$engine = Test-EngineAligned
	if ($engine.Ok) {
		Write-Step ("engine OK " + $engine.HashDebug.Substring(0, 16) + "...")
	} else {
		Write-Step "engine WARN: $($engine.Reason) (tip: -SyncEngine)"
	}
	Write-Step 'CheckOnly: out OK'
	exit 0
}

if ($shadows.Count -gt 0) {
	foreach ($s in $shadows) {
		Remove-Item -LiteralPath $s -Force
	}
	Write-Step "removed $($shadows.Count) shadow file(s)"
}

if ($Force -or $dirty) {
	if ($Force) { Write-Step 'Force transpile' }
	Invoke-TranspileClient
	$fresh = Get-OutFreshnessReport
	if (-not $fresh.Ok) {
		$fresh.Samples | ForEach-Object { Write-Step "  - $_" }
		Write-Error "out still stale after transpile: $($fresh.Reasons[0])"
	}
	Write-Step 'out OK after transpile'
} else {
	Write-Step 'out already fresh - skip transpile'
}

$engine = Test-EngineAligned
if ($engine.Ok) {
	Write-Step ("engine OK (debug == resources) " + $engine.HashDebug.Substring(0, 16) + "...")
} else {
	Write-Step "engine WARN: $($engine.Reason)"
	if ($SyncEngine) {
		Write-Step 'SyncEngine -> package-drox.ps1 -Profile debug'
		& (Join-Path $PSScriptRoot 'package-drox.ps1') -Profile debug
		if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
		$engine = Test-EngineAligned
		if (-not $engine.Ok) {
			Write-Error "engine still misaligned: $($engine.Reason)"
		}
		Write-Step ("engine OK after sync " + $engine.HashDebug.Substring(0, 16) + "...")
	} else {
		Write-Step 'tip: -SyncEngine  (or .\scripts\package-drox.ps1 -Profile debug)'
	}
}

if ($Launch) {
	Write-Step 'launch scripts\code.bat ...'
	$bat = Join-Path $PSScriptRoot 'code.bat'
	$argLine = if ($LaunchArgs -and $LaunchArgs.Count -gt 0) { ($LaunchArgs | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } }) -join ' ' } else { '' }
	& cmd /c "`"$bat`" $argLine"
	exit $LASTEXITCODE
}

Write-Step 'done - relaunch IDE (.\scripts\code.bat or code-dogfood.bat) to load out/'
exit 0
