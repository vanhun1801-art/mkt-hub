@echo off
rem Chay dong bo o che do nen roi tu cham suc khoe. Dung cho Task Scheduler.
cd /d "%~dp0"
echo. >> dong-bo.log
echo ===== %DATE% %TIME% ===== >> dong-bo.log
"C:\Program Files\nodejs\node.exe" dong-bo.js >> dong-bo.log 2>&1
rem Cham diem va nhac neu hong. Luon chay ke ca khi dong bo that bai.
"C:\Program Files\nodejs\node.exe" giam-sat.js >> dong-bo.log 2>&1
