@echo off
setlocal
cd /d "%~dp0"
echo.
echo  GreenCall - Conectar dashboard a Google Sheets
 echo.
echo  1. Esta guia explica la cuenta de servicio con permisos LECTOR.
echo  2. NO guarde la clave privada dentro de esta carpeta ni la suba a GitHub.
echo  3. Abra RUN_LOCAL.cmd y configure la conexion en Administracion.
echo.
start "" notepad.exe "%~dp0docs\GOOGLE_SHEETS_AUTOSYNC.md"
pause
