@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies, please wait...
  call npm install
)
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
