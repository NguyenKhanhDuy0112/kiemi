@echo off
rem Kiemi CLI (X-04): runs the app's own Electron as plain Node, no window.
rem This file sits in <install>\resources\cli\.
setlocal
set "RES=%~dp0.."
set "ELECTRON_RUN_AS_NODE=1"
set "KIEMI_CLI=%~f0"
"%RES%\..\Kiemi.exe" "%RES%\app.asar\out\main\cli.js" %*
exit /b %ERRORLEVEL%
