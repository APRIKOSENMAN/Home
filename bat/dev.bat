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

start "" http://localhost:3000
npm run dev
