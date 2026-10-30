@echo off
setlocal
cd /d "%~dp0"
set "GC_NO_BROWSER=0"
where node >nul 2>nul
if errorlevel 1 (
 echo [ERROR] Necesita Node.js 18 o superior para ejecutar la aplicacion local.
 echo Instale Node.js desde su pagina oficial y vuelva a abrir RUN_LOCAL.cmd.
 pause
 exit /b 1
)
echo ===========================================================
echo       GREEN CALL  ^|  SUPPLY CHAIN INTELLIGENCE
 echo ===========================================================
echo Abrira el navegador en 127.0.0.1:8788, o el siguiente puerto libre.
echo Conserve esta ventana abierta durante el uso del dashboard.
echo La clave de administracion se mostrara en esta ventana.
echo.
node local-server.mjs
if errorlevel 1 (
 echo El servidor termino con error.
 pause
 exit /b 1
)
endlocal
