Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "..\build\icon.ico"
if (-not (Test-Path $sourcePath)) {
    throw "Windows app icon not found at $sourcePath"
}

$sourceImg = [System.Drawing.Bitmap]::new($sourcePath)

# Densities for launcher icons
$densities = @{
    "mipmap-mdpi"    = 48
    "mipmap-hdpi"    = 72
    "mipmap-xhdpi"   = 96
    "mipmap-xxhdpi"  = 144
    "mipmap-xxxhdpi" = 192
}

# Densities for adaptive icon foreground (108dp)
$foregroundDensities = @{
    "drawable-mdpi"    = 108
    "drawable-hdpi"    = 162
    "drawable-xhdpi"   = 216
    "drawable-xxhdpi"  = 324
    "drawable-xxxhdpi" = 432
}

$resDir = Join-Path $PSScriptRoot "..\android\app\src\main\res"

function Create-Foreground-Icon([int]$canvasSize, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # The Windows ICO already places the mark inside Android's adaptive safe zone.
    # Use the entire ICO so Android keeps the exact same background and proportions.
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $canvasSize, $canvasSize)
    $g.DrawImage($sourceImg, $destRect)
    $g.Dispose()

    $parentDir = Split-Path -Parent $outPath
    if (-not (Test-Path $parentDir)) { New-Item -ItemType Directory -Path $parentDir -Force | Out-Null }
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Generated foreground: $outPath ($canvasSize x $canvasSize)"
}

function Create-Composited-Icon([int]$size, [string]$outPath, [bool]$isRound = $false) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)

    # Android masks launcher icons differently by device. Clip the exact Windows
    # icon to the legacy square/round silhouette without changing its artwork.
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($isRound) {
        $path.AddEllipse(1, 1, $size - 2, $size - 2)
    } else {
        # Squircle / rounded rect for legacy square
        $radius = [int]($size * 0.22)
        $d = $radius * 2
        $path.AddArc(1, 1, $d, $d, 180, 90)
        $path.AddArc($size - 1 - $d, 1, $d, $d, 270, 90)
        $path.AddArc($size - 1 - $d, $size - 1 - $d, $d, $d, 0, 90)
        $path.AddArc(1, $size - 1 - $d, $d, $d, 90, 90)
        $path.CloseFigure()
    }

    $g.SetClip($path)
    $path.Dispose()

    # Keep the Windows ICO background and mark at the same relative size.
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $g.DrawImage($sourceImg, $destRect)

    $g.Dispose()

    $parentDir = Split-Path -Parent $outPath
    if (-not (Test-Path $parentDir)) { New-Item -ItemType Directory -Path $parentDir -Force | Out-Null }
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Generated icon: $outPath ($size x $size)"
}

# 1. Generate foreground images for adaptive icons
foreach ($kv in $foregroundDensities.GetEnumerator()) {
    $out = Join-Path $resDir (Join-Path $kv.Key "ic_launcher_foreground.png")
    Create-Foreground-Icon $kv.Value $out
}
# Default drawable fallback
$defaultFg = Join-Path $resDir "drawable\ic_launcher_foreground.png"
Create-Foreground-Icon 432 $defaultFg

# 2. Generate legacy square and round icons
foreach ($kv in $densities.GetEnumerator()) {
    $sq = Join-Path $resDir (Join-Path $kv.Key "ic_launcher.png")
    $rd = Join-Path $resDir (Join-Path $kv.Key "ic_launcher_round.png")
    Create-Composited-Icon $kv.Value $sq $false
    Create-Composited-Icon $kv.Value $rd $true
}

$sourceImg.Dispose()
Write-Output "All Android icons generated successfully."
