@echo off
:loop
echo "Starting Catalog Render RCC"
RCCService.exe -Console -verbose -settingsfile "Settings.json" -port 4621
timeout /t 1 /nobreak >nul
goto loop
