@echo off
chcp 65001 >nul
title Dang ky tac vu dong bo quang cao
cd /d "%~dp0"

echo.
echo   Se dang ky mot tac vu Windows chay moi 3 gio:
echo     Ten tac vu : RootyAdsSync
echo     Chay        : %~dp0dong-bo-nen.bat
echo     Log         : %~dp0dong-bo.log
echo.
echo   Tac vu chi chay khi may dang bat va da dang nhap.
echo.
set /p OK=  Dong y? [y/N]
if /i not "%OK%"=="y" goto :huy

schtasks /Create /TN "RootyAdsSync" /TR "\"%~dp0dong-bo-nen.bat\"" /SC HOURLY /MO 3 /F
if errorlevel 1 goto :loi

echo.
echo   Da dang ky xong.
echo.
echo   Xem tac vu       : schtasks /Query /TN RootyAdsSync
echo   Chay thu ngay    : schtasks /Run   /TN RootyAdsSync
echo   Bo tac vu        : xoa-tac-vu.bat
echo.
goto :xong

:loi
echo.
echo   Dang ky that bai. Thu chay lai file nay bang "Run as administrator".
echo.
goto :xong

:huy
echo.
echo   Da huy, khong thay doi gi.
echo.

:xong
pause
