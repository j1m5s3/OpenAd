@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sim-down.ps1" %*
exit /b %ERRORLEVEL%
