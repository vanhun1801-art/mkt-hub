@echo off
chcp 65001 >nul
title Marketing Hub - Rooty Trip
cd /d "%~dp0"
echo.
echo   Dang khoi dong Marketing Hub va cac module...
echo   Mo trinh duyet tai http://localhost:5180
echo.
start "" http://localhost:5180
node server.js
pause
