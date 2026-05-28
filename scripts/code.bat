@echo off
setlocal

title Drox IDE Dev

pushd %~dp0\..

:: Get electron, compile, built-in extensions
if "%VSCODE_SKIP_PRELAUNCH%"=="" (
	node build/lib/preLaunch.ts
	if errorlevel 1 exit /b 1
)

set "NAMESHORT="
for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do if not defined NAMESHORT set "NAMESHORT=%%~a"
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
:: Runtime Electron: default .build\electron; on Windows EBUSY see .build\electron-active-subdir
set "ELECTRON_SUB=electron"
if exist ".build\electron-active-subdir" (
	set /p ELECTRON_SUB=<.build\electron-active-subdir
)
:: Do not quote CODE: the exe name may contain a space (e.g. Drox IDE.exe).
set "CODE=%CD%\.build\%ELECTRON_SUB%\%NAMESHORT%"
if not exist "%CODE%" (
	echo [code.bat] Executable introuvable:
	echo   "%CODE%"
	echo Lancez: npm run electron
	echo Verifier aussi .build\%ELECTRON_SUB% si electron-active-subdir est present
	exit /b 1
)

:: Manage built-in extensions
if "%~1"=="--builtin" goto builtin

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1
set VSCODE_CLI=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

set "DISABLE_TEST_EXTENSION=--disable-extension=vscode.vscode-api-tests"
for %%A in (%*) do (
	if "%%~A"=="--extensionTestsPath" (
		set "DISABLE_TEST_EXTENSION="
	)
)

:: Launch Code (guillemets autour du chemin pour les espaces dans nameShort)
"%CODE%" . %DISABLE_TEST_EXTENSION% %*
goto end

:builtin
"%CODE%" build/builtin

:end

popd

endlocal
