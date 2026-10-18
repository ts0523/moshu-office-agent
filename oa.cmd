@echo off
setlocal
cd /d "%~dp0"
node "cli\oa.mjs" %*
exit /b %errorlevel%
