@echo off
chcp 65001 >nul
where python >nul 2>nul
if %errorlevel%==0 (python server.py) else (py server.py)
pause
