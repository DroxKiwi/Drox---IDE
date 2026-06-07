# Verify which Drox engine binary is modern (role_split) vs legacy.
# Usage: .\scripts\verify-drox-engine.ps1 [-Path "...\drox.exe"]

param(
	[string]$Path = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Test-DroxEngineFingerprint {
	param([string]$Exe)
	if (-not (Test-Path -LiteralPath $Exe)) {
		return [pscustomobject]@{ Path = $Exe; Exists = $false }
	}
	$bytes = [System.IO.File]::ReadAllBytes($Exe)
	$text = [System.Text.Encoding]::UTF8.GetString($bytes)
	[pscustomobject]@{
		Path = $Exe
		Exists = $true
		Modern = ($text -match 'orchestration role_split') -and -not ($text -match 'gate chain step')
		LegacyV12 = $text -match 'forcing final orchestration path \(v1_2\)'
		HasGateChain = $text -match 'gate chain step'
	}
}

$targets = @()
if ($Path) {
	$targets += $Path
} else {
	$targets += @(
		(Join-Path $repoRoot 'drox-engine\drox\target\debug\drox.exe'),
		(Join-Path $repoRoot 'drox-engine\drox\target\release\drox.exe'),
		(Join-Path $repoRoot 'resources\drox\win32-x64\drox.exe')
	)
}

Write-Host "Drox engine fingerprint (repo: $repoRoot)`n"
foreach ($t in $targets) {
	$r = Test-DroxEngineFingerprint -Exe $t
	if (-not $r.Exists) {
	 Write-Host "[missing] $($r.Path)"
	 continue
	}
	$label = if ($r.Modern) { 'MODERN (role_split)' } elseif ($r.LegacyV12) { 'LEGACY (v1_2 — rebuild or avoid)' } else { 'UNKNOWN' }
	Write-Host "[$label] $($r.Path)"
	Write-Host "  gate chain: $($r.HasGateChain)  legacy v1_2 string: $($r.LegacyV12)"
}

Write-Host "`nRecommended drox.executablePath:"
Write-Host "  $(Join-Path $repoRoot 'drox-engine\drox\target\debug\drox.exe')"
