@echo off
cd /d "%~dp0"
start "" http://localhost:5188
node server.js
