@echo off
cd /d "%~dp0"
start "GridWise Backend" cmd /k run-backend.bat
start "GridWise Frontend" cmd /k run-frontend.bat

echo Starting GridWise AI. The browser opens in about 20 seconds.
timeout /t 20 >nul
start http://localhost:5173