# Fetch default Drox embed GGUF (MiniLM) for CB2 dogfood.
# Usage: pwsh scripts/fetch-drox-embed-model.ps1
# Output: drox-engine/models/all-MiniLM-L6-v2.Q4_K_M.gguf

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "drox-engine"))) {
  $root = Get-Location
}
$outDir = Join-Path $root "drox-engine\models"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outFile = Join-Path $outDir "all-MiniLM-L6-v2.Q4_K_M.gguf"
$url = "https://huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF/resolve/main/all-MiniLM-L6-v2-Q4_K_M.gguf"

if (Test-Path $outFile) {
  Write-Host "Already present: $outFile"
  exit 0
}

Write-Host "Downloading $url ..."
Invoke-WebRequest -Uri $url -OutFile $outFile -UseBasicParsing
Write-Host "Saved $outFile"
Write-Host "Set DROX_EMBED_MODEL_PATH=$outFile or copy to %APPDATA%\.drox-ide-dev\...\drox\models\"
