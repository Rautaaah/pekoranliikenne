@echo off
cd /d "%~dp0"

call :is_port_in_use 4300
if "%PORT_IN_USE%"=="1" (
    echo Asset validation already running on port 4300.
    exit /b 0
)

REM Supervisor: relaunch on crash.
:loop
go run main.go
echo [supervisor] %date% %time% asset-validation exited with code %errorlevel%, restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop

:is_port_in_use
set "PORT_IN_USE=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /i /c:":%~1 " ^| findstr /i "LISTENING"') do (
    set "PORT_IN_USE=1"
)
exit /b 0
