@echo off
setlocal

set "MODE=all"
for %%A in (%*) do (
    if /i "%%~A"=="site" set "MODE=site"
)

echo STOPPING SITE
call :kill_port 3000 "frontend"
call :kill_port 4300 "asset-validation"
call :kill_port 5000 "website"

if /i "%MODE%"=="site" exit /b 0

echo STOPPING RCC
call :kill_port 3040 "game-server"
call :kill_port 3189 "game-server-ws"
call :kill_port 64989 "rccservice2020"
call :kill_port 7832 "game-renderer"
REM Renderer RCC 2-pool layout (CatalogGame=1621, ImagePlayer=2621).
call :kill_port 1621 "rcc-render-catalog-game"
call :kill_port 2621 "rcc-render-image-player"
exit /b 0

:kill_port
set "PORT=%~1"
set "NAME=%~2"
set "FOUND=0"
for /f %%P in ('powershell -NoProfile -Command "(Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) 2>$null"') do (
    set "FOUND=1"
    echo Stopping %NAME% on port %PORT% ^(PID %%P^)
    taskkill /PID %%P /T /F >nul 2>&1
)
if "%FOUND%"=="0" (
    echo %NAME% not running on port %PORT%.
)
exit /b 0
