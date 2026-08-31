@echo off
title DOCPlus AI+ Platform
color 0B

echo.
echo  ============================================================
echo   DOCPlus AI+  -  Unified Document Intelligence Platform
echo  ============================================================
echo.

REM Kill any stale processes on ports 8000 and 5173
echo  Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :8000 ^| findstr LISTEN') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :5173 ^| findstr LISTEN') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Small pause after killing
timeout /t 2 /nobreak >nul

REM Copy .env if missing
if not exist "%~dp0backend\.env" (
    copy "%~dp0backend\.env.example" "%~dp0backend\.env" >nul 2>&1
    echo  [setup] Created backend\.env
)
if not exist "%~dp0frontend\.env" (
    echo VITE_API_URL=http://localhost:8000 > "%~dp0frontend\.env"
    echo  [setup] Created frontend\.env
)

echo  Starting Backend  (port 8000)...
start "DOCPlus AI+ Backend" cmd /k "cd /d "%~dp0backend" && python migrate_db.py && python main.py"

echo  Waiting 8s for backend to initialize...
timeout /t 8 /nobreak >nul

echo  Starting Frontend (port 5173)...
start "DOCPlus AI+ Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 4 /nobreak >nul

echo.
echo  ============================================================
echo   Frontend  :  http://localhost:5173
echo   Backend   :  http://localhost:8000
echo   API Docs  :  http://localhost:8000/docs
echo  ============================================================
echo.

start http://localhost:5173
pause
