using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;

namespace MohivxPhone {
 // Read-only status or single-endpoint VB-CABLE capture alias branding probe.
 // Does not install drivers, schedule tasks, invoke UAC, or touch audio routing/defaults.
 static class MicBrandProbe {
  static bool IsAdministrator() {
   try {
    using (WindowsIdentity identity = WindowsIdentity.GetCurrent()) {
     return identity != null && new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }
   } catch {
    return false;
   }
  }

  static string BoundError(string message) {
   if (string.IsNullOrWhiteSpace(message)) return "Microphone diagnostic probe failed.";
   StringBuilder sb = new StringBuilder(message.Length);
   bool lastSpace = false;
   for (int i = 0; i < message.Length; i++) {
    char c = message[i];
    if (char.IsControl(c) || char.IsWhiteSpace(c)) {
     if (!lastSpace && sb.Length > 0) {
      sb.Append(' ');
      lastSpace = true;
     }
    } else {
     sb.Append(c);
     lastSpace = false;
    }
   }
   string clean = sb.ToString().Trim();
   if (clean.Length == 0) return "Microphone diagnostic probe failed.";
   return clean.Length > 240 ? clean.Substring(0, 240) : clean;
  }

  static string FormatHResult(Exception ex) {
   int hr = ex != null ? Marshal.GetHRForException(ex) : -1;
   return string.Format("0x{0:X8}", hr);
  }

  static void MergeStatusFields(Dictionary<string, object> target, JavaScriptSerializer serializer, object status) {
   if (target == null || serializer == null || status == null) return;
   Dictionary<string, object> map = serializer.DeserializeObject(serializer.Serialize(status)) as Dictionary<string, object>;
   if (map == null) return;
   foreach (KeyValuePair<string, object> pair in map) {
    if (!target.ContainsKey(pair.Key)) target[pair.Key] = pair.Value;
   }
  }

  [STAThread]
  public static int Main(string[] args) {
   try { Console.OutputEncoding = new UTF8Encoding(false); } catch { }
   JavaScriptSerializer serializer = new JavaScriptSerializer();
   bool admin = IsAdministrator();
   object before = null;
   object after = null;
   bool brandSucceeded = false;

   try {
    if (args == null || args.Length != 1 || (args[0] != "--status" && args[0] != "--brand")) {
     throw new ArgumentException("Expected exactly --status or --brand.");
    }

    if (args[0] == "--status") {
     object status = MicEndpoints.Status();
     Dictionary<string, object> payload = new Dictionary<string, object>();
     payload["success"] = true;
     payload["administrator"] = admin;
     payload["status"] = status;
     MergeStatusFields(payload, serializer, status);
     Console.WriteLine(serializer.Serialize(payload));
     return 0;
    }

    before = MicEndpoints.Status();
    if (!admin) {
     throw new UnauthorizedAccessException("Administrator privileges are required for --brand.");
    }

    brandSucceeded = MicEndpoints.Brand();
    after = MicEndpoints.Status();
    bool success = brandSucceeded;

    Dictionary<string, object> result = new Dictionary<string, object>();
    result["success"] = success;
    result["administrator"] = admin;
    result["brandSucceeded"] = brandSucceeded;
    result["before"] = before;
    result["after"] = after;
    if (!success) {
     result["error"] = "Standard VB-CABLE capture endpoint was not found or is not active.";
     result["exceptionType"] = "";
     result["hresult"] = "0x00000000";
    }
    Console.WriteLine(serializer.Serialize(result));
    return success ? 0 : 1;
   } catch (Exception ex) {
    if (args != null && args.Length == 1 && args[0] == "--brand" && before != null && after == null) {
     try { after = MicEndpoints.Status(); } catch { }
    }
    Dictionary<string, object> failure = new Dictionary<string, object>();
    failure["success"] = false;
    failure["administrator"] = admin;
    failure["brandSucceeded"] = brandSucceeded;
    if (before != null) failure["before"] = before;
    if (after != null) failure["after"] = after;
    failure["error"] = BoundError(ex.Message);
    failure["exceptionType"] = ex.GetType().FullName ?? ex.GetType().Name;
    failure["hresult"] = FormatHResult(ex);
    try { Console.WriteLine(serializer.Serialize(failure)); } catch { }
    return 1;
   }
  }
 }
}
