@echo off
:loop
echo "Starting Player Render RCC"
RCCService.exe -Console -verbose -settingsfile "Settings.json" -port 1621
timeout /t 1 /nobreak >nul
goto loop
