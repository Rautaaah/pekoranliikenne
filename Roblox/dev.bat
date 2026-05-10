@echo off
cd /d "%~dp0"

call :is_port_in_use 5000
if "%PORT_IN_USE%"=="1" (
    echo Website already running on port 5000.
    exit /b 0
)

REM Supervisor: relaunch on crash.
:loop
dotnet run --project Roblox.Website --configuration Release
echo [supervisor] %date% %time% website exited with code %errorlevel%, restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop

:is_port_in_use
set "PORT_IN_USE=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /i /c:":%~1 " ^| findstr /i "LISTENING"') do (
    set "PORT_IN_USE=1"
)
exit /b 0
