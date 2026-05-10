@echo off
REM Focused kill for the .NET website only. Use this when an orphan
REM Roblox.Website.exe is still holding port 5000 and blocking a rebuild.
REM
REM For the full site stack (frontend + asset-validation + website) use:
REM     kill.bat site
REM For everything (site + RCC stack) use:
REM     kill.bat

setlocal

REM 1) Kill any supervisor cmd window started by start.bat with title "website".
for /f "tokens=2 delims=," %%P in ('tasklist /v /fo csv /nh /fi "IMAGENAME eq cmd.exe" ^| findstr /i /c:"\"website"') do (
    echo Killing website supervisor PID %%~P
    taskkill /PID %%~P /T /F >nul 2>&1
)

REM 2) Kill the .NET process directly by image name.
taskkill /F /IM Roblox.Website.exe >nul 2>&1
if "%errorlevel%"=="0" (
    echo Killed Roblox.Website.exe
) else (
    echo No Roblox.Website.exe running.
)

REM 3) Belt-and-suspenders: anything still listening on port 5000.
for /f %%P in ('powershell -NoProfile -Command "(Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) 2>$null"') do (
    echo Killing orphan on port 5000 PID %%P
    taskkill /PID %%P /T /F >nul 2>&1
)

echo Done. Port 5000 should be free.
endlocal
