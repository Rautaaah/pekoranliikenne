@echo off
REM Launches the new 2-pool RCC layout used by game-renderer:
REM   Pool CatalogGame  -> port 1621 (catalog + place/game thumbnails)
REM   Pool ImagePlayer  -> port 2621 (image  + player avatar/headshot)
REM
REM Each pool is a single RCCService.exe spawned in its own window via
REM the matching supervisor .bat (which auto-restarts the process if it
REM dies). We skip a pool whose port is already in use so re-running
REM start_new.bat is safe.
setlocal
cd /d "%~dp0"

call :launch_if_free 1621 "CatalogGame" "RCCCatalogGameRender.bat"
call :launch_if_free 2621 "ImagePlayer" "RCCImagePlayerRender.bat"

echo.
echo Done. Status: http://127.0.0.1:7832/status
exit /b 0

:launch_if_free
set "PORT=%~1"
set "POOL=%~2"
set "SCRIPT=%~3"
call :is_port_in_use "%PORT%"
if "%PORT_IN_USE%"=="1" (
    echo [skip] %POOL% RCC already running on port %PORT%.
    exit /b 0
)
echo [start] %POOL% RCC -^> port %PORT% via %SCRIPT%
start "RCC %POOL% (%PORT%)" cmd /k "cd /d ""%~dp0"" && call ""%SCRIPT%"""
exit /b 0

:is_port_in_use
set "PORT_IN_USE=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /i /c:":%~1 " ^| findstr /i "LISTENING"') do (
    set "PORT_IN_USE=1"
)
exit /b 0
