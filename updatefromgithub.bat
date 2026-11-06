
@echo off
setlocal
cd /d "%~dp0"

echo UPDATE FROM GITHUB

git diff --quiet
if errorlevel 1 (
    echo ERROR: You have uncommitted local changes.
    echo Run updategithub.bat first, or save your work.
    pause
    exit /b 1
)

git diff --cached --quiet
if errorlevel 1 (
    echo ERROR: You have staged changes.
    echo Commit or unstage them before pulling.
    pause
    exit /b 1
)

for /f %%B in ('git branch --show-current') do set "BRANCH=%%B"

if not defined BRANCH (
    echo ERROR: Could not detect Git branch.
    pause
    exit /b 1
)

git pull --ff-only origin "%BRANCH%"

if errorlevel 1 (
    echo.
    echo UPDATE FAILED. Check the Git output above.
    pause
    exit /b 1
)

echo.
echo SUCCESS! managed to get the changes from github and applied it to the current src
pause
