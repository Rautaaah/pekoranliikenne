@echo off
setlocal EnableDelayedExpansion

REM Hard-stop for everything launched by start.bat. Unlike stop.bat (port-based),
REM this also kills the supervisor cmd.exe windows (which are now :loop-based and
REM would otherwise immediately respawn the service after a child kill).
REM
REM Strategy:
REM   1) Kill by window title -> takes out the supervisor cmd.exe AND its tree
REM      (these titles are set by start.bat when it launches each service).
REM   2) Belt-and-suspenders: kill by listening port for any orphan that wasn't
REM      launched via start.bat (manual `npm start`, debugger run, etc.).

set "MODE=all"
for %%A in (%*) do (
    if /i "%%~A"=="site" set "MODE=site"
)

echo === KILL: site supervisors ===
call :kill_window "frontend"
call :kill_window "asset-validation"
call :kill_window "website"

echo === KILL: site orphans by port ===
call :kill_port 3000 "frontend"
call :kill_port 4300 "asset-validation"
call :kill_port 5000 "website"

if /i "%MODE%"=="site" goto :done

echo === KILL: rcc supervisors ===
call :kill_window "game-server"
call :kill_window "game-renderer"

echo === KILL: rcc orphans by port ===
call :kill_port 3040  "game-server"
call :kill_port 3189  "game-server-ws"
call :kill_port 7832  "game-renderer"
call :kill_port 64989 "rccservice2020"

echo === KILL: stray RCCService.exe instances (per-jobId game RCCs) ===
taskkill /F /IM RCCService.exe /T >nul 2>&1
if "%errorlevel%"=="0" (
    echo Killed stray RCCService.exe instances.
) else (
    echo No RCCService.exe running.
)

:done
echo === KILL: done ===
exit /b 0


REM --- Kill any cmd.exe whose window title starts with the given name (case-insensitive).
REM     /T also nukes the child process (the actual service: node/dotnet/go/...).
:kill_window
set "TITLE=%~1"
set "BEFORE_HIT=0"
for /f "tokens=2 delims=," %%P in ('tasklist /v /fo csv /nh /fi "IMAGENAME eq cmd.exe" ^| findstr /i /c:"\"%TITLE%"') do (
    set "BEFORE_HIT=1"
    set "PID=%%~P"
    echo Killing supervisor "%TITLE%" PID !PID!
    taskkill /PID !PID! /T /F >nul 2>&1
)
if "!BEFORE_HIT!"=="0" (
    echo No supervisor window titled "%TITLE%" found.
)
exit /b 0


REM --- Kill whatever is listening on the given TCP port (legacy stop.bat behavior).
:kill_port
set "PORT=%~1"
set "NAME=%~2"
set "FOUND=0"
for /f %%P in ('powershell -NoProfile -Command "(Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) 2>$null"') do (
    set "FOUND=1"
    echo Killing %NAME% on port %PORT% ^(PID %%P^)
    taskkill /PID %%P /T /F >nul 2>&1
)
if "%FOUND%"=="0" (
    echo %NAME% not listening on port %PORT%.
)
exit /b 0
