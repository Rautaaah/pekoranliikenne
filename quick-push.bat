@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not installed or not in PATH.
  pause
  exit /b 1
)

set "msg=%~1"
if "%msg%"=="" (
  for /f "tokens=1-3 delims=/" %%a in ("%date%") do set d=%%a-%%b-%%c
  for /f "tokens=1-3 delims=:." %%a in ("%time%") do set t=%%a-%%b-%%c
  set "msg=auto update !d! !t!"
)

echo [INFO] Adding changes...
git add .
if errorlevel 1 (
  echo [ERROR] git add failed.
  pause
  exit /b 1
)

echo [INFO] Committing...
git commit -m "%msg%"
if errorlevel 1 (
  echo [INFO] No new changes to commit, continuing to push.
)

echo [INFO] Pushing to origin/main...
git pull --rebase origin main
if errorlevel 1 (
  echo [ERROR] git pull --rebase failed.
  pause
  exit /b 1
)

git push origin main
if errorlevel 1 (
  echo [ERROR] git push failed.
  pause
  exit /b 1
)

echo [SUCCESS] Done.
pause
exit /b 0