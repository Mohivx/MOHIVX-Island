$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Windows.Forms;
public class CompanionKeys {
  delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
  static Hook callback = Receive;
  static IntPtr hook;
  static bool control, windows, dictation;
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Hook callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr handle);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr handle, int code, IntPtr message, IntPtr data);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  static void Emit(string type) { Console.WriteLine("{\"type\":\""+type+"\",\"target\":"+GetForegroundWindow().ToInt64()+"}"); Console.Out.Flush(); }
  static IntPtr Receive(int code, IntPtr message, IntPtr data) {
    if (code >= 0) {
      int key = Marshal.ReadInt32(data), kind = message.ToInt32();
      bool down = kind == 0x100 || kind == 0x104;
      bool up = kind == 0x101 || kind == 0x105;
      if (down || up) {
        if (key == 0xA2 || key == 0xA3) control = down;
        if (key == 0x5B || key == 0x5C) windows = down;
        if (control && windows && !dictation) { dictation = true; Emit("dictation-start"); }
        if (dictation && !(control && windows)) { dictation = false; Emit("dictation-stop"); }
        if ((key == 0x5B || key == 0x5C) && (control || dictation)) return new IntPtr(1);
      }
    }
    return CallNextHookEx(hook, code, message, data);
  }
  public static void Run() {
    hook = SetWindowsHookEx(13, callback, GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName), 0);
    if (hook == IntPtr.Zero) throw new Exception("Could not register companion hold shortcuts.");
    try { Application.Run(); } finally { UnhookWindowsHookEx(hook); }
  }
}
'@ -ReferencedAssemblies System.Windows.Forms
[CompanionKeys]::Run()
