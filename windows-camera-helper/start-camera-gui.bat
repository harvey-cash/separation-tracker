@echo off
title Brave Paws Streamer
setlocal

set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%.."

if exist BravePawsStreamer.exe (
    BravePawsStreamer.exe
    popd
    exit /b %errorlevel%
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is required to run Brave Paws Streamer from the repo checkout.
    echo Install Node.js or use the packaged streamer bundle that includes BravePawsStreamer.exe.
    pause
    popd
    exit /b 1
)

if not exist node_modules (
    echo Installing helper dependencies...
    call npm install --omit=dev
    if %errorlevel% neq 0 (
        echo Failed to install dependencies.
        pause
        popd
        exit /b 1
    )
)

node windows-camera-helper-ui\server.cjs
popd