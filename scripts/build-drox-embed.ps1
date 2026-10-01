# Build drox-cli with local embed (llama.cpp) on Windows.
# Requires: VS BuildTools (MSVC + CMake), LIBCLANG (see below).
#
# One-time libclang (no admin):
#   $dir = "$env:USERPROFILE\.drox-tools\libclang"
#   New-Item -ItemType Directory -Force $dir | Out-Null
#   Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/libclang.runtime.win-x64/18.1.3/libclang.runtime.win-x64.18.1.3.nupkg" -OutFile "$dir\p.zip"
#   Expand-Archive "$dir\p.zip" "$dir\pkg" -Force
#
# Usage: pwsh scripts/build-drox-embed.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$drox = Join-Path $root "drox-engine\drox"

$cmakeDir = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin"
$vcvars = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
$libclang = Join-Path $env:USERPROFILE ".drox-tools\libclang\pkg\runtimes\win-x64\native"
if (-not (Test-Path (Join-Path $libclang "libclang.dll"))) {
  Write-Error "libclang.dll missing at $libclang — see header comments to fetch NuGet package."
}
if (-not (Test-Path $vcvars)) {
  Write-Error "VS BuildTools vcvars64.bat not found: $vcvars"
}

# Short target dir avoids Windows MAX_PATH failures under long CARGO_TARGET_DIR.
$target = "C:\t\drox"
New-Item -ItemType Directory -Force -Path $target | Out-Null

$bat = Join-Path $env:TEMP "drox-build-embed.bat"
@"
@echo off
call "$vcvars"
set "Path=$cmakeDir;%Path%"
set "LIBCLANG_PATH=$libclang"
set "CARGO_TARGET_DIR=$target"
set "GGML_CPU_REPACK=OFF"
cd /d "$drox"
cargo build -p drox-cli --features embed %*
"@ | Set-Content -Path $bat -Encoding ASCII

Write-Host "Building drox-cli --features embed (CARGO_TARGET_DIR=$target, GGML_CPU_REPACK=OFF)..."
cmd /c $bat
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "OK: $target\debug\drox.exe (or release/ if -r)"
