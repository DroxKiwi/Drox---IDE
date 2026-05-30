# Sync Drox branding icons into resources/win32/ for Electron + Inno + taskbar.
# Source PNG (repo root, first found): logo3.png, logo_drox.png, logo-drox.png
# Optional ICO override: logo3.ico / logo_drox.ico (otherwise generated from PNG).
#
# Usage:
#   .\scripts\sync-drox-win32-icons.ps1
#   .\scripts\sync-drox-win32-icons.ps1 -SourcePng .\custom.png

[CmdletBinding()]
param(
	[string]$SourceIco = '',
	[string]$SourcePng = '',
	[double]$FillRatio = 0.90,
	[int]$DarkThreshold = 18
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $repoRoot 'resources\win32'

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
	Write-Error 'PNG source introuvable. Placez logo3.png (ou logo_drox.png) a la racine du repo.'
}

if (-not $SourceIco) {
	$SourceIco = Resolve-SourceFile @('logo3.ico', 'logo_drox.ico', 'logo-drox.ico')
}

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Add-Type -AssemblyName System.Drawing

function Write-SyncLog([string]$message) {
	Write-Host "[sync-drox-icons] $message"
}

function Test-EmptyPixel([System.Drawing.Color]$c, [int]$threshold) {
	if ($c.A -lt 12) { return $true }
	return ($c.R -le $threshold -and $c.G -le $threshold -and $c.B -le $threshold)
}

function Get-ContentBounds([System.Drawing.Bitmap]$bmp, [int]$threshold) {
	$minX = $bmp.Width
	$minY = $bmp.Height
	$maxX = -1
	$maxY = -1
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
	return @{
		X      = $minX
		Y      = $minY
		Width  = ($maxX - $minX + 1)
		Height = ($maxY - $minY + 1)
	}
}

function New-SquareLogoBitmap([System.Drawing.Image]$src, [int]$size, [double]$fillRatio, [int]$threshold, [System.Drawing.Color]$background) {
	$bounds = Get-ContentBounds ([System.Drawing.Bitmap]$src) $threshold
	$side = [Math]::Max($bounds.Width, $bounds.Height)
	$inner = [int][Math]::Round($size * $fillRatio)
	$offset = [int](($size - $inner) / 2)

	$bmp = New-Object System.Drawing.Bitmap $size, $size
	$g = [System.Drawing.Graphics]::FromImage($bmp)
	try {
		$g.Clear($background)
		$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
		$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
		$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
		$srcRect = New-Object System.Drawing.Rectangle $bounds.X, $bounds.Y, $bounds.Width, $bounds.Height
		$destRect = New-Object System.Drawing.Rectangle $offset, $offset, $inner, $inner
		$g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
	} finally {
		$g.Dispose()
	}
	return $bmp
}

function Export-Png([System.Drawing.Bitmap]$bmp, [string]$destName) {
	$dest = Join-Path $destDir $destName
	$bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
	Write-SyncLog "$destName ($($bmp.Width)x$($bmp.Height))"
}

function Export-MultiSizeIco([System.Drawing.Bitmap]$sourceSquare, [string]$destName, [int[]]$sizes) {
	$pngEntries = New-Object System.Collections.Generic.List[Object]
	foreach ($size in $sizes) {
		$scaled = New-Object System.Drawing.Bitmap $size, $size
		$g = [System.Drawing.Graphics]::FromImage($scaled)
		try {
			$g.Clear([System.Drawing.Color]::Transparent)
			$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
			$g.DrawImage($sourceSquare, 0, 0, $size, $size)
		} finally {
			$g.Dispose()
		}
		$ms = New-Object System.IO.MemoryStream
		try {
			$scaled.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
			$pngEntries.Add([PSCustomObject]@{ Size = $size; Bytes = $ms.ToArray() })
		} finally {
			$scaled.Dispose()
			$ms.Dispose()
		}
	}

	$dest = Join-Path $destDir $destName
	$fs = [System.IO.File]::Open($dest, [System.IO.FileMode]::Create)
	try {
		$bw = New-Object System.IO.BinaryWriter $fs
		try {
			$count = $pngEntries.Count
			$bw.Write([UInt16]0)    # reserved
			$bw.Write([UInt16]1)    # type: icon
			$bw.Write([UInt16]$count)

			$dataOffset = 6 + (16 * $count)
			foreach ($entry in $pngEntries) {
				$sizeByte = [byte][Math]::Min($entry.Size, 255)
				$bw.Write($sizeByte)          # width
				$bw.Write($sizeByte)          # height
				$bw.Write([byte]0)            # color count
				$bw.Write([byte]0)            # reserved
				$bw.Write([UInt16]1)          # planes
				$bw.Write([UInt16]32)         # bit count
				$bw.Write([UInt32]$entry.Bytes.Length)
				$bw.Write([UInt32]$dataOffset)
				$dataOffset += $entry.Bytes.Length
			}
			foreach ($entry in $pngEntries) {
				$bw.Write($entry.Bytes)
			}
		} finally {
			$bw.Dispose()
		}
	} finally {
		$fs.Dispose()
	}
	Write-SyncLog "$destName (PNG-embedded: $($sizes -join ', ') px)"
}

$src = [System.Drawing.Image]::FromFile($SourcePng)
try {
	Write-SyncLog "source PNG <- $SourcePng ($($src.Width)x$($src.Height))"
	$taskbarBg = [System.Drawing.Color]::FromArgb(255, 45, 45, 48)

	$master256 = New-SquareLogoBitmap $src 256 $FillRatio $DarkThreshold ([System.Drawing.Color]::Transparent)
	try {
		Export-Png $master256 'drox_256.png'
		$png150 = New-SquareLogoBitmap $src 150 $FillRatio $DarkThreshold $taskbarBg
		try { Export-Png $png150 'code_150x150.png' } finally { $png150.Dispose() }
		$png70 = New-SquareLogoBitmap $src 70 $FillRatio $DarkThreshold $taskbarBg
		try { Export-Png $png70 'code_70x70.png' } finally { $png70.Dispose() }

		if ($SourceIco -and (Test-Path $SourceIco)) {
			foreach ($name in @('drox.ico', 'code.ico')) {
				Copy-Item -Force $SourceIco (Join-Path $destDir $name)
				Write-SyncLog "$name <- $SourceIco (copie directe)"
			}
		} else {
			$icoSizes = @(16, 24, 32, 48, 64, 128, 256)
			Export-MultiSizeIco $master256 'drox.ico' $icoSizes
			Copy-Item -Force (Join-Path $destDir 'drox.ico') (Join-Path $destDir 'code.ico')
			Write-SyncLog 'code.ico <- drox.ico'
		}
	} finally {
		$master256.Dispose()
	}
} finally {
	$src.Dispose()
}

& (Join-Path $repoRoot 'scripts\sync-drox-inno-wizard.ps1') -SourcePng $SourcePng

Write-Host ''
Write-Host 'OK. Rebuild package pour appliquer :' -ForegroundColor Green
Write-Host '  npm run electron'
Write-Host '  .\scripts\build-release-win32.ps1 -SkipNpmInstall -SkipCompile'
