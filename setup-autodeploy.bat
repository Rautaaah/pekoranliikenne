@echo off
setlocal enabledelayedexpansion

echo === Zekoro Auto-Deploy Setup ===
echo.

set "REPO_URL=https://github.com/Rautaaah/pekoranliikenne"
set "RUNNER_DIR=C:\actions-runner"
set "WORK_DIR=_work"

where powershell >nul 2>nul || (
  echo [ERROR] PowerShell is required.
  pause
  exit /b 1
)

echo Enter GitHub runner registration token for this repo:
echo Repo Settings ^> Actions ^> Runners ^> New self-hosted runner
set /p RUNNER_TOKEN=Token: 
if "%RUNNER_TOKEN%"=="" (
  echo [ERROR] Token is required.
  pause
  exit /b 1
)

echo.
echo [1/4] Preparing runner directory...
if not exist "%RUNNER_DIR%" mkdir "%RUNNER_DIR%"
cd /d "%RUNNER_DIR%"

echo [2/4] Downloading actions runner...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$release=Invoke-RestMethod 'https://api.github.com/repos/actions/runner/releases/latest';" ^
  "$asset=$release.assets | Where-Object { $_.name -like 'actions-runner-win-x64-*.zip' } | Select-Object -First 1;" ^
  "if(-not $asset){ throw 'Could not find runner zip asset'; }" ^
  "Invoke-WebRequest -Uri $asset.browser_download_url -OutFile 'actions-runner.zip';" ^
  "Expand-Archive -Path 'actions-runner.zip' -DestinationPath '.' -Force;"
if errorlevel 1 (
  echo [ERROR] Failed to download/extract runner.
  pause
  exit /b 1
)

echo [3/4] Configuring runner...
if exist ".\svc.cmd" (
  call .\svc.cmd uninstall >nul 2>nul
)
if exist ".\.runner" (
  call .\config.cmd remove --token %RUNNER_TOKEN% >nul 2>nul
)

call .\config.cmd --unattended --url %REPO_URL% --token %RUNNER_TOKEN% --name zekoro-vps-runner --work %WORK_DIR% --replace
if errorlevel 1 (
  echo [ERROR] Runner config failed.
  pause
  exit /b 1
)

echo [4/4] Installing runner service...
call .\svc.cmd install
if errorlevel 1 (
  echo [ERROR] Runner service install failed.
  pause
  exit /b 1
)
call .\svc.cmd start
if errorlevel 1 (
  echo [ERROR] Runner service start failed.
  pause
  exit /b 1
)

echo.
echo [SUCCESS] Auto-deploy runner installed.
echo The deploy workflow restarts the website without stopping the runner
echo or requiring a Windows service for the website/game server.
echo From now on use quick-push.bat after edits.
pause
exit /b 0
