@echo off
setlocal enabledelayedexpansion

echo ====================================================
echo CNC Vault - Universal Local Launcher Setup
echo ====================================================
echo.
echo This script sets up CNC Vault on your computer so CAD
echo drawings and engineering documents open directly in
echo your desktop applications.
echo.
echo No administrator privileges required.
echo.

set "TARGET_DIR=%USERPROFILE%\.cncvault"
if not exist "!TARGET_DIR!" mkdir "!TARGET_DIR!"

echo Installing launcher components...

if exist "%~dp0launcher.ps1" (
    copy /y "%~dp0launcher.ps1" "!TARGET_DIR!\launcher.ps1" >nul
) else (
    echo Downloading launcher from CNC Vault...
    powershell -ExecutionPolicy Bypass -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://pixel-perfect-nine-pi.vercel.app/launcher.ps1', '!TARGET_DIR!\launcher.ps1')" >nul 2>&1
)

if exist "%~dp0run.vbs" (
    copy /y "%~dp0run.vbs" "!TARGET_DIR!\run.vbs" >nul
) else (
    echo Downloading background runner...
    powershell -ExecutionPolicy Bypass -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://pixel-perfect-nine-pi.vercel.app/run.vbs', '!TARGET_DIR!\run.vbs')" >nul 2>&1
)

if not exist "!TARGET_DIR!\launcher.ps1" (
    echo.
    echo [ERROR] Could not download launcher.ps1. Please check your internet connection and try again.
    pause
    exit /b 1
)

echo Registering CNC Vault protocol in Windows...
reg add HKCU\SOFTWARE\Classes\cncvault /t REG_SZ /d "URL:CNC Vault Protocol" /f >nul
reg add HKCU\SOFTWARE\Classes\cncvault /v "URL Protocol" /t REG_SZ /d "" /f >nul
reg add HKCU\SOFTWARE\Classes\cncvault /v "FriendlyTypeName" /t REG_SZ /d "CNC Vault Local Launcher" /f >nul

reg add HKCU\SOFTWARE\Classes\cncvault\Application /v "ApplicationName" /t REG_SZ /d "CNC Vault Local Launcher" /f >nul

reg add HKCU\SOFTWARE\Classes\cncvault\shell\open\command /t REG_EXPAND_SZ /d "wscript.exe \"%USERPROFILE%\.cncvault\run.vbs\" \"%%1\"" /f >nul

echo.
echo ====================================================
echo Setup successfully completed!
echo You can now click "Open Locally" in CNC Vault.
echo ====================================================
echo.
pause
