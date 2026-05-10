@echo off
setlocal
cd /d "%~dp0"

call :is_port_in_use 7832
if "%PORT_IN_USE%"=="1" (
    echo Game renderer already running on port 7832.
    exit /b 0
)

echo Running npm run build...
call npm run build

if %errorlevel% neq 0 (
    echo Build failed with error code %errorlevel%.
    exit /b %errorlevel%
)

echo Build completed successfully. Entering supervisor loop.
REM Supervisor: keeps game-renderer alive forever. Two reasons it can exit:
REM   1) Crash / unhandled error -> restart immediately.
REM   2) Hits the 20-minute scheduled restart -> kill tree, rebuild RAM/cache, relaunch.
REM Both paths fall through to the `goto loop` below.
:loop
echo [supervisor] %date% %time% starting game-renderer (max-lifetime 20m)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$p = Start-Process -FilePath $env:ComSpec -ArgumentList '/c','npm run start' -PassThru -NoNewWindow;" ^
  "$deadline = (Get-Date).AddMinutes(20);" ^
  "while (-not $p.HasExited -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 5 };" ^
  "if (-not $p.HasExited) {" ^
  "  Write-Host '[supervisor] 20m elapsed, killing game-renderer for a fresh-cache restart';" ^
  "  cmd /c \"taskkill /T /F /PID $($p.Id) >nul 2>&1\";" ^
  "  $p.WaitForExit();" ^
  "} else {" ^
  "  Write-Host ('[supervisor] game-renderer exited on its own with code ' + $p.ExitCode);" ^
  "}"
echo [supervisor] restarting in 3s...
timeout /t 3 /nobreak >nul
goto loop

:is_port_in_use
set "PORT_IN_USE=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /i /c:":%~1 " ^| findstr /i "LISTENING"') do (
    set "PORT_IN_USE=1"
)
exit /b 0
