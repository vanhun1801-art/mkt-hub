@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo ============================================================
echo  CAP NHAT BAN DO PHU QUOC
echo   1. Keo du lieu tour moi nhat tu Base "San pham"
echo   2. So sanh thay doi (tour moi / go / doi gia / doi trang thai)
echo   3. Dong goi hinh trong hinh-rieng + cap nhat file tren Desktop
echo ============================================================
echo.
node tao\cap-nhat.js
if errorlevel 1 (echo. & echo LOI: cap nhat khong thanh cong. & pause & exit /b 1)
echo.
echo XONG. Mo lai file tren Desktop: Ban-do-du-lich-Phu-Quoc-thu-nghiem-2b.html
echo Nhat ky thay doi: lark-ban-do\NHAT-KY-CAP-NHAT.txt
pause
