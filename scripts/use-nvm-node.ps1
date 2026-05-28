# Active la version Node du fichier .nvmrc via nvm4w (Windows).
# Usage dans PowerShell : . .\scripts\use-nvm-node.ps1
# Puis : node -v

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$nvmrc = Join-Path $repoRoot '.nvmrc'
if (-not (Test-Path $nvmrc)) {
	throw ".nvmrc introuvable sous $repoRoot"
}
$version = (Get-Content $nvmrc -Raw).Trim()
if (-not (Get-Command nvm -ErrorAction SilentlyContinue)) {
	throw "nvm (nvm4w) introuvable. Installez https://github.com/coreybutler/nvm-windows"
}
nvm use $version | Out-Host

$nvmHome = $env:NVM_HOME
if (-not $nvmHome) {
	$nvmHome = Join-Path $env:LOCALAPPDATA 'nvm'
}
$nodeDir = Join-Path $nvmHome "v$version"
$nodeExe = Join-Path $nodeDir 'node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) {
	$symlink = $env:NVM_SYMLINK
	if (-not $symlink) { $symlink = 'C:\nvm4w\nodejs' }
	$nodeExe = Join-Path $symlink 'node.exe'
}
if (-not (Test-Path -LiteralPath $nodeExe)) {
	throw "node.exe introuvable pour $version (cherche sous $nodeDir)"
}

$nodeDir = Split-Path $nodeExe -Parent
$cursorHelpers = Join-Path $env:LOCALAPPDATA 'Programs\cursor\resources\app\resources\helpers'
$env:Path = ($env:Path -split ';' | Where-Object {
	$_ -and $_ -ne $cursorHelpers -and $_ -ne $nodeDir
}) -join ';'
$env:Path = "$nodeDir;$env:Path"
Write-Host "Node actif : $(node -v) ($((Get-Command node).Source))"
