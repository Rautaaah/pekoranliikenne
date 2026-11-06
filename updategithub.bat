
@echo off
setlocal
cd /d "%~dp0"


echo       github updater

for /f %%B in ('git branch --show-current') do set "BRANCH=%%B"

if not defined BRANCH (
    echo ERROR: Could not detect Git branch.
    pause
    exit /b 1
)

git add -u
git add updategithub.bat updatefromgithub.bat

git diff --cached --check
if errorlevel 1 (
    echo ERROR:fix the whitespace errors pls
    pause
    exit /b 1
)

echo.
echo Changes being committed:
git diff --cached --stat

echo.
choice /m "Commit and upload these changes to GitHub"
if errorlevel 2 exit /b 0

set /p "MSG=Enter update description: "
if not defined MSG set "MSG=Sansy update"

git commit -m "%MSG%"
if errorlevel 1 (
    echo Commit failed. Nothing was pushed.
    pause
    exit /b 1
)

git push origin "%BRANCH%"
if errorlevel 1 (
    echo Push failed. Check your GitHub connection.
    pause
    exit /b 1
)

echo.
echo SUCCESS! GitHub has been updated.
pause
