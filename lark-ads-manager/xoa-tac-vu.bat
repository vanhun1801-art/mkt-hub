@echo off
chcp 65001 >nul
title Bo tac vu dong bo quang cao
schtasks /Delete /TN "RootyAdsSync" /F
echo.
echo   Da bo tac vu RootyAdsSync (neu truoc do co).
echo.
pause
