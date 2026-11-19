@echo off
cd /d "%~dp0backend"

call .venv\Scripts\activate.bat

python -m pip install -r requirements.txt

set SECRET_KEY=change-this-secret-for-demo
set CORS_ORIGINS=http://localhost:5173

if exist ".env" (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
        if not "%%A"=="" set "%%A=%%B"
    )
)

if exist "%~dp0email-settings.bat" call "%~dp0email-settings.bat"

python -m uvicorn app.main:app --reload

pause