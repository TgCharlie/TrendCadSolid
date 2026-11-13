@echo off
goto :powershell_server

:powershell_server
start "TrendCad Solid server" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

:open_browser
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4173"
