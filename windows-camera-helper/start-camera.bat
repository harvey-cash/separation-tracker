@echo off
title Brave Paws Remote Camera
echo Initializing Brave Paws Camera Setup...

:: Check if PowerShell is available
where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: PowerShell is required to run this script.
    pause
    exit /b 1
)

:: Run the PowerShell orchestration script and bypass execution policy for this run only
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0setup-and-run.ps1"

:: If the script crashes or completes, pause so the user can read the error
pause