# Startet eine Testinstanz von Zeitblick zum Ausprobieren – ohne die echten Daten, ohne den Vault, ohne GitHub.
#   Port 42488, Fenstertitel „TEST · Zeitblick“, eigener Taskleisten-Ausweis (Froese.Zeitblick.Test), kein Autostart.
#   Daten, Test-Vault (Statusdatei, Spiegel) und die Gist-Attrappe liegen in %LOCALAPPDATA%\Froese\Zeitblick-Test\.
#   Die App am Laptop: http://127.0.0.1:42488 · die App wie am Handy (ohne Kern): http://localhost:42488
#   Kürzel: „Zeitblick zeigen“ ist aus (gehört dem echten Zeitblick), „Neuer Vorgang“ = Strg+Alt+A.
# Aufruf:  powershell -ExecutionPolicy Bypass -File werkzeuge\testinstanz.ps1             (starten, ohne Fenster)
#          powershell -ExecutionPolicy Bypass -File werkzeuge\testinstanz.ps1 -MitFenster (starten und Fenster öffnen)
#          powershell -ExecutionPolicy Bypass -File werkzeuge\testinstanz.ps1 -Beenden    (beenden)
#          powershell -ExecutionPolicy Bypass -File werkzeuge\testinstanz.ps1 -Neu        (Testdaten frisch anlegen)
param([switch]$Beenden, [switch]$Neu, [switch]$MitFenster, [int]$Port = 42488)
$ErrorActionPreference = 'Stop'
$wurzel = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $wurzel 'Zeitblick.exe'
$basis = Join-Path $env:LOCALAPPDATA 'Froese\Zeitblick-Test'
$daten = Join-Path $basis 'daten'
$vault = Join-Path $basis 'vault'

function Laeuft { try { (Invoke-RestMethod "http://127.0.0.1:$Port/api/ping" -TimeoutSec 2).programm -eq 'zeitblick' } catch { $false } }

if ($Beenden) {
    if (-not (Laeuft)) { Write-Host 'Die Testinstanz läuft nicht.'; exit 0 }
    $k = (Get-Content (Join-Path $daten 'kern-schluessel.txt')).Trim()
    try { Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/beenden" -Method POST -Headers @{ 'X-Schluessel' = $k } -UseBasicParsing | Out-Null } catch { }
    for ($i = 0; $i -lt 30 -and (Laeuft); $i++) { Start-Sleep -Milliseconds 200 }
    Write-Host 'Testinstanz beendet.'
    exit 0
}

if (-not (Test-Path $exe)) { throw 'Zeitblick.exe fehlt – erst bauen.cmd ausführen.' }
if ($Neu -and (Test-Path $basis)) {
    if (Laeuft) { throw 'Erst die Testinstanz beenden (-Beenden).' }
    Remove-Item -Recurse -Force $basis
}
foreach ($o in @($daten, (Join-Path $vault '_system-daten'), (Join-Path $vault 'Zeitblick'))) { New-Item -ItemType Directory -Force $o | Out-Null }
if (Laeuft) { Write-Host "Die Testinstanz läuft schon: http://127.0.0.1:$Port"; exit 0 }

$argumente = @('--test', '--port', $Port, '--daten', "`"$daten`"", '--vault', "`"$vault`"")
if (-not $MitFenster) { $argumente += '--still' }
Start-Process -FilePath $exe -ArgumentList $argumente | Out-Null
for ($i = 0; $i -lt 50 -and -not (Laeuft); $i++) { Start-Sleep -Milliseconds 200 }
if (-not (Laeuft)) { throw 'Die Testinstanz startet nicht (Protokoll: ' + (Join-Path $daten 'protokoll.txt') + ').' }
Write-Host "Testinstanz läuft."
Write-Host "  App am Laptop:      http://127.0.0.1:$Port"
Write-Host "  App wie am Handy:   http://localhost:$Port   (Gist-Attrappe: http://localhost:$Port/testgist)"
Write-Host "  Testordner:         $basis"
