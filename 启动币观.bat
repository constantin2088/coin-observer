@echo off
setlocal EnableExtensions
title Coin Observer
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
set "coin_launch_exit=%errorlevel%"
if not "%coin_launch_exit%"=="0" pause
exit /b %coin_launch_exit%
