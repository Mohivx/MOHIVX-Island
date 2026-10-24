Add-Type -TypeDefinition @'
using System;using System.Text;using System.Runtime.InteropServices;
public class ActiveAppContext {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder text,int count);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
}
'@
$hwnd=[ActiveAppContext]::GetForegroundWindow();[uint32]$activePid=0
[void][ActiveAppContext]::GetWindowThreadProcessId($hwnd,[ref]$activePid)
$title=New-Object System.Text.StringBuilder 512
[void][ActiveAppContext]::GetWindowText($hwnd,$title,512)
$name=(Get-Process -Id $activePid -ErrorAction SilentlyContinue).ProcessName
@{application=$name;title=$title.ToString()} | ConvertTo-Json -Compress
