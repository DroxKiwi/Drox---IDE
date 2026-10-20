<#
.SYNOPSIS
  Triage rapide d'un arret de run Drox (kill IDE vs orphan tool vs done).

.DESCRIPTION
  Lit un export transcript (+ optionnellement le log terminal code.bat) et classe
  l'arret en bucket : kill_mid_turn | orphan_tool | run_done | unclear.

.EXAMPLE
  .\scripts\diag-drox-run-stop.ps1
.EXAMPLE
  .\scripts\diag-drox-run-stop.ps1 -TranscriptPath docs\exports\latest-transcript.txt -TerminalLog $env:TEMP\drox-code.log
#>
[CmdletBinding()]
param(
	[string] $TranscriptPath = "",
	[string] $TerminalLog = "",
	[int] $TailMessages = 8
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $TranscriptPath) {
	$TranscriptPath = Join-Path $repoRoot "docs\exports\latest-transcript.txt"
}
if (-not (Test-Path -LiteralPath $TranscriptPath)) {
	Write-Error "Transcript introuvable: $TranscriptPath"
}

$raw = Get-Content -LiteralPath $TranscriptPath -Raw -Encoding UTF8
$lines = Get-Content -LiteralPath $TranscriptPath -Encoding UTF8

function Get-HeaderField([string] $text, [string] $label) {
	$m = [regex]::Match($text, "(?m)^${label}:\s*(.+)$")
	if ($m.Success) { return $m.Groups[1].Value.Trim() }
	return $null
}

$sessionId = Get-HeaderField $raw "Session"
$exported = Get-HeaderField $raw "Exported"
$tokens = Get-HeaderField $raw "Tokens \(in/out/ctx\)"
$ws = Get-HeaderField $raw "Workspace"

# --- PARTIE D : derniers messages moteur ---
$partieDIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
	if ($lines[$i] -match '^PARTIE D') { $partieDIdx = $i; break }
}

$engineMsgs = @()
if ($partieDIdx -ge 0) {
	for ($i = $partieDIdx + 1; $i -lt $lines.Count; $i++) {
		if ($lines[$i] -match '^PARTIE [A-Z]') { break }
		$m = [regex]::Match($lines[$i], '^\s*(\d+)\.\s+(USER|ASSISTANT|TOOL)\s+.+')
		if ($m.Success) {
			$engineMsgs += [pscustomobject]@{
				N    = [int]$m.Groups[1].Value
				Role = $m.Groups[2].Value
				Line = $lines[$i].Trim()
			}
		}
	}
}

$last = $engineMsgs | Select-Object -Last 1
$tail = $engineMsgs | Select-Object -Last $TailMessages

$hasOrphanUi = $raw -match 'Run ended without tool result|TOOL RESULT \(orphan|Run cancelled'
$hasExploreStall = $raw -match 'POST-EXPLORE STALL|e2\.post_explore_stall'
$hasArtifactFail = $raw -match 'ARTIFACT READ FAILED|a\.explore_artifact_read_fail|explore_artifact_read_fail'
$fileWriteN = ([regex]::Matches($raw, '### Tool call: file_write\b')).Count
$fileEditN = ([regex]::Matches($raw, '### Tool call: file_edit\b')).Count
$kindReadN = ([regex]::Matches($raw, '### Tool call: file_read[\s\S]{0,400}?\.drox[/\\]subagents[/\\].*?(paths_read|file_summaries|key_symbols|code_snippets|structure_map|gaps)\.md')).Count
$artifactReadN = ([regex]::Matches($raw, '### Tool call: explore_artifact_read\b')).Count

# --- Bucket ---
$bucket = "unclear"
$why = @()

if ($last -and $last.Role -eq "TOOL" -and -not ($raw -match '(?m)agent/done|status.: .(completed|cancelled|error)')) {
	# Heuristique : fin sur tool result sans suite assistant = kill mid-turn probable
	$bucket = "kill_mid_turn"
	$why += "Dernier message moteur = TOOL (pas d'ASSISTANT ensuite) -> run coupee entre tool_finish et prochain tour LLM."
}
if ($hasOrphanUi) {
	$bucket = "orphan_tool"
	$why += "Signal orphan UI present (Run ended without tool result / TOOL RESULT orphan)."
}
# Si PARTIE A dit end of export et last=TOOL -> kill
if ($raw -match 'end of export' -and $last -and $last.Role -eq "TOOL" -and $bucket -ne "orphan_tool") {
	$bucket = "kill_mid_turn"
	if ($why.Count -eq 0) {
		$why += "Export se termine sur un tool result ; pas de tour assistant suivant."
	}
}

# --- Terminal log (dispose / EH) ---
$termHits = @()
$termPaths = @()
if ($TerminalLog -and (Test-Path -LiteralPath $TerminalLog)) {
	$termPaths += $TerminalLog
}
# Heuristique : terminal Cursor du workspace Drox si present
$cursorTerm = Join-Path $env:USERPROFILE ".cursor\projects\c-Users-coren-Desktop-GitHub-Drox-IDE\terminals"
if (Test-Path -LiteralPath $cursorTerm) {
	Get-ChildItem -LiteralPath $cursorTerm -Filter "*.txt" -ErrorAction SilentlyContinue |
		Sort-Object LastWriteTime -Descending |
		Select-Object -First 3 |
		ForEach-Object { $termPaths += $_.FullName }
}

$patterns = @(
	"disposed engine for window",
	"disposed engine for window .* reason=",
	"engine dispose deferred",
	"engine respawn deferred",
	"reused engine for window",
	"Extension host .* exited",
	"UNRESPONSIVE extension host",
	"\[Drox\] agent\.run",
	"\[Drox\] agent\.run failed",
	"\[Drox\] agent\.run recovery"
)

foreach ($tp in ($termPaths | Select-Object -Unique)) {
	$content = Get-Content -LiteralPath $tp -Raw -ErrorAction SilentlyContinue
	if (-not $content) { continue }
	foreach ($pat in $patterns) {
		$matches = [regex]::Matches($content, $pat, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
		if ($matches.Count -gt 0) {
			$termHits += [pscustomobject]@{
				File  = Split-Path -Leaf $tp
				Pattern = $pat
				Count = $matches.Count
			}
		}
	}
}

$disposeHit = $termHits | Where-Object { $_.Pattern -match "disposed engine" }
$ehExitHit = $termHits | Where-Object { $_.Pattern -match "Extension host" }
$unrespHit = $termHits | Where-Object { $_.Pattern -match "UNRESPONSIVE" }

if ($disposeHit -or $ehExitHit) {
	if ($bucket -eq "unclear" -or $bucket -eq "kill_mid_turn") {
		$bucket = "kill_mid_turn"
	}
	$why += "Log terminal : dispose engine / Extension host exit (lifecycle IDE, pas Explore)."
}
if ($unrespHit) {
	$why += "Log terminal : UNRESPONSIVE extension host (piste saturation / restart EH)."
}

if ($why.Count -eq 0) {
	$why += "Pas assez de signaux - re-export juste apres le stop + passer -TerminalLog du code.bat."
}

# --- Sortie ---
Write-Output "=== diag-drox-run-stop ==="
Write-Output "transcript: $TranscriptPath"
Write-Output "session:    $sessionId"
Write-Output "exported:   $exported"
Write-Output "workspace:  $ws"
Write-Output "tokens:     $tokens"
Write-Output ""
Write-Output "BUCKET: $bucket"
foreach ($w in $why) { Write-Output "  - $w" }
Write-Output ""
Write-Output "--- derniers messages moteur (PARTIE D) ---"
if ($tail.Count -eq 0) {
	Write-Output "  (PARTIE D introuvable ou vide)"
} else {
	foreach ($m in $tail) { Write-Output ("  {0}" -f $m.Line) }
}
Write-Output ""
Write-Output "--- signaux transcript ---"
Write-Output "  file_write=$fileWriteN  file_edit=$fileEditN  explore_artifact_read=$artifactReadN  kind_file_read~$kindReadN"
Write-Output "  orphan_ui=$hasOrphanUi  e2_stall=$hasExploreStall  artifact_fail_nudge=$hasArtifactFail"
Write-Output ""
Write-Output "--- signaux terminal ---"
if ($termHits.Count -eq 0) {
	Write-Output "  (aucun hit - lance code.bat visible ou: -TerminalLog chemin\log.txt)"
} else {
	$termHits | ForEach-Object { Write-Output ("  {0}: {1} x{2}" -f $_.File, $_.Pattern, $_.Count) }
}
Write-Output ""
Write-Output "--- next ---"
switch ($bucket) {
	"kill_mid_turn" {
		Write-Output "  -> Ne dig pas Explore/A/E2b. Suivre lifecycle EH/fenetre (D6 voisin)."
		Write-Output "  -> Dogfood: pas de reload pendant busy ; noter geste UI au stop."
	}
	"orphan_tool" {
		Write-Output "  -> D6 : tool start sans finish. Chercher panic moteur / Sync task / UTF-8."
	}
	"run_done" {
		Write-Output "  -> Run finie normalement ; juger qualite acting (writes) pas le kill."
	}
	default {
		Write-Output "  -> Rejouer diag avec export frais + -TerminalLog."
	}
}
