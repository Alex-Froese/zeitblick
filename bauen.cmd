@echo off
rem Baut den Zeitblick-Kern (Zeitblick.exe) mit dem in Windows eingebauten C#-Compiler.
rem Nichts muss installiert werden. Einfach doppelklicken oder im Terminal ausfuehren.
setlocal
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo Der C#-Compiler des .NET Framework 4 wurde nicht gefunden.
  exit /b 1
)

if not exist kern\zeitblick.ico powershell -NoProfile -ExecutionPolicy Bypass -File werkzeuge\symbol-erzeugen.ps1

rem Laeuft genau dieses Zeitblick noch? Dann beenden, sonst ist Zeitblick.exe gesperrt.
powershell -NoProfile -Command "$p = Get-Process Zeitblick -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path '%~dp0' 'Zeitblick.exe') }; if ($p) { Write-Host 'Zeitblick laeuft noch und wird fuer den Neubau beendet ...'; $p | ForEach-Object { $_.CloseMainWindow() | Out-Null }; Start-Sleep -Milliseconds 400; $p | Where-Object { -not $_.HasExited } | Stop-Process; Start-Sleep -Milliseconds 800 }"

"%CSC%" /nologo /target:winexe /optimize+ /utf8output /codepage:65001 ^
  /out:Zeitblick.exe ^
  /win32icon:kern\zeitblick.ico ^
  /resource:kern\zeitblick.ico,zeitblick.ico ^
  /r:System.Web.Extensions.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Security.dll ^
  /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll ^
  kern\*.cs
if errorlevel 1 (
  echo.
  echo Bauen fehlgeschlagen.
  if "%1"=="" pause
  exit /b 1
)
echo Zeitblick.exe ist gebaut.
if "%1"=="" timeout /t 3 >nul
exit /b 0
