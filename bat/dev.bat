@echo off
cd /d C:\Users\amasc\website

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   LOKALER SERVER WIRD GESTARTET...   ║
echo  ╚══════════════════════════════════════╝
echo.
echo  Oeffne im Browser:  http://localhost:3000
echo  Server stoppen:     Strg + C druecken
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING 2^>nul') do (
  taskkill /PID %%a /F >nul 2>&1
)

npm run dev
