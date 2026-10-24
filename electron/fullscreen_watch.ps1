param([int]$OwnerPid)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class FullscreenProbe {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
}
'@
$previous = $null
while ($true) {
  if (!(Get-Process -Id $OwnerPid -ErrorAction SilentlyContinue)) { break }
  $hwnd=[FullscreenProbe]::GetForegroundWindow(); [uint32]$foregroundPid=0
  [void][FullscreenProbe]::GetWindowThreadProcessId($hwnd,[ref]$foregroundPid)
  $rect=New-Object FullscreenProbe+Rect
  $bounds=[System.Windows.Forms.Screen]::FromHandle($hwnd).Bounds
  $full=$false
  if ($foregroundPid -ne $OwnerPid -and [FullscreenProbe]::GetWindowRect($hwnd,[ref]$rect)) {
    $full=($rect.Left -le $bounds.Left -and $rect.Top -le $bounds.Top -and $rect.Right -ge $bounds.Right -and $rect.Bottom -ge $bounds.Bottom)
    $procName=(Get-Process -Id $foregroundPid -ErrorAction SilentlyContinue).ProcessName
    if ($procName -in @('explorer','ShellExperienceHost','StartMenuExperienceHost')) { $full=$false }
  }
  if ($full -ne $previous) { @{fullscreen=$full} | ConvertTo-Json -Compress; $previous=$full }
  Start-Sleep -Milliseconds 1500
}
