# Schnittstellentest des Zeitblick-Kerns gegen die Testinstanz (werkzeuge\testinstanz.ps1). Schreibt nur in den Testordner.
# Prüft: Schutz (Schlüssel, Host), Datenablage mit Revision und Konflikt, Kundenblick-Rechte, Auslieferung der App,
# verschlüsselten Abgleich mit der Gist-Attrappe (Gegenprobe mit eigener AES/HMAC-Umsetzung hier im Skript),
# Zusammenführung, Entwürfe, Statusdatei (nur Zahlen), Spiegel (nur im Vault-Ordner Zeitblick), Sicherung, Umzug.
# Aufruf: powershell -ExecutionPolicy Bypass -File werkzeuge\api-test.ps1 [-Port 42488]
param([int]$Port = 42488)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$basis = Join-Path $env:LOCALAPPDATA 'Froese\Zeitblick-Test'
$daten = Join-Path $basis 'daten'
$vault = Join-Path $basis 'vault'
$url = "http://127.0.0.1:$Port"
$schluessel = (Get-Content (Join-Path $daten 'kern-schluessel.txt')).Trim()
$script:ok = 0; $script:fehler = @()
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Pruefe([string]$name, [bool]$bedingung) {
    if ($bedingung) { $script:ok++ } else { $script:fehler += $name; Write-Host "FEHLER: $name" -ForegroundColor Red }
}

function Anfrage([string]$methode, [string]$pfad, $koerper = $null, [hashtable]$kopf = @{}, [switch]$OhneSchluessel, [string]$HostKopf = '') {
    $r = [System.Net.HttpWebRequest]::Create("$url$pfad")
    $r.Method = $methode; $r.Proxy = $null; $r.Timeout = 30000
    if (-not $OhneSchluessel) { $r.Headers['X-Schluessel'] = $schluessel }
    if ($HostKopf) { $r.Host = $HostKopf }
    foreach ($k in $kopf.Keys) { if ($k -eq 'If-None-Match') { $r.Headers.Add('If-None-Match', $kopf[$k]) } else { $r.Headers[$k] = $kopf[$k] } }
    if ($null -ne $koerper) {
        $text = if ($koerper -is [string]) { $koerper } else { $koerper | ConvertTo-Json -Depth 20 -Compress }
        $b = $utf8.GetBytes($text); $r.ContentType = 'application/json; charset=utf-8'; $r.ContentLength = $b.Length
        $s = $r.GetRequestStream(); $s.Write($b, 0, $b.Length); $s.Close()
    }
    try { $w = $r.GetResponse() } catch [System.Net.WebException] { $w = $_.Exception.Response; if (-not $w) { throw } }
    $sr = New-Object System.IO.StreamReader($w.GetResponseStream(), $utf8)
    $t = $sr.ReadToEnd(); $sr.Close()
    $erg = [pscustomobject]@{ Status = [int]$w.StatusCode; Text = $t; Etag = $w.Headers['ETag']; Json = $null }
    $w.Close()
    if ($t -and $t.TrimStart().StartsWith('{')) { try { $erg.Json = $t | ConvertFrom-Json } catch { } }
    return $erg
}

# ---------- Eigene Umsetzung des Verfahrens (Gegenprobe zu Krypto.cs und krypto.js) ----------
function Hmac([byte[]]$k, [byte[]]$d) { $h = New-Object System.Security.Cryptography.HMACSHA256 (, $k); return $h.ComputeHash($d) }
function Ableiten([byte[]]$haupt, [string]$zweck) { return Hmac $haupt ([System.Text.Encoding]::ASCII.GetBytes($zweck)) }
function AusBase32([string]$t) {
    $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $t = ($t.ToUpper().ToCharArray() | Where-Object { $a.IndexOf($_) -ge 0 }) -join ''
    $l = New-Object System.Collections.Generic.List[byte]; $p = 0; $bits = 0
    foreach ($c in $t.ToCharArray()) { $p = (($p -shl 5) -bor $a.IndexOf($c)) -band 0xFFFF; $bits += 5; if ($bits -ge 8) { $l.Add([byte](($p -shr ($bits - 8)) -band 255)); $bits -= 8 } }
    return , ([byte[]]($l.ToArray()[0..31]))
}
function MacDaten([string]$sammlung, [byte[]]$iv, [byte[]]$ct) { $k = $utf8.GetBytes("zb4|$sammlung|"); return , ([byte[]]($k + $iv + $ct)) }
function Sid([byte[]]$haupt) { $h = Ableiten $haupt 'zeitblick-id'; return (($h[0..3] | ForEach-Object { $_.ToString('x2') }) -join '') }
function Verschluesseln([byte[]]$haupt, [string]$sammlung, [string]$klar) {
    $aes = [System.Security.Cryptography.Aes]::Create(); $aes.Key = Ableiten $haupt 'zeitblick-aes'; $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'; $aes.GenerateIV()
    $kb = $utf8.GetBytes($klar); $ct = $aes.CreateEncryptor().TransformFinalBlock($kb, 0, $kb.Length)
    $mac = Hmac (Ableiten $haupt 'zeitblick-mac') (MacDaten $sammlung $aes.IV $ct)
    return (@{ zb = 4; alg = 'A256CBC-HS256'; sid = (Sid $haupt); iv = [Convert]::ToBase64String($aes.IV); ct = [Convert]::ToBase64String($ct); mac = [Convert]::ToBase64String($mac) } | ConvertTo-Json -Compress)
}
function Entschluesseln([byte[]]$haupt, [string]$sammlung, [string]$umschlag) {
    $u = $umschlag | ConvertFrom-Json
    if ($u.sid -ne (Sid $haupt)) { throw 'sid passt nicht' }
    $iv = [Convert]::FromBase64String($u.iv); $ct = [Convert]::FromBase64String($u.ct)
    $soll = [Convert]::ToBase64String((Hmac (Ableiten $haupt 'zeitblick-mac') (MacDaten $sammlung $iv $ct)))
    if ($soll -ne $u.mac) { throw 'MAC falsch' }
    $aes = [System.Security.Cryptography.Aes]::Create(); $aes.Key = Ableiten $haupt 'zeitblick-aes'; $aes.IV = $iv; $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'
    return $utf8.GetString($aes.CreateDecryptor().TransformFinalBlock($ct, 0, $ct.Length))
}
function Testgist([string]$methode, [string]$pfad, $koerper = $null) {
    $h = @{ Authorization = 'Bearer test-token-zeitblick' }
    $r = [System.Net.HttpWebRequest]::Create("$url/testgist$pfad"); $r.Method = $methode; $r.Proxy = $null; $r.Headers['Authorization'] = $h.Authorization
    if ($null -ne $koerper) { $b = $utf8.GetBytes(($koerper | ConvertTo-Json -Depth 20 -Compress)); $r.ContentType = 'application/json'; $r.ContentLength = $b.Length; $s = $r.GetRequestStream(); $s.Write($b, 0, $b.Length); $s.Close() }
    $w = $r.GetResponse(); $sr = New-Object System.IO.StreamReader($w.GetResponseStream(), $utf8); $t = $sr.ReadToEnd(); $sr.Close(); $w.Close()
    return ($t | ConvertFrom-Json)
}
function Datei([string]$sammlung, [hashtable]$items) { return (@{ v = 4; c = $sammlung; items = $items } | ConvertTo-Json -Depth 20 -Compress) }

Write-Host "Zeitblick-Kern-Test gegen $url" -ForegroundColor Cyan

# ---------- Schutz ----------
$p = Anfrage GET '/api/ping' -OhneSchluessel
Pruefe 'ping ohne Schlüssel' ($p.Status -eq 200 -and $p.Json.programm -eq 'zeitblick' -and $p.Json.test -eq $true)
Pruefe 'sync ohne Schlüssel = 401' ((Anfrage GET '/api/sync' -OhneSchluessel).Status -eq 401)
Pruefe 'fremder Host = 403' ((Anfrage GET '/api/sync' -HostKopf 'boese.example:80').Status -eq 403)
Pruefe 'Quelltext nicht ausgeliefert' ((Anfrage GET '/kern/Kern.cs').Status -eq 404 -and (Anfrage GET '/STATUS.md').Status -eq 404 -and (Anfrage GET '/werkzeuge/api-test.ps1').Status -eq 404)
$idx = Anfrage GET '/index.html'
Pruefe 'App unter 127.0.0.1 mit Kern-Schlüssel' ($idx.Status -eq 200 -and $idx.Text.Contains('window.ZB_KERN') -and $idx.Text.Contains($schluessel))
$idxL = Anfrage GET '/index.html' -HostKopf "localhost:$Port"
Pruefe 'App unter localhost ohne Schlüssel (Handy-Form)' ($idxL.Status -eq 200 -and -not $idxL.Text.Contains('ZB_KERN') -and -not $idxL.Text.Contains($schluessel))
Pruefe 'fenster.html wird ausgeliefert' ((Anfrage GET '/fenster.html').Text.Contains('data-fenster'))

# ---------- Datenablage ----------
$s0 = Anfrage GET '/api/sync'
$rev0 = [int]$s0.Json.rev
$jetzt = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$t1 = Datei 'tasks' @{ 'tk_api1' = @{ id = 'tk_api1'; title = 'API-Test Vorgang'; status = 'neu'; due = (Get-Date).ToString('yyyy-MM-dd'); updatedAt = $jetzt; dev = 'api' } }
$w1 = Anfrage PUT '/api/sync' @{ basis = $rev0; dateien = @{ 'zb-tasks.json' = $t1 } }
Pruefe 'schreiben mit passender Revision' ($w1.Status -eq 200 -and $w1.Json.rev -eq ($rev0 + 1))
Pruefe 'veraltete Revision = 409 (Konflikt)' ((Anfrage PUT '/api/sync' @{ basis = $rev0; dateien = @{ 'zb-tasks.json' = $t1 } }).Status -eq 409)
$s1 = Anfrage GET '/api/sync'
Pruefe 'ETag und 304' ((Anfrage GET '/api/sync' $null @{ 'If-None-Match' = $s1.Etag }).Status -eq 304)
Pruefe 'ungültiger Dateiname = 400' ((Anfrage PUT '/api/sync' @{ basis = $w1.Json.rev; dateien = @{ '../boese.json' = '{}' } }).Status -eq 400)
Pruefe 'kaputtes JSON = 400' ((Anfrage PUT '/api/sync' @{ basis = $w1.Json.rev; dateien = @{ 'zb-tasks.json' = '{"v":4,"items":{' } }).Status -eq 400)
Pruefe 'Kundenblick darf keine Kategorien schreiben' ((Anfrage PUT '/api/sync' @{ basis = $w1.Json.rev; dateien = @{ 'zb-cats.json' = (Datei 'cats' @{}) } } @{ 'X-Programm' = 'kundenblick' }).Status -eq 403)
$kb = Anfrage GET '/api/sync?namen=zb-tasks.json,zb-cats.json' $null @{ 'X-Programm' = 'kundenblick' }
Pruefe 'Kundenblick liest Vorgänge (Teilmenge)' ($kb.Status -eq 200 -and $kb.Json.dateien.'zb-tasks.json' -and -not $kb.Json.dateien.'zb-life.json')
$t1b = Datei 'tasks' @{ 'tk_api1' = @{ id = 'tk_api1'; title = 'API-Test Vorgang'; status = 'neu'; due = (Get-Date).ToString('yyyy-MM-dd'); updatedAt = $jetzt; dev = 'api' }; 'tk_kb1' = @{ id = 'tk_kb1'; title = 'Von Kundenblick'; status = 'neu'; kb = @{ typ = 'ticket' }; updatedAt = ($jetzt + 5); dev = 'kb' } }
$w2 = Anfrage PUT '/api/sync' @{ basis = $kb.Json.rev; dateien = @{ 'zb-tasks.json' = $t1b } } @{ 'X-Programm' = 'kundenblick' }
Pruefe 'Kundenblick schreibt Vorgänge' ($w2.Status -eq 200)
Pruefe 'Datei liegt im Datenordner' ((Get-Content (Join-Path $daten 'daten\zb-tasks.json') -Raw -Encoding UTF8).Contains('Von Kundenblick'))

# ---------- Zusammenführung (gleiche Regeln wie die App) ----------
$l = Datei 'tasks' @{ a = @{ id = 'a'; t = 'lokal'; updatedAt = 200 }; b = @{ id = 'b'; t = 'nur lokal'; updatedAt = 100 }; d = @{ id = 'd'; deleted = $true; updatedAt = 1 } }
$e = Datei 'tasks' @{ a = @{ id = 'a'; t = 'entfernt'; updatedAt = 300 }; c = @{ id = 'c'; t = 'nur entfernt'; updatedAt = 50 } }
$z = (Anfrage POST '/api/test/zusammenfuehren' @{ sammlung = 'tasks'; lokal = $l; entfernt = $e; jetzt = $jetzt }).Json
$zj = $z.ergebnis | ConvertFrom-Json
Pruefe 'neuere Änderung gewinnt' ($zj.items.a.t -eq 'entfernt')
Pruefe 'beide Seiten ergänzt' ($zj.items.b.t -eq 'nur lokal' -and $zj.items.c.t -eq 'nur entfernt')
Pruefe 'alter Löschmarker entfernt' ($null -eq $zj.items.d)
Pruefe 'Änderungsmeldungen' ($z.lokalGeaendert -eq $true -and $z.entferntGeaendert -eq $true)
$gleich = (Anfrage POST '/api/test/zusammenfuehren' @{ sammlung = 'tasks'; lokal = $l; entfernt = $l; jetzt = 50 }).Json
Pruefe 'gleiche Stände = keine Änderung' ($gleich.lokalGeaendert -eq $false -and $gleich.entferntGeaendert -eq $false)
$sonder = '{"v":4,"c":"tasks","items":{"x":{"id":"x","title":"Umlaute äöü \"Zitat\" \\\\ Zeilen\\nende 1.50","n":1.5,"updatedAt":7}}}'
$sz = (Anfrage POST '/api/test/zusammenfuehren' @{ sammlung = 'tasks'; lokal = $sonder; entfernt = '{"v":4,"c":"tasks","items":{}}'; jetzt = 50 }).Json
Pruefe 'Datensatz unverändert durchgereicht' ($sz.ergebnis.Contains('"title":"Umlaute äöü \"Zitat\" \\\\ Zeilen\\nende 1.50","n":1.5'))

# ---------- Verschlüsselter Abgleich mit der Gist-Attrappe ----------
$v = Anfrage POST '/api/sync/verbinden' @{ token = 'test-token-zeitblick'; gist = ''; schluessel = '' }
Pruefe 'verbinden legt neuen Speicher an' ($v.Status -eq 200 -and $v.Json.neu -eq $true -and $v.Json.verbunden -eq $true)
$wh = $v.Json.wiederherstellung
Pruefe 'Wiederherstellungs-Schlüssel 13 Vierergruppen' ($wh -match '^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$')
$haupt = AusBase32 $wh
$gid = $v.Json.gistId
$g = Testgist GET "/gists/$gid"
$namen = @($g.files.PSObject.Properties.Name)
Pruefe 'Gist hat zb4-meta und zb4-tasks' ($namen -contains 'zb4-meta.json' -and $namen -contains 'zb4-tasks.json' -and -not ($namen -contains 'zb-tasks.json'))
$roh = $g.files.'zb4-tasks.json'.content
Pruefe 'kein Klartext im Gist' (-not $roh.Contains('API-Test') -and -not $roh.Contains('Kundenblick') -and $roh.Contains('"ct"'))
Pruefe 'Meta mit Schlüssel-Kennung, ohne Geheimnis' ((($g.files.'zb4-meta.json'.content) | ConvertFrom-Json).sid -eq (Sid $haupt))
$klar = Entschluesseln $haupt 'tasks' $roh
Pruefe 'Gegenprobe: PowerShell entschlüsselt, was der Kern verschlüsselt' ($klar.Contains('API-Test Vorgang') -and $klar.Contains('Von Kundenblick'))
$falsch = $false; try { Entschluesseln $haupt 'cats' $roh | Out-Null } catch { $falsch = $true }
Pruefe 'Umschlag an Sammlung gebunden (MAC)' $falsch

# Handy schreibt (simuliert): neuer Vorgang und neuere Fassung von tk_api1
$handy = Datei 'tasks' @{ 'tk_api1' = @{ id = 'tk_api1'; title = 'API-Test Vorgang (Handy)'; status = 'aktiv'; updatedAt = ($jetzt + 1000); dev = 'handy' }; 'tk_handy' = @{ id = 'tk_handy'; title = 'Vom Handy'; status = 'neu'; updatedAt = ($jetzt + 1000); dev = 'handy' } }
Testgist PATCH "/gists/$gid" @{ files = @{ 'zb4-tasks.json' = @{ content = (Verschluesseln $haupt 'tasks' $handy) } } } | Out-Null
$j = Anfrage POST '/api/sync/jetzt'
Pruefe 'Abgleich ohne Fehler' ($j.Json.status -eq 'bereit' -and -not $j.Json.fehler)
$t = ((Anfrage GET '/api/sync').Json.dateien.'zb-tasks.json') | ConvertFrom-Json
Pruefe 'Kern übernimmt neuere Fassung vom Handy' ($t.items.tk_api1.title -eq 'API-Test Vorgang (Handy)' -and $t.items.tk_handy.title -eq 'Vom Handy')
Pruefe 'Kern behält, was nur am Laptop war (Kundenblick)' ($t.items.tk_kb1.title -eq 'Von Kundenblick')
$g2 = Testgist GET "/gists/$gid"
$klar2 = Entschluesseln $haupt 'tasks' $g2.files.'zb4-tasks.json'.content
Pruefe 'Gist bekommt den zusammengeführten Stand zurück' ($klar2.Contains('Von Kundenblick') -and $klar2.Contains('Vom Handy'))

# Trennen und wieder verbinden: ohne Schlüssel geht es nicht, mit Schlüssel schon
Anfrage POST '/api/sync/trennen' | Out-Null
$v2 = Anfrage POST '/api/sync/verbinden' @{ token = 'test-token-zeitblick'; gist = ''; schluessel = '' }
Pruefe 'vorhandener Speicher braucht den Schlüssel' ($v2.Status -eq 409 -and $v2.Json.code -eq 'schluessel-noetig')
$v3 = Anfrage POST '/api/sync/verbinden' @{ token = 'test-token-zeitblick'; gist = ''; schluessel = 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA' }
Pruefe 'falscher Schlüssel abgelehnt' ($v3.Status -eq 400)
$v4 = Anfrage POST '/api/sync/verbinden' @{ token = 'test-token-zeitblick'; gist = ''; schluessel = $wh.ToLower() }
Pruefe 'mit Wiederherstellungs-Schlüssel verbunden' ($v4.Status -eq 200 -and $v4.Json.neu -eq $false -and $v4.Json.gistId -eq $gid)
$kp = (Anfrage GET '/api/sync/kopplung').Json.payload
$kpj = $utf8.GetString([Convert]::FromBase64String(($kp.Replace('-', '+').Replace('_', '/')) + ('=' * ((4 - $kp.Length % 4) % 4)))) | ConvertFrom-Json
Pruefe 'Kopplung enthält v4, Token, Gist, Schlüssel' ($kpj.v -eq 4 -and $kpj.t -eq 'test-token-zeitblick' -and $kpj.g -eq $gid -and $kpj.k -eq $wh)
$zug = Get-Content (Join-Path $daten 'zugang.json') -Raw
Pruefe 'Zugang nur DPAPI-geschützt auf der Platte' (-not $zug.Contains('test-token-zeitblick') -and -not $zug.Contains($wh))
$tmpEnt = Join-Path $env:TEMP 'zb-test-entschl.json'; $tmpQ = Join-Path $env:TEMP 'zb4-tasks.json'
[IO.File]::WriteAllText($tmpQ, $g2.files.'zb4-tasks.json'.content, $utf8)
$exe = Join-Path (Split-Path $PSScriptRoot -Parent) 'Zeitblick.exe'
$pr = Start-Process -FilePath $exe -ArgumentList @('--entschluesseln', $tmpQ, $tmpEnt, $wh) -Wait -PassThru
Pruefe 'Werkzeug --entschluesseln (Rückweg ohne Kern)' ($pr.ExitCode -eq 0 -and (Get-Content $tmpEnt -Raw -Encoding UTF8).Contains('Vom Handy'))
Remove-Item $tmpEnt, $tmpQ -ErrorAction SilentlyContinue

# ---------- Entwürfe ----------
$ent = @{ id = 'e-apitest01'; titel = 'Entwurf aus dem Test'; text = 'Zeile'; extra = '{"prio":2}'; zustand = 'offen'; erstellt = $jetzt; geaendert = $jetzt }
Pruefe 'Entwurf setzen' ((Anfrage PUT '/api/entwuerfe' @{ entwurf = $ent; quelle = 'f-test' }).Status -eq 200)
$el = (Anfrage GET '/api/entwuerfe?seit=0').Json
Pruefe 'Entwurf in der Liste' (@($el.entwuerfe | Where-Object { $_.id -eq 'e-apitest01' -and $_.titel -eq 'Entwurf aus dem Test' }).Count -eq 1)
$ent.ziel = 'tk_api1'
Pruefe 'Entwurf wird Vorgang' ((Anfrage POST '/api/entwuerfe/gespeichert' @{ entwurf = $ent; quelle = 'f-test' }).Json.entwurf.zustand -eq 'gespeichert')
Pruefe 'gespeicherter Entwurf ist fest' ((Anfrage POST '/api/entwuerfe/zustand' @{ id = 'e-apitest01'; zustand = 'offen' }).Status -eq 409)

# ---------- Statusdatei und Spiegel (nur Testordner) ----------
$st = Anfrage PUT '/api/status' @{ text = 'Heute: 2 von 5 erledigt'; ampel = 'gelb'; details = @{ heuteErledigt = 2; heuteGesamt = 5; titel = 'Geheimer Titel'; liste = @(1, 2) } }
$sp = Join-Path $vault '_system-daten\zeitblick-status.json'
Pruefe 'Statusdatei im Test-Vault' ($st.Json.geschrieben -eq $true -and (Test-Path $sp))
$sj = Get-Content $sp -Raw -Encoding UTF8 | ConvertFrom-Json
Pruefe 'Statusdatei nur Zahlen' ($sj.details.heuteErledigt -eq 2 -and $null -eq $sj.details.titel -and $null -eq $sj.details.liste -and $sj.text -eq 'Heute: 2 von 5 erledigt')
Pruefe 'echte Statusdatei unberührt' (-not (Test-Path 'C:\Obsidian\System\_system-daten\zeitblick-status.json') -or ((Get-Item 'C:\Obsidian\System\_system-daten\zeitblick-status.json').LastWriteTime -lt (Get-Date).AddMinutes(-60)))
Pruefe 'Spiegel: Ausbruch verhindert' ((Anfrage PUT '/api/spiegel' @{ dateien = @(@{ pfad = '../ausbruch.md'; inhalt = 'x' }) }).Status -eq 400)
Pruefe 'Spiegel: nur Markdown' ((Anfrage PUT '/api/spiegel' @{ dateien = @(@{ pfad = 'Daten/x.json'; inhalt = 'x' }) }).Status -eq 400)
$fremd = Join-Path $vault 'Zeitblick\Vorgänge\Fremde Notiz.md'
New-Item -ItemType Directory -Force (Split-Path $fremd) | Out-Null
[IO.File]::WriteAllText($fremd, "---`ntitel: fremd`n---`nNicht von Zeitblick", $utf8)
$sw = Anfrage PUT '/api/spiegel' @{ dateien = @(@{ pfad = 'Vorgänge/Test.md'; inhalt = "---`ntags: [zeitblick, vorgang]`n---`n# Test" }); loeschen = @('Vorgänge/Fremde Notiz.md') }
Pruefe 'Spiegel schreibt in Zeitblick-Ordner' ($sw.Json.geschrieben -eq 1 -and (Test-Path (Join-Path $vault 'Zeitblick\Vorgänge\Test.md')))
Pruefe 'Spiegel löscht keine fremden Notizen' ((Test-Path $fremd) -and $sw.Json.entfernt -eq 0)
$sw2 = Anfrage PUT '/api/spiegel' @{ dateien = @(); loeschen = @('Vorgänge/Test.md') }
Pruefe 'Spiegel entfernt eigene Datei' ($sw2.Json.entfernt -eq 1)

# ---------- Sicherung und Umzug ----------
$sich = (Anfrage POST '/api/sicherung' @{ grund = 'apitest' }).Json.name
$zip = Join-Path $daten "sicherungen\$sich"
Pruefe 'Sicherung angelegt' (Test-Path $zip)
$eintraege = [IO.Compression.ZipFile]::OpenRead($zip); $n = @($eintraege.Entries | ForEach-Object { $_.FullName }); $eintraege.Dispose()
Pruefe 'Sicherung ohne Zugang (Token, Schlüssel)' ($n -contains 'daten/zb-tasks.json' -and -not ($n -match 'zugang'))
$um = Anfrage POST '/api/umzug' @{ text = '{"app":"Zeitblick","data":{"tasks":{}}}'; herkunft = 'http://localhost' }
Pruefe 'Umzug legt Daten ab und sichert vorher' ($um.Json.ok -and (Test-Path (Join-Path $daten "umzug\$($um.Json.datei)")) -and $um.Json.sicherung -like '*vor-umzug*')

# ---------- Einstellungen ----------
$ei = (Anfrage GET '/api/einstellungen').Json
Pruefe 'Einstellungen: Testinstanz ohne Autostart' ($ei.zustand.test -eq $true -and $ei.zustand.autostartAktiv -eq $false)
$ei2 = (Anfrage PUT '/api/einstellungen' @{ vault = 'C:\Windows' }).Json
Pruefe 'Testinstanz lässt den Vault nicht umstellen' ($ei2.vault -ne 'C:\Windows')
$info = (Anfrage GET '/api/info').Json
Pruefe 'Info zeigt Testordner' ($info.daten -like "*Zeitblick-Test*" -and $info.statusdatei -like "*Zeitblick-Test*" -and $info.appId -eq 'Froese.Zeitblick.Test')

Write-Host ''
if ($script:fehler.Count) { Write-Host "$($script:ok) ok, $($script:fehler.Count) Fehler" -ForegroundColor Red; exit 1 }
Write-Host "Alle $($script:ok) Prüfungen grün." -ForegroundColor Green
