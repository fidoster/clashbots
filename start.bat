@echo off
title Clashbots launcher
cd /d "%~dp0"

echo ============================================
echo             Starting Clashbots
echo ============================================
echo.

REM --- Free the ports if something is already using them ---
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

REM --- Install dependencies on first run ---
if not exist "server\node_modules" (
  echo Installing server dependencies ^(first run, please wait^)...
  pushd server && call npm install && popd
)
if not exist "web\node_modules" (
  echo Installing web dependencies ^(first run, please wait^)...
  pushd web && call npm install && popd
)

REM --- Launch backend and frontend, each in its own window ---
start "Clashbots API" cmd /k "cd /d server && npm run start"
start "Clashbots Web" cmd /k "cd /d web && npm run dev"

REM --- Wait for the web server to boot, then open Chrome ---
echo.
echo Waiting for the app to start...
timeout /t 6 /nobreak >nul
start chrome "http://localhost:5173"
if errorlevel 1 start "" "http://localhost:5173"

echo.
echo  Clashbots is running:
echo    Web app : http://localhost:5173
echo    API     : http://localhost:8787
echo.
echo  Two terminal windows opened (API and Web).
echo  To STOP: close those two windows, or run stop.bat.
echo  You can close THIS window now.
echo.
pause
