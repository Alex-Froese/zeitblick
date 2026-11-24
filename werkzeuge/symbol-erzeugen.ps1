# Erzeugt kern\zeitblick.ico aus dem App-Symbol (icons\icon-512.png), damit Infobereich, Taskleiste und Fenster
# dasselbe Zeitblick-Symbol zeigen wie die App am Handy. Groessen 16, 20, 24, 32, 40, 48, 64 und 256 (PNG im ICO).
# Aufruf: powershell -ExecutionPolicy Bypass -File werkzeuge\symbol-erzeugen.ps1
Add-Type -AssemblyName System.Drawing
$wurzel = Split-Path $PSScriptRoot -Parent
$quelle = Join-Path $wurzel 'icons\icon-512.png'
$ziel = Join-Path $wurzel 'kern\zeitblick.ico'
$bild = [System.Drawing.Image]::FromFile($quelle)
$groessen = @(16, 20, 24, 32, 40, 48, 64, 256)
$pngs = @()
foreach ($s in $groessen) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($bild, 0, 0, $s, $s)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $pngs += , $ms.ToArray()
}
$bild.Dispose()
$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $out
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$groessen.Count)
$offset = 6 + 16 * $groessen.Count
for ($i = 0; $i -lt $groessen.Count; $i++) {
    $s = $groessen[$i]; $b = if ($s -ge 256) { 0 } else { $s }
    $w.Write([byte]$b); $w.Write([byte]$b); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([UInt16]1); $w.Write([UInt16]32)
    $w.Write([UInt32]$pngs[$i].Length); $w.Write([UInt32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Flush()
[System.IO.File]::WriteAllBytes($ziel, $out.ToArray())
Write-Host "Symbol geschrieben: $ziel"
