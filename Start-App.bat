@echo off
title MPCUKBJKR - Option Chain Scanner
cd /d "D:\semrol-excel-code"

:: Check if proxy is already running on port 3001
netstat -ano | findstr :3001 >nul
if %errorlevel% equ 0 (
    echo Proxy server is already active on port 3001.
) else (
    echo Starting Option Chain Proxy server in background...
    start /b "" node proxy.js
    timeout /t 2 /nobreak >nul
)

echo Opening Option Chain Scanner in browser...
start http://localhost:3001
exit
