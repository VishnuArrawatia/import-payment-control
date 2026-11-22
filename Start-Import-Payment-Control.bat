@echo off
cd /d "F:\Import Payment management"
echo Starting Import Payment Control Server...
echo Data saved in F:\Import Payment management\data\ipc-database.json
start "" cmd /c "timeout /t 2 >nul & start http://localhost:5173/"
node server.mjs
pause
