@echo off
chcp 65001 >nul
title Rooty Trip - Quy chi phi Marketing
cd /d "%~dp0"
echo.
echo   Dang khoi dong... Mo trinh duyet tai http://localhost:5182
echo.
start "" http://localhost:5182
node server.js
pause
