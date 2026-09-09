@echo off
REM cmd.exe is not subject to PowerShell's execution policy (npm.ps1 / *.ps1 blocked).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
exit /b %ERRORLEVEL%
