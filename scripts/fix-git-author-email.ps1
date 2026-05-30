# Rewrite commits that used work email -> personal email (privacy).
# Usage:
#   git stash push -u -m "wip"
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\fix-git-author-email.ps1

[CmdletBinding()]
param(
	[string]$Branch = 'main',
	[string]$OldEmail = 'corentin.fredj@jetransporte.com',
	[string]$NewName = 'Corentin Fredj',
	[string]$NewEmail = 'corentinfredj.dev@gmail.com',
	[string]$ReadmeCommitMessage = 'docs: reecrire le README pour le depot prive Drox IDE',
	[switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$authorArg = "$NewName <$NewEmail>"

if ($DryRun) {
	git log $Branch --format='%h %an <%ae> %s' | Where-Object { $_ -match [regex]::Escape($OldEmail) }
	return
}

if (git status --porcelain) {
	Write-Error 'Working tree non vide. git stash push -u puis relancez.'
}

$count = [int](git rev-list --count $Branch)
Write-Host "Branche $Branch - $count commit(s)"

if ($count -eq 1) {
	git checkout $Branch
	git commit --amend --author=$authorArg --no-edit
}
elseif ($count -eq 2) {
	$root = git rev-parse "${Branch}~1"
	$tip = git rev-parse $Branch
	$rootMsg = git log -1 --format=%s $root

	git checkout $root
	git commit --amend --author=$authorArg -m $rootMsg

	git cherry-pick $tip
	if ($LASTEXITCODE -ne 0) {
		git cherry-pick --abort 2>$null
		throw 'cherry-pick failed'
	}

	git commit --amend --author=$authorArg -m $ReadmeCommitMessage
	git branch -f $Branch HEAD
	git checkout $Branch
}
else {
	throw "Branche avec $count commits: contactez l equipe ou etendez le script."
}

Write-Host ''
git log $Branch -3 --format='%h %an <%ae> %s'
Write-Host ''
Write-Host 'OK. Puis: git push --force-with-lease origin main'
