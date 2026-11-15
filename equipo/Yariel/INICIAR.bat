@echo off
setlocal
set "BOOT=%~dp0..\..\orquestacion\windows\bootstrap.ps1"
if not exist "%BOOT%" set "BOOT=%~dp0kit\orquestacion\windows\bootstrap.ps1"
if not exist "%BOOT%" (
  echo Descomprime todo el paquete FIRESYNC-Yariel.zip antes de ejecutar.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BOOT%" -Station pc-3-yariel
set "RESULT=%ERRORLEVEL%"
echo.
echo FIRESYNC termino con codigo %RESULT%. Conserva esta carpeta y los worktrees.
pause
exit /b %RESULT%