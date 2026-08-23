@echo off
title Cuckoo Dev Boot
echo Starting Cuckoo (backend :3000 / frontend :5173)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-all.ps1"
pause
