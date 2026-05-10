@echo off
REM RCC instance #2 of the new 2-pool layout.
REM Serves /image/* and /player/* render requests from the renderer
REM (game-renderer config: Ports.RCC.ImagePlayer -> [2621]).
REM
REM Auto-restart loop: if RCCService.exe crashes (or is killed by the
REM watchdog), wait 1s and respawn so the pool is never down for long.
cd /d "%~dp0"
:loop
echo [%date% %time%] Starting ImagePlayer Render RCC on port 2621
RCCService.exe -Console -verbose -settingsfile "Settings.json" -port 2621
timeout /t 1 /nobreak >nul
goto loop
