@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo [ERROR] Requiere Node.js 18 o posterior.
 pause
 exit /b 1
)
call npm run check
if errorlevel 1 goto fail
call npm run validate
if errorlevel 1 goto fail
call npm run http-qa
if errorlevel 1 goto fail
call npm run perf
if errorlevel 1 goto fail
echo.
echo QA tecnico y de datos: OK
pause
exit /b 0
:fail
echo QA detecto errores; revise docs\QA_AUTOMATICO.json.
pause
exit /b 1
