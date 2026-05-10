@echo off
:rcc
call run.bat
echo RCC stopped. Restarting in 5 seconds...
timeout /t 5 >nul
goto rcc
