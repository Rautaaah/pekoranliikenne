
@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "MODE=all"

for %%A in (%*) do (
    if /i "%%~A"=="site" set "MODE=site"
)

echo.
echo          STARTING SANSY SERVICES
echo.

REM Start PostgreSQL database service
echo STARTING POSTGRESQL
call :ensure_service "postgresql-x64-17"

REM Start Redis only if it is not already listening
echo.
echo STARTING REDIS
call :launch_if_free "redis" "%ROOT%" "start-redis.bat" 6379

REM Start site services
echo.
echo STARTING SITE
call :launch_if_free "frontend" "%ROOT%\frontend" "start.bat" 3000
call :launch_if_free "asset-validation" "%ROOT%\AssetValidationServiceV2" "run.bat" 4300
call :launch_if_free "website" "%ROOT%\Roblox\Roblox.Website" "run.bat" 5000

if /i "%MODE%"=="site" goto :end

echo.
echo Waiting 20 seconds before starting game services...
timeout /t 20 /nobreak >nul

echo.
echo STARTING GAME SERVICES
call :launch_if_free "game-server" "%ROOT%\game-server" "start.bat" 3040 3189
call :launch_if_free "game-renderer" "%ROOT%\game-renderer" "run.bat" 7832

echo.
echo STARTING RENDERER RCC POOLS
REM RCCService2020 is also spawned on-demand by game-server.
call :launch_if_free "rcc-render-catalog-game" "%ROOT%\RCCServiceOther\RCCService2020" "RCCCatalogGameRender.bat" 1621
call :launch_if_free "rcc-render-image-player" "%ROOT%\RCCServiceOther\RCCService2020" "RCCImagePlayerRender.bat" 2621

:end
echo.
echo           STARTUP COMMANDS SENT
echo Check each opened window for errors.
echo.
exit /b 0


:ensure_service
sc query "%~1" | findstr /i "RUNNING" >nul
if errorlevel 1 (
    echo Starting Windows service: %~1
    sc start "%~1"
) else (
    echo %~1 is already running.
)
exit /b 0


:launch_if_free
set "LAUNCH_NAME=%~1"
set "LAUNCH_WORKDIR=%~2"
set "LAUNCH_SCRIPT=%~3"

if not exist "%LAUNCH_WORKDIR%\%LAUNCH_SCRIPT%" (
    echo WARNING: Missing %LAUNCH_WORKDIR%\%LAUNCH_SCRIPT%
    exit /b 0
)

call :is_port_in_use "%~4"
if "%PORT_IN_USE%"=="1" (
    echo %LAUNCH_NAME% already running on port %~4, skipping.
    exit /b 0
)

if not "%~5"=="" (
    call :is_port_in_use "%~5"
    if "%PORT_IN_USE%"=="1" (
        echo %LAUNCH_NAME% already running on port %~5, skipping.
        exit /b 0
    )
)

call :launch "%LAUNCH_NAME%" "%LAUNCH_WORKDIR%" "%LAUNCH_SCRIPT%"
exit /b 0


:launch
set "LAUNCH_NAME=%~1"
set "LAUNCH_WORKDIR=%~2"
set "LAUNCH_SCRIPT=%~3"
echo Launching %LAUNCH_NAME%...
start "%LAUNCH_NAME%" cmd /k "cd /d ""%LAUNCH_WORKDIR%"" && call ""%LAUNCH_SCRIPT%"""
exit /b 0


:is_port_in_use
set "PORT_IN_USE=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /i /c:":%~1 " ^| findstr /i "LISTENING"') do (
    set "PORT_IN_USE=1"
)
exit /b 0
