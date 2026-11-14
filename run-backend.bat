@echo off
cd /d "%~dp0backend"
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install -r requirements.txt
set SECRET_KEY=change-this-secret-for-demo
set CORS_ORIGINS=http://localhost:5173
if exist "%~dp0email-settings.bat" call "%~dp0email-settings.bat"
python -m uvicorn app.main:app --reload
pause