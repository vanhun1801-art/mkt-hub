@echo off
chcp 65001 >nul
title Rooty Trip - Quan ly cong viec (Lark Base)
cd /d "%~dp0"
echo.
echo   Dang khoi dong server...
echo.
start "" http://localhost:5173
node server.js
pause
