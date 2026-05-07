@echo off
cd /d C:\Users\amasc\website
git add -A
set /p msg=Commit-Nachricht:
git commit -m "%msg%"
git push origin main
pause
