param(
    [string]$ImagePath,
    [switch]$Get
)

$code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace WinWallpaperManager {
    [ComImport, Guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD")]
    public class DesktopWallpaperClass { }

    [Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IDesktopWallpaper {
        void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
        [return: MarshalAs(UnmanagedType.LPWStr)]
        string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
    }

    public class WallpaperController {
        private const int SPI_SETDESKWALLPAPER = 0x0014;
        private const int SPI_GETDESKWALLPAPER = 0x0073;
        private const int SPIF_UPDATEINIFILE   = 0x01;
        private const int SPIF_SENDCHANGE      = 0x02;
        private const int MAX_PATH             = 32767;

        [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern int SystemParametersInfoSet(int uAction, int uParam, string lpvParam, int fuWinIni);

        [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern int SystemParametersInfoGet(int uAction, int uParam, StringBuilder lpvParam, int fuWinIni);

        // Read current wallpaper via COM IDesktopWallpaper (most reliable)
        public static string GetCurrentViaCom() {
            try {
                var wp = (IDesktopWallpaper)new DesktopWallpaperClass();
                string result = wp.GetWallpaper(null);
                return (result != null && result.Length > 0) ? result : null;
            } catch { return null; }
        }

        // Read current wallpaper via SPI_GETDESKWALLPAPER (fallback)
        public static string GetCurrentViaSpi() {
            try {
                var sb = new StringBuilder(MAX_PATH);
                int r = SystemParametersInfoGet(SPI_GETDESKWALLPAPER, MAX_PATH, sb, 0);
                if (r != 0 && sb.Length > 0) return sb.ToString();
                return null;
            } catch { return null; }
        }

        // Set wallpaper via COM IDesktopWallpaper
        public static bool SetViaCom(string path) {
            try {
                var wp = (IDesktopWallpaper)new DesktopWallpaperClass();
                wp.SetWallpaper(null, path);
                return true;
            } catch { return false; }
        }

        // Set wallpaper via SPI_SETDESKWALLPAPER
        public static bool SetViaSpi(string path) {
            try {
                return SystemParametersInfoSet(SPI_SETDESKWALLPAPER, 0, path, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE) != 0;
            } catch { return false; }
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $code -Language CSharp -ErrorAction SilentlyContinue
} catch {}

# Get current wallpaper via OS APIs only — never registry as proof
function Get-ActiveWallpaperPath {
    $curr = $null
    try { $curr = [WinWallpaperManager.WallpaperController]::GetCurrentViaCom() } catch {}
    if (-not $curr) {
        try { $curr = [WinWallpaperManager.WallpaperController]::GetCurrentViaSpi() } catch {}
    }
    # NOTE: Registry value intentionally NOT used as proof of desktop state
    return $curr
}

function Normalize-WpPath($p) {
    if (-not $p) { return "" }
    return $p.Trim().Trim('"').Replace('/', '\').ToLowerInvariant()
}

# -- GET mode: report current wallpaper from OS, not registry --
if ($Get) {
    $curr = Get-ActiveWallpaperPath
    [PSCustomObject]@{
        success          = $true
        currentWallpaper = $curr
    } | ConvertTo-Json -Compress
    exit 0
}

# -- SET mode --
if (-not $ImagePath) {
    [PSCustomObject]@{ success = $false; error = "No image path provided" } | ConvertTo-Json -Compress
    exit 1
}

# Validate: must be a regular file, not a directory, path with special chars handled via -LiteralPath
if (-not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
    $msg = if (Test-Path -LiteralPath $ImagePath -PathType Container) { "Path is a directory, not a file: $ImagePath" } else { "File not found: $ImagePath" }
    [PSCustomObject]@{ success = $false; error = $msg } | ConvertTo-Json -Compress
    exit 1
}

$resolved = $null
try {
    $resolved = (Resolve-Path -LiteralPath $ImagePath).Path
} catch {
    [PSCustomObject]@{ success = $false; error = "Could not resolve path: $ImagePath" } | ConvertTo-Json -Compress
    exit 1
}

# Preserve original state for accurate rollback via OS setter
$origStyle = (Get-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name WallpaperStyle -ErrorAction SilentlyContinue).WallpaperStyle
$origTile  = (Get-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name TileWallpaper  -ErrorAction SilentlyContinue).TileWallpaper
$origWp    = Get-ActiveWallpaperPath

# Attempt to set wallpaper: COM first, then SPI
$setOk = $false
try { $setOk = [WinWallpaperManager.WallpaperController]::SetViaCom($resolved) } catch {}
if (-not $setOk) {
    try { $setOk = [WinWallpaperManager.WallpaperController]::SetViaSpi($resolved) } catch {}
}

# If the OS setter itself is completely unavailable, fail immediately — no registry-only path
if (-not $setOk) {
    [PSCustomObject]@{
        success = $false
        error   = "Windows desktop setter unavailable; COM and SPI both failed. Wallpaper was not changed."
    } | ConvertTo-Json -Compress
    exit 1
}

# Read back via OS API only to verify
$verifiedWp = Get-ActiveWallpaperPath

$isVerified = $false
if ($verifiedWp) {
    $normVerified = Normalize-WpPath $verifiedWp
    $normTarget   = Normalize-WpPath $resolved
    # EXACT full-path match only — basename match intentionally excluded
    $isVerified = ($normVerified -eq $normTarget)
}

if ($isVerified) {
    # Apply style/tile preferences ONLY after real verification
    try {
        Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name WallpaperStyle -Value "10" -ErrorAction SilentlyContinue
        Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name TileWallpaper  -Value "0"  -ErrorAction SilentlyContinue
    } catch {}

    [PSCustomObject]@{
        success = $true
        path    = $resolved
    } | ConvertTo-Json -Compress
    exit 0
}

# Verification failed: rollback through the actual OS setter (not just registry)
$rollbackOk = $false
if ($origWp) {
    try { $rollbackOk = [WinWallpaperManager.WallpaperController]::SetViaCom($origWp) } catch {}
    if (-not $rollbackOk) {
        try { $rollbackOk = [WinWallpaperManager.WallpaperController]::SetViaSpi($origWp) } catch {}
    }
    if ($rollbackOk) {
        $rollbackOk = ((Normalize-WpPath (Get-ActiveWallpaperPath)) -eq (Normalize-WpPath $origWp))
    }
    # Restore style/tile to original values after rollback
    if ($rollbackOk) {
        try {
            if ($null -ne $origStyle) { Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name WallpaperStyle -Value $origStyle -ErrorAction SilentlyContinue }
            if ($null -ne $origTile)  { Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name TileWallpaper  -Value $origTile  -ErrorAction SilentlyContinue }
        } catch {}
    }
}

$rollbackMsg = if ($origWp) { if ($rollbackOk) { "Previous wallpaper restored." } else { "Rollback also failed; desktop may show incorrect wallpaper." } } else { "No previous state to restore." }

[PSCustomObject]@{
    success = $false
    error   = "Wallpaper set was not confirmed by the OS (readback did not match target). $rollbackMsg"
} | ConvertTo-Json -Compress
exit 1
