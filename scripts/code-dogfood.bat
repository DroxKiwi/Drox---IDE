@echo off
setlocal
title Drox dogfood (ensure out + launch)

:: Ensure `out/` matches src (transpile if stale / n+1 shadows), then launch code.bat.
:: Optional: set DROX_DOGFOOD_SYNC_ENGINE=1 to also align resources/drox ← target/debug
::
:: Usage:
::   .\scripts\code-dogfood.bat
::   .\scripts\code-dogfood.bat path\to\workspace
::   .\scripts\ensure-dev-out.ps1 -CheckOnly

pushd %~dp0\..

set "ENSURE_ARGS=-Launch"
if /I "%DROX_DOGFOOD_SYNC_ENGINE%"=="1" (
	set "ENSURE_ARGS=-SyncEngine -Launch"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-dev-out.ps1" %ENSURE_ARGS% %*
set "EXITCODE=%ERRORLEVEL%"

popd
endlocal & exit /b %EXITCODE%
