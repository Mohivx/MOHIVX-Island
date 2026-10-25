using System;
using System.Globalization;
using System.Runtime.InteropServices;

internal static class WindowStyleHost
{
    private const int GWL_EXSTYLE = -20;
    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const long WS_EX_APPWINDOW = 0x00040000L;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_FRAMECHANGED = 0x0020;

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);

    private static int Main(string[] args)
    {
        if (args.Length != 1) return 2;
        long raw;
        if (!long.TryParse(args[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out raw) || raw == 0) return 2;
        IntPtr window = new IntPtr(raw);
        long current = GetWindowLongPtr(window, GWL_EXSTYLE).ToInt64();
        long updated = (current | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
        if (SetWindowLongPtr(window, GWL_EXSTYLE, new IntPtr(updated)) == IntPtr.Zero && Marshal.GetLastWin32Error() != 0) return 3;
        return SetWindowPos(window, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED) ? 0 : 4;
    }
}
