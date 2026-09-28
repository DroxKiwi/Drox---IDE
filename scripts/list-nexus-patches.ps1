# Liste les fichiers du fork Nexus hors contrib/drox contenant des marqueurs Drox/Nexus.
# Usage : .\scripts\list-nexus-patches.ps1
# See: docs/1.2.0/steps/03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md section 5

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'product.json'))) {
	throw "Racine repo introuvable (product.json attendu sous $root)"
}

$patterns = @('drox', 'Drox', 'nexus', 'Nexus', 'KDDS', 'DROX-NEXUS')
$exclude = @(
	'*\contrib\drox\*',
	'*\drox-engine\*',
	'*\node_modules\*',
	'*\out\*',
	'*\.git\*'
)

Write-Host "Racine: $root"
Write-Host "Fichiers hors contrib/drox avec marqueurs produit (revue merge upstream):`n"

$hits = Get-ChildItem -Path (Join-Path $root 'src'), (Join-Path $root 'extensions'), (Join-Path $root 'build'), (Join-Path $root 'product.json') -Recurse -File -ErrorAction SilentlyContinue |
	Where-Object {
		$rel = $_.FullName.Substring($root.Length + 1)
		$skip = $false
		foreach ($e in $exclude) {
			if ($rel -like $e.TrimStart('\')) { $skip = $true; break }
		}
		-not $skip -and $rel -notlike 'vs\workbench\contrib\drox\*'
	} |
	ForEach-Object {
		$content = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
		if (-not $content) { return }
		foreach ($p in $patterns) {
			if ($content -match [regex]::Escape($p)) {
				return $_.FullName.Substring($root.Length + 1)
			}
		}
	} |
	Sort-Object -Unique

if ($hits) {
	$hits | ForEach-Object { Write-Host "  $_" }
	Write-Host "`nTotal: $($hits.Count) fichier(s)"
} else {
	Write-Host '  (aucun — surface merge minimale)'
}
