@echo off
title Booking OTA - Rooty Trip
cd /d "%~dp0"
echo Dang khoi dong app Booking OTA...
start "" http://localhost:5177
node server.js
pause
