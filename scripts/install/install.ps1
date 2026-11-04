# Install or update Drox IDE from the GitHub release marked Latest.
# Re-running this script downloads that release again and replaces the current install.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install\install.ps1
#
# Override the repo with -Repo owner/name.

[CmdletBinding()]
param(
	[string]$Repo = $(if ($env:DROX_GITHUB_REPO) { $env:DROX_GITHUB_REPO } else { 'DroxKiwi/Drox---IDE' })
)

$ErrorActionPreference = 'Stop'

if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
	throw 'This installer only supports 64-bit Windows (x64).'
}

$headers = @{
	'User-Agent' = 'Drox-Install'
	'Accept'     = 'application/vnd.github+json'
}

Write-Host "Reading the latest release of $Repo..."
$release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Repo/releases/latest"
$asset = @($release.assets) | Where-Object { $_.name -like 'Drox-IDE-Setup-*-win32-x64.exe' } | Select-Object -First 1
if (-not $asset) {
	throw "The release $($release.tag_name) has no Drox-IDE-Setup win32-x64 installer."
}

$dest = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($release.tag_name) ($($asset.name))..."
$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -Headers @{ 'User-Agent' = 'Drox-Install' } -Uri $asset.browser_download_url -OutFile $dest

if ($asset.digest -match '^sha256:([0-9a-fA-F]+)$') {
	$expected = $Matches[1].ToLowerInvariant()
	$actual = (Get-FileHash -Algorithm SHA256 -Path $dest).Hash.ToLowerInvariant()
	if ($actual -ne $expected) {
		Remove-Item -Force $dest
		throw "SHA256 mismatch for $($asset.name)."
	}
	Write-Host 'SHA256 matches the release.'
}

Write-Host 'Installing. An existing Drox IDE is replaced in the same folder.'
$proc = Start-Process -FilePath $dest -ArgumentList @(
	'/VERYSILENT',
	'/NORESTART',
	'/SUPPRESSMSGBOXES',
	'/SP-'
) -Wait -PassThru

if ($proc.ExitCode -ne 0) {
	throw "The installer exited with code $($proc.ExitCode)."
}

Write-Host "Drox IDE $($release.tag_name) is installed. Run this script again after a newer release is marked Latest."
