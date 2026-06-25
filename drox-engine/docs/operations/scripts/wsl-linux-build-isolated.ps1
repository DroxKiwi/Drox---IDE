# Linux release build from an isolated WSL clone (ext4) — does NOT touch Windows node_modules.
#
# Recommended when you develop on Windows (C:\...\Drox---IDE) and only need occasional .deb builds.
# No restore-windows-dev.ps1 needed afterward.
#
# Usage (PowerShell, from Windows repo root):
#   .\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1
#   .\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1 -Distro Ubuntu-24.04
#   .\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1 -SkipCommit
#
# Changements locaux non commités : commit auto avant sync (voir -SkipCommit).
# Log: .build/wsl-linux-build-isolated.log (on Windows repo)

[CmdletBinding()]
param(
	[string]$Distro = '',
	[string]$LinuxRepoName = 'Drox---IDE',
	[switch]$SkipCommit
)

$ErrorActionPreference = 'Stop'

if (-not $Distro) {
	$installed = @(wsl -l -q | ForEach-Object { $_.Trim() } | Where-Object { $_ })
	if ($installed -contains 'Ubuntu-24.04') { $Distro = 'Ubuntu-24.04' }
	elseif ($installed -contains 'Ubuntu') { $Distro = 'Ubuntu' }
	else { $Distro = $installed[0] }
}

$winRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$winOr = (Join-Path (Split-Path -Parent $winRepo) 'Drox---IDE---OR')
$drive = $winRepo.Substring(0, 1).ToLowerInvariant()
$winRest = ($winRepo.Substring(2) -replace '\\', '/').TrimStart('/')
$winRepoWsl = "/mnt/$drive/$winRest"
$orDrive = $winOr.Substring(0, 1).ToLowerInvariant()
$orRest = ($winOr.Substring(2) -replace '\\', '/').TrimStart('/')
$winOrWsl = "/mnt/$orDrive/$orRest"
$logFile = Join-Path $winRepo '.build\wsl-linux-build-isolated.log'

function Ensure-WindowsRepoCommitted {
	if ($SkipCommit) {
		$dirty = git -C $winRepo status --porcelain
		if ($dirty) {
			throw @"
Working tree non vide et -SkipCommit actif.
Commitez ou stash vos changements, ou relancez sans -SkipCommit (commit auto).
"@
		}
		return (git -C $winRepo rev-parse HEAD 2>$null | Select-Object -Last 1).Trim()
	}

	$dirty = git -C $winRepo status --porcelain
	if (-not $dirty) {
		Write-Host 'Git Windows : working tree propre.' -ForegroundColor DarkGray
		$hash = (& git -C $winRepo rev-parse HEAD 2>$null | Select-Object -Last 1).Trim()
		if ($hash -notmatch '^[0-9a-f]{40}$') { throw "HEAD git invalide: '$hash'" }
		return $hash
	}

	Write-Host '==> Commit auto des changements locaux (avant sync clone Linux)' -ForegroundColor Yellow
	git -C $winRepo add -A | Out-Null
	git -C $winRepo reset -- 'build/node_modules.win.bak.*' 2>$null | Out-Null
	$stillDirty = git -C $winRepo status --porcelain
	if (-not $stillDirty) {
		$hash = (& git -C $winRepo rev-parse HEAD 2>$null | Select-Object -Last 1).Trim()
		if ($hash -notmatch '^[0-9a-f]{40}$') { throw "HEAD git invalide: '$hash'" }
		return $hash
	}

	$branch = (git -C $winRepo rev-parse --abbrev-ref HEAD).Trim()
	$msg = "chore(release): sync before linux build ($branch)"
	git -C $winRepo commit -m $msg | Out-Null
	if ($LASTEXITCODE -ne 0) {
		throw 'git commit a echoue avant le build Linux.'
	}
	$hash = (& git -C $winRepo rev-parse HEAD 2>$null | Select-Object -Last 1).Trim()
	if ($hash -notmatch '^[0-9a-f]{40}$') {
		throw "HEAD git invalide apres commit: '$hash'"
	}
	Write-Host "    commit $($hash.Substring(0, 12))" -ForegroundColor DarkGray
	return $hash
}

$branch = (git -C $winRepo rev-parse --abbrev-ref HEAD).Trim()
$remoteUrl = (git -C $winRepo remote get-url origin 2>$null)
if (-not $remoteUrl) { $remoteUrl = '' }

Write-Host 'Drox IDE - Linux build (clone WSL isole)' -ForegroundColor Cyan
Write-Host "Windows repo : $winRepo"
Write-Host "Branche      : $branch"
Write-Host "Clone WSL    : ~/$LinuxRepoName (ext4, node_modules Linux separes)"
Write-Host "Log          : $logFile"
Write-Host ''
Write-Host 'Le dev Windows (npm run watch / code.bat) n est pas touche.' -ForegroundColor Green
Write-Host ''

$winHead = Ensure-WindowsRepoCommitted

$bashScript = @'
set -euo pipefail
WIN_REPO='__WIN_REPO__'
LINUX_REPO="$HOME/__LINUX_REPO__"
BRANCH='__BRANCH__'
WIN_HEAD='__WIN_HEAD__'
REMOTE_URL='__REMOTE_URL__'
DROX_RELEASES_REPO='__WIN_OR_WSL__'
LOG='__LOG__'

mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1

echo "==> Drox IDE linux build (isolated) - $(date -Iseconds)"
echo "==> Windows HEAD: $WIN_HEAD"
echo "==> Linux clone:    $LINUX_REPO"

sync_clone() {
	if [[ ! -d "$LINUX_REPO/.git" ]]; then
		echo "==> First-time clone from Windows repo (local, includes commit non pousse)"
		git clone "$WIN_REPO" "$LINUX_REPO"
	fi
	cd "$LINUX_REPO"
	git fetch --all --prune || true
	if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
		git checkout "$BRANCH"
	else
		git checkout -B "$BRANCH" "$WIN_HEAD"
	fi
	echo "==> Sync clone Linux sur HEAD Windows ($WIN_HEAD)"
	git reset --hard "$WIN_HEAD"
}

sync_clone

export DROX_PRODUCT_SURFACE=release
export DROX_RELEASES_REPO="$DROX_RELEASES_REPO"
chmod +x drox-engine/docs/operations/scripts/wsl-linux-build.sh \
	scripts/build-release-linux.sh scripts/package-drox.sh \
	scripts/verify-packaged-linux.sh scripts/release-publish-linux.sh \
	scripts/lib/linux-npm-install.sh scripts/lib/linux-strip-packaged-natives.sh

bash ./drox-engine/docs/operations/scripts/wsl-linux-build.sh

echo ""
echo "==> Done. Windows dev unchanged. .deb via release-publish-linux.sh if OR repo present."
'@

$bashScript = $bashScript.Replace('__WIN_REPO__', $winRepoWsl)
$bashScript = $bashScript.Replace('__LINUX_REPO__', $LinuxRepoName)
$bashScript = $bashScript.Replace('__BRANCH__', $branch)
$bashScript = $bashScript.Replace('__WIN_HEAD__', $winHead)
$bashScript = $bashScript.Replace('__REMOTE_URL__', $remoteUrl.Replace("'", "'\''"))
$bashScript = $bashScript.Replace('__WIN_OR_WSL__', $winOrWsl.Replace("'", "'\''"))
$bashScript = $bashScript.Replace('__LOG__', ($winRepoWsl + '/.build/wsl-linux-build-isolated.log'))

$tempSh = Join-Path $env:TEMP "drox-wsl-linux-build-isolated-$PID.sh"
[System.IO.File]::WriteAllText($tempSh, ($bashScript -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding $false))

$driveLetter = $tempSh.Substring(0, 1).ToLowerInvariant()
$wslTemp = "/mnt/$driveLetter" + ($tempSh.Substring(2) -replace '\\', '/')

try {
	wsl -d $Distro -- bash -lc "chmod +x '$wslTemp' && '$wslTemp'"
	$exit = $LASTEXITCODE
} finally {
	Remove-Item -LiteralPath $tempSh -Force -ErrorAction SilentlyContinue
}

if ($exit -ne 0) {
	Write-Error "Build isole echoue (exit $exit). Voir $logFile"
}

Write-Host ''
Write-Host 'Build termine - dev Windows intact.' -ForegroundColor Green
$upload = Join-Path (Split-Path -Parent $winRepo) 'Drox---IDE---OR\_upload'
if (Test-Path $upload) {
	Get-ChildItem $upload -Filter '*.deb' | ForEach-Object { Write-Host "  $($_.FullName)" }
}
