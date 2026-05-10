@echo off
REM RCC instance #1 of the new 2-pool layout.
REM Serves /catalog/* and /game/* render requests from the renderer
REM (game-renderer config: Ports.RCC.CatalogGame -> [1621]).
REM
REM Auto-restart loop: if RCCService.exe crashes (or is killed by the
REM watchdog), wait 1s and respawn so the pool is never down for long.
cd /d "%~dp0"
:loop
echo [%date% %time%] Starting CatalogGame Render RCC on port 1621
RCCService.exe -Console -verbose -settingsfile "Settings.json" -port 1621
timeout /t 1 /nobreak >nul
goto loop
