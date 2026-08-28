@echo off
chcp 65001 >nul
title Rooty Trip - Lich tac nghiep
cd /d "%~dp0"
echo.
echo   Dang khoi dong... Mo trinh duyet tai http://localhost:5174
echo.
start "" http://localhost:5174
node server.js
pause
