@echo off
title Clashbots - stop
echo Stopping Clashbots (freeing ports 8787 and 5173)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
echo Done.
timeout /t 2 /nobreak >nul
