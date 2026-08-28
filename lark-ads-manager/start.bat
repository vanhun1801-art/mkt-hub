@echo off
title Quan ly quang cao da nen tang - Rooty Trip
cd /d "%~dp0"
echo Dang khoi dong app quan ly quang cao...
start "" http://localhost:5176
node server.js
pause
