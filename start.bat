@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "MODE=all"

for %%A in (%*) do (
    if /i "%%~A"=="site" set "MODE=site"
)

echo STARTING SITE
call :launch_if_free "frontend" "%ROOT%\frontend" "start.bat" 3000
call :launch_if_free "asset-validation" "%ROOT%\AssetValidationServiceV2" "run.bat" 4300
call :launch_if_free "website" "%ROOT%\Roblox" "dev.bat" 5000

if /i "%MODE%"=="site" exit /b 0

echo Waiting 20 seconds before STARTING RCC...
timeout /t 20 /nobreak >nul

echo STARTING RCC
REM RCCService2020 is spawned on-demand by game-server (see game-server/config.json -> "rcc"),
REM so we DO NOT start it standalone here.
call :launch_if_free "game-server" "%ROOT%\game-server" "start.bat" 3040 3189
call :launch_if_free "game-renderer" "%ROOT%\game-renderer" "run.bat" 7832

REM Renderer RCC pool (2-RCC layout): one instance for catalog/game,
REM one for image/player. start_new.bat is idempotent — re-running it
REM skips ports that are already listening, so it's safe to call here.
call :launch_if_free "rcc-render-catalog-game" "%ROOT%\RCCServiceOther\RCCService2020" "RCCCatalogGameRender.bat" 1621
call :launch_if_free "rcc-render-image-player" "%ROOT%\RCCServiceOther\RCCService2020" "RCCImagePlayerRender.bat" 2621
exit /b 0

:launch_if_free
set "LAUNCH_NAME=%~1"
set "LAUNCH_WORKDIR=%~2"
set "LAUNCH_SCRIPT=%~3"
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
start "%LAUNCH_NAME%" cmd /k "cd /d ""%LAUNCH_WORKDIR%"" && call ""%LAUNCH_SCRIPT%"""
exit /b 0

:is_port_in_use
set "PORT_IN_USE=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /i /c:":%~1 " ^| findstr /i "LISTENING"') do (
    set "PORT_IN_USE=1"
)
exit /b 0
