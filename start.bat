@echo off
echo.
echo  ================================================
echo   Peach CRM - Starting...
echo  ================================================
echo.

where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Docker is not installed or not running.
    echo  Please install Docker Desktop from: https://docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo  Starting database and app...
docker-compose up --build -d

echo.
echo  Waiting for app to be ready...
timeout /t 8 /nobreak >nul

echo.
echo  ================================================
echo   App is running at: http://localhost:3001
echo.
echo   Login:
echo   Email:    admin@peach-crm.local
echo   Password: Admin1234!
echo  ================================================
echo.

start http://localhost:3001

pause
