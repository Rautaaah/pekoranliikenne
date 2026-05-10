@echo off
cd /d "%~dp0"

call :is_port_in_use 64989
if "%PORT_IN_USE%"=="1" (
    echo RCCService already running on port 64989.
    exit /b 0
)

RCCService.exe -Console -Port 64989
exit /b 0

:is_port_in_use
set "PORT_IN_USE=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /i /c:":%~1 " ^| findstr /i "LISTENING"') do (
    set "PORT_IN_USE=1"
)
exit /b 0
