@echo off
rem Chay dong bo o che do nen, ghi log de xem lai. Dung cho Task Scheduler.
cd /d "%~dp0"
echo. >> dong-bo.log
echo ===== %DATE% %TIME% ===== >> dong-bo.log
"C:\Program Files\nodejs\node.exe" dong-bo.js >> dong-bo.log 2>&1
