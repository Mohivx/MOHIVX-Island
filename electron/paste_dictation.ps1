param([long]$TargetWindow = 0, [switch]$Capture)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DictationTarget {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
}
'@
if ($Capture) { [Console]::Write([DictationTarget]::GetForegroundWindow().ToInt64()); exit }
if ($TargetWindow -le 0 -or -not [DictationTarget]::IsWindow([IntPtr]$TargetWindow)) { throw 'No target window. Text is available on the clipboard.' }
[void][DictationTarget]::SetForegroundWindow([IntPtr]$TargetWindow)
Start-Sleep -Milliseconds 150
if ([DictationTarget]::GetForegroundWindow().ToInt64() -ne $TargetWindow) { throw 'Could not focus the target window. Text is available on the clipboard.' }
[System.Windows.Forms.SendKeys]::SendWait('^v')
[Console]::Write('inserted')
