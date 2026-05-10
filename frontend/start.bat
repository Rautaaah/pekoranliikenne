@echo off
cd /d "%~dp0"

call :is_port_in_use 3000
if "%PORT_IN_USE%"=="1" (
    echo Frontend already running on port 3000.
    exit /b 0
)

if not exist "node_modules\.bin\next.cmd" (
    echo Frontend dependencies are missing.
    echo Run npm install in this folder first.
    exit /b 1
)

if not exist ".next\BUILD_ID" (
    echo Frontend build is missing. Running npm run build...
    call npm run build
    if not exist ".next\BUILD_ID" exit /b 1
)

REM Supervisor: relaunch on crash. The build is already done above; only `npm run start` loops.
:loop
call npm run start
echo [supervisor] %date% %time% frontend exited with code %errorlevel%, restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop

:is_port_in_use
set "PORT_IN_USE=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /i /c:":%~1 " ^| findstr /i "LISTENING"') do (
    set "PORT_IN_USE=1"
)
exit /b 0
