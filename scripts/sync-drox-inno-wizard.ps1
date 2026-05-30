# Generate Inno Setup wizard BMPs (black + Drox green) from logo3.png.
# Output: resources/win32/inno-big-*.bmp, inno-small-*.bmp
#
# Usage:
#   .\scripts\sync-drox-inno-wizard.ps1
#   .\scripts\sync-drox-inno-wizard.ps1 -SourcePng .\logo3.png

[CmdletBinding()]
param(
	[string]$SourcePng = '',
	[int]$DarkThreshold = 18,
	[double]$BigLogoFill = 0.58,
	[double]$SmallLogoFill = 0.72
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $repoRoot 'resources\win32'

Add-Type -AssemblyName System.Drawing

# Align with droxChatMvp.css (--drox-ui-green, dark workbench)
$BgColor = [System.Drawing.Color]::FromArgb(255, 30, 30, 30)       # #1E1E1E
$AccentColor = [System.Drawing.Color]::FromArgb(255, 61, 122, 61)  # #3D7A3D
$AccentGlow = [System.Drawing.Color]::FromArgb(48, 63, 185, 80)    # soft green glow

$bigSizes = @{
	100 = @{ W = 164; H = 314 }
	125 = @{ W = 192; H = 386 }
	150 = @{ W = 246; H = 459 }
	175 = @{ W = 273; H = 556 }
	200 = @{ W = 328; H = 604 }
	225 = @{ W = 355; H = 700 }
	250 = @{ W = 410; H = 797 }
}
$smallSizes = @{
	100 = 55; 125 = 64; 150 = 79; 175 = 92; 200 = 110; 225 = 126; 250 = 138
}

function Resolve-SourceFile([string[]]$candidates) {
	foreach ($name in $candidates) {
		$p = Join-Path $repoRoot $name
		if (Test-Path $p) { return $p }
	}
	return $null
}

if (-not $SourcePng) {
	$SourcePng = Resolve-SourceFile @('logo3.png', 'logo_drox.png', 'logo-drox.png')
}
if (-not $SourcePng -or -not (Test-Path $SourcePng)) {
	Write-Error 'PNG source introuvable (logo3.png a la racine).'
}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null

function Test-EmptyPixel([System.Drawing.Color]$c, [int]$threshold) {
	if ($c.A -lt 12) { return $true }
	return ($c.R -le $threshold -and $c.G -le $threshold -and $c.B -le $threshold)
}

function Get-ContentBounds([System.Drawing.Bitmap]$bmp, [int]$threshold) {
	$minX = $bmp.Width; $minY = $bmp.Height; $maxX = -1; $maxY = -1
	for ($y = 0; $y -lt $bmp.Height; $y++) {
		for ($x = 0; $x -lt $bmp.Width; $x++) {
			if (-not (Test-EmptyPixel $bmp.GetPixel($x, $y) $threshold)) {
				if ($x -lt $minX) { $minX = $x }
				if ($y -lt $minY) { $minY = $y }
				if ($x -gt $maxX) { $maxX = $x }
				if ($y -gt $maxY) { $maxY = $y }
			}
		}
	}
	if ($maxX -lt 0) {
		return @{ X = 0; Y = 0; Width = $bmp.Width; Height = $bmp.Height }
	}
	return @{ X = $minX; Y = $minY; Width = ($maxX - $minX + 1); Height = ($maxY - $minY + 1) }
}

function New-Graphics([System.Drawing.Bitmap]$bmp) {
	$g = [System.Drawing.Graphics]::FromImage($bmp)
	$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
	$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
	$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
	return $g
}

function Draw-BigWizardPanel([System.Drawing.Image]$src, [int]$w, [int]$h, [double]$logoFill) {
	$bmp = New-Object System.Drawing.Bitmap $w, $h
	$g = New-Graphics $bmp
	try {
		$g.Clear($BgColor)

		# Left accent bar + bottom glow (Drox green on dark)
		$barW = [Math]::Max(3, [int]($w * 0.018))
		$g.FillRectangle((New-Object System.Drawing.SolidBrush $AccentColor), 0, 0, $barW, $h)
		$glowH = [int]($h * 0.22)
		$g.FillRectangle((New-Object System.Drawing.SolidBrush $AccentGlow), 0, $h - $glowH, $w, $glowH)

		$bounds = Get-ContentBounds ([System.Drawing.Bitmap]$src) $DarkThreshold
		$inner = [int]([Math]::Min($w, $h) * $logoFill)
		$x = [int](($w - $inner) / 2)
		$y = [int]($h * 0.14)
		$srcRect = New-Object System.Drawing.Rectangle $bounds.X, $bounds.Y, $bounds.Width, $bounds.Height
		$destRect = New-Object System.Drawing.Rectangle $x, $y, $inner, $inner
		$g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

		# Wordmark stripe
		$fontSize = [Math]::Max(8, [int]($w * 0.11))
		$font = [System.Drawing.Font]::new('Segoe UI', [single]$fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
		try {
			$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 255, 255, 255))
			try {
				$text = 'Drox IDE'
				$sizeF = $g.MeasureString($text, $font)
				$tx = [int](($w - $sizeF.Width) / 2)
				$ty = [int]($y + $inner + ($h - $y - $inner) * 0.22)
				$g.DrawString($text, $font, $brush, [single]$tx, [single]$ty)
			} finally { $brush.Dispose() }
		} finally { $font.Dispose() }
	} finally {
		$g.Dispose()
	}
	return $bmp
}

function Draw-SmallWizardIcon([System.Drawing.Image]$src, [int]$size, [double]$logoFill) {
	$bmp = New-Object System.Drawing.Bitmap $size, $size
	$g = New-Graphics $bmp
	try {
		$g.Clear($BgColor)
		$border = [Math]::Max(1, [int]($size * 0.04))
		$g.DrawRectangle((New-Object System.Drawing.Pen $AccentColor, $border), 0, 0, $size - 1, $size - 1)

		$bounds = Get-ContentBounds ([System.Drawing.Bitmap]$src) $DarkThreshold
		$inner = [int]($size * $logoFill)
		$offset = [int](($size - $inner) / 2)
		$srcRect = New-Object System.Drawing.Rectangle $bounds.X, $bounds.Y, $bounds.Width, $bounds.Height
		$destRect = New-Object System.Drawing.Rectangle $offset, $offset, $inner, $inner
		$g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
	} finally {
		$g.Dispose()
	}
	return $bmp
}

$src = [System.Drawing.Image]::FromFile($SourcePng)
try {
	Write-Host "[sync-drox-inno-wizard] source <- $SourcePng"
	foreach ($pct in $bigSizes.Keys | Sort-Object) {
		$dim = $bigSizes[$pct]
		$panel = Draw-BigWizardPanel $src $dim.W $dim.H $BigLogoFill
		try {
			$dest = Join-Path $destDir "inno-big-$pct.bmp"
			$panel.Save($dest, [System.Drawing.Imaging.ImageFormat]::Bmp)
			Write-Host "[sync-drox-inno-wizard] inno-big-$pct.bmp ($($dim.W)x$($dim.H))"
		} finally {
			$panel.Dispose()
		}
	}
	foreach ($pct in $smallSizes.Keys | Sort-Object) {
		$s = $smallSizes[$pct]
		$icon = Draw-SmallWizardIcon $src $s $SmallLogoFill
		try {
			$dest = Join-Path $destDir "inno-small-$pct.bmp"
			$icon.Save($dest, [System.Drawing.Imaging.ImageFormat]::Bmp)
			Write-Host "[sync-drox-inno-wizard] inno-small-$pct.bmp (${s}x${s})"
		} finally {
			$icon.Dispose()
		}
	}
} finally {
	$src.Dispose()
}

Write-Host '[sync-drox-inno-wizard] OK' -ForegroundColor Green
