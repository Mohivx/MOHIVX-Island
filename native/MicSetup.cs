using System;using System.IO;using System.Text;using System.Linq;using System.Diagnostics;using System.Runtime.InteropServices;using System.Security.Principal;using System.Security.AccessControl;using System.Security.Cryptography;using System.ComponentModel;using System.Threading;using System.Web.Script.Serialization;
namespace MohivxPhone {
 static class MicSetup {
  const string Hardware="VBAudioVACWDM",TaskName="MOHIVX-Mic-Finalize";
  public static void LogStage(string stage,int hr,string message){MicDiagnostics.Write(stage,hr,message);}
  public static MicDiagnostic ReadLastStage(){return MicDiagnostics.Read();}
  [StructLayout(LayoutKind.Sequential)]struct DeviceInfo{public uint size;public Guid cls;public uint instance;public UIntPtr reserved;}
  [DllImport("setupapi.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool SetupDiGetINFClassW(string inf,out Guid cls,StringBuilder name,uint length,out uint required);
  [DllImport("setupapi.dll",SetLastError=true)]static extern IntPtr SetupDiCreateDeviceInfoList(ref Guid cls,IntPtr parent);
  [DllImport("setupapi.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool SetupDiCreateDeviceInfoW(IntPtr set,string name,ref Guid cls,string description,IntPtr parent,uint flags,ref DeviceInfo info);
  [DllImport("setupapi.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool SetupDiSetDeviceRegistryPropertyW(IntPtr set,ref DeviceInfo info,uint property,byte[] value,uint length);
  [DllImport("setupapi.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool SetupDiGetDeviceRegistryPropertyW(IntPtr set,ref DeviceInfo info,uint property,out uint type,byte[] value,uint length,out uint required);
  [DllImport("setupapi.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr SetupDiGetClassDevsW(ref Guid cls,string enumerator,IntPtr parent,uint flags);
  [DllImport("setupapi.dll",SetLastError=true)]static extern bool SetupDiEnumDeviceInfo(IntPtr set,uint index,ref DeviceInfo info);
  [DllImport("setupapi.dll",SetLastError=true)]static extern bool SetupDiCallClassInstaller(uint operation,IntPtr set,ref DeviceInfo info);
  [DllImport("setupapi.dll")]static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
  [DllImport("newdev.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool UpdateDriverForPlugAndPlayDevicesW(IntPtr parent,string hardware,string inf,uint flags,out bool reboot);
  static readonly IntPtr Invalid=new IntPtr(-1);
  static bool Admin(){return new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);}
  static void Check(bool value){if(!value)throw new Win32Exception(Marshal.GetLastWin32Error());}
  public static int ExitCode(Exception e){
   if(e==null)return 1;
   var w=e as Win32Exception;
   if(w!=null){
    if(w.NativeErrorCode==1223)return 1223;
    if(w.NativeErrorCode==3010)return 3010;
    if((w.NativeErrorCode&unchecked((int)0x80000000))!=0)return w.NativeErrorCode;
    if(w.NativeErrorCode>0)return unchecked((int)(0x80070000|(uint)(w.NativeErrorCode&0xFFFF)));
   }
   int hr=Marshal.GetHRForException(e);
   return hr!=0&&hr!=1&&hr!=3010&&hr!=1223?hr:1;
  }
  public static string Quote(string arg){if(arg.IndexOf('\0')>=0)throw new Exception("Invalid argument.");var text=new StringBuilder("\"");int slashes=0;foreach(char c in arg){if(c=='\\'){slashes++;continue;}if(c=='\"'){text.Append('\\',slashes*2+1);text.Append(c);}else{text.Append('\\',slashes);text.Append(c);}slashes=0;}text.Append('\\',slashes*2);return text.Append('"').ToString();}
  internal static void Verify(string directory){foreach(var pair in MicVendorLock.Files){string file=Path.Combine(directory,pair.Key);using(var sha=SHA256.Create())using(var stream=File.OpenRead(file)){string actual=BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();if(actual!=pair.Value)throw new Win32Exception(13,"The bundled audio component is damaged. Reinstall MOHIVX.");}}}
  internal static string ReplaceHelper(string source,string root){string helper=Path.Combine(root,"MOHIVMicSetup.exe");if(Directory.Exists(helper)||(File.Exists(helper)&&(File.GetAttributes(helper)&FileAttributes.ReparsePoint)!=0))throw new Win32Exception(5,"Microphone helper is redirected.");if(!source.Equals(helper,StringComparison.OrdinalIgnoreCase)){if(File.Exists(helper))File.Delete(helper);File.Copy(source,helper,false);}return helper;}
  static bool Existing(Guid cls){IntPtr set=SetupDiGetClassDevsW(ref cls,null,IntPtr.Zero,2);if(set==Invalid)throw new Win32Exception();try{for(uint i=0;;i++){var info=new DeviceInfo{size=(uint)Marshal.SizeOf(typeof(DeviceInfo))};if(!SetupDiEnumDeviceInfo(set,i,ref info)){if(Marshal.GetLastWin32Error()==259)break;throw new Win32Exception();}var bytes=new byte[4096];uint type,needed;if(SetupDiGetDeviceRegistryPropertyW(set,ref info,1,out type,bytes,(uint)bytes.Length,out needed)&&Encoding.Unicode.GetString(bytes,0,(int)Math.Min(needed,bytes.Length)).Split('\0').Any(value=>value.Equals(Hardware,StringComparison.OrdinalIgnoreCase)))return true;}return false;}finally{SetupDiDestroyDeviceInfoList(set);}}
  static bool InstallDriver(string directory){
   Verify(directory);
   string inf=Path.Combine(directory,"vbMmeCable64_win10.inf");
   Guid cls;uint needed;var name=new StringBuilder(128);
   Check(SetupDiGetINFClassW(inf,out cls,name,128,out needed));
   if(Existing(cls)){
    LogStage("InstallDriver:Existing",0,"driver_already_installed");
    return true;
   }
   IntPtr set=SetupDiCreateDeviceInfoList(ref cls,IntPtr.Zero);
   if(set==Invalid)throw new Win32Exception();
   bool registered=false,installed=false;
   var info=new DeviceInfo{size=(uint)Marshal.SizeOf(typeof(DeviceInfo))};
   try{
    LogStage("InstallDriver:CreateDeviceInfo",0,"starting");
    Check(SetupDiCreateDeviceInfoW(set,name.ToString(),ref cls,"VB-Audio Virtual Cable",IntPtr.Zero,1,ref info));
    byte[] hardware=Encoding.Unicode.GetBytes(Hardware+"\0\0");
    Check(SetupDiSetDeviceRegistryPropertyW(set,ref info,1,hardware,(uint)hardware.Length));
    Check(SetupDiCallClassInstaller(0x19,set,ref info));
    registered=true;
    bool reboot;
    LogStage("InstallDriver:UpdateDriver",0,"calling UpdateDriverForPlugAndPlayDevicesW");
    Check(UpdateDriverForPlugAndPlayDevicesW(IntPtr.Zero,Hardware,inf,0,out reboot));
    installed=true;
    LogStage("InstallDriver:Complete",0,reboot?"reboot_needed":"driver_installed");
    return reboot;
   }finally{
    if(registered&&!installed)SetupDiCallClassInstaller(5,set,ref info);
    SetupDiDestroyDeviceInfoList(set);
   }
  }
  static int Command(string file,params string[] args){var start=new ProcessStartInfo(file,string.Join(" ",args.Select(Quote))){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};using(var process=Process.Start(start)){if(!process.WaitForExit(30000))throw new Win32Exception(1460,"Windows microphone setup did not finish.");return process.ExitCode;}}
  static string Scheduler(){return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"schtasks.exe");}
  static void RemoveTask(){Command(Scheduler(),"/Delete","/TN",TaskName,"/F");}
  static void ScheduleCompletion(){
   string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"MOHIVX-Microphone");string prefix=Path.GetPathRoot(root);foreach(string part in root.Substring(prefix.Length).Split(Path.DirectorySeparatorChar)){prefix=Path.Combine(prefix,part);if(Directory.Exists(prefix)&&(File.GetAttributes(prefix)&FileAttributes.ReparsePoint)!=0)throw new Win32Exception(5,"Microphone setup folder is redirected.");}
   var admin=new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid,null);var system=new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null);var users=new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid,null);var security=new DirectorySecurity();security.SetOwner(admin);security.SetAccessRuleProtection(true,false);foreach(var sid in new[]{admin,system})security.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));security.AddAccessRule(new FileSystemAccessRule(users,FileSystemRights.ReadAndExecute,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));Directory.CreateDirectory(root,security);Directory.SetAccessControl(root,security);
   string helper=ReplaceHelper(Process.GetCurrentProcess().MainModule.FileName,root);var access=new FileSecurity();access.SetOwner(admin);access.SetAccessRuleProtection(true,false);foreach(var sid in new[]{admin,system})access.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,AccessControlType.Allow));access.AddAccessRule(new FileSystemAccessRule(users,FileSystemRights.ReadAndExecute,AccessControlType.Allow));File.SetAccessControl(helper,access);
   // This short completion task runs only the helper in administrator-writable
   // Program Files. It changes the known capture alias, never records audio.
   int code=Command(Scheduler(),"/Create","/TN",TaskName,"/TR",Quote(helper)+" --finalize","/SC","ONSTART","/RU","SYSTEM","/RL","HIGHEST","/F");
   if(code!=0)throw new Win32Exception(code>0?code:5,"Windows could not schedule microphone completion.");
  }
  static int FinalizeAlias(){for(int i=0;i<60;i++){try{if(MicEndpoints.Brand()){RemoveTask();return 0;}}catch{}Thread.Sleep(1000);}return 3010;}
  static int Install(){
   var values=MicEndpoints.List();
   var capture=MicEndpoints.Capture(values);
   var render=MicEndpoints.Render(values);
   if(MicEndpoints.Ready()){
    LogStage("Install:InitialCheck",0,"already_ready");
    return 0;
   }
   if(!Admin()){
    LogStage("Install:Elevate",0,"requesting_runas");
    try{
     var start=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--install"){UseShellExecute=true,Verb="runas",WindowStyle=ProcessWindowStyle.Hidden};
     using(var process=Process.Start(start)){
      process.WaitForExit();
      int childCode=process.ExitCode;
      if(childCode==0)LogStage("Install:ElevateReturned",0,"runas_child_succeeded");
      return childCode;
     }
    }catch(Win32Exception e){
     int exit=ExitCode(e);
     LogStage("Install:ElevateException",exit,e.Message);
     return exit;
    }
   }
   if(capture!=null&&!capture.Active){
    LogStage("Install:DeviceDisabled",unchecked((int)0x8007048F),"capture_endpoint_disabled");
    throw new Win32Exception(1167,"The virtual microphone is disabled in Windows. Enable it before setup.");
   }
   bool reboot=false;
   if(capture==null||render==null){
    LogStage("Install:Driver",0,"driver_missing_installing");
    reboot=InstallDriver(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"VB-CABLE"));
   }
   string brandDiag="";
   for(int i=0;i<20;i++){
    try{
     if(MicEndpoints.Brand(out brandDiag)&&MicEndpoints.Ready()){
      LogStage("Install:BrandedAndReady",0,"alias_and_ready_verified");
      return reboot?3010:0;
     }
    }catch(Exception ex){
     MicDiagnostics.Exception("Install:Brand",ex);
     throw;
    }
    Thread.Sleep(1000);
   }
   LogStage("Install:ScheduleCompletion",3010,"loop_exhausted_scheduling_completion");
   ScheduleCompletion();
   return 3010;
  }
  [STAThread]public static int Main(string[] args){
   try{Console.OutputEncoding=new UTF8Encoding(false);}catch{}
   try{
    if(args.Length!=1)throw new Exception("Choose microphone setup or status.");
    if(args[0]=="--status"){
     Console.WriteLine(new JavaScriptSerializer().Serialize(MicEndpoints.Status()));
     return 0;
    }
    if(args[0]=="--verify-bundle"){
     Verify(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"VB-CABLE"));
     Console.WriteLine("{\"success\":true}");
     return 0;
    }
    if(args[0]=="--install")return Install();
    if(args[0]=="--finalize"&&Admin())return FinalizeAlias();
    throw new Exception("Unsupported setup action.");
   }catch(Exception e){
    int exit=ExitCode(e);
    MicDiagnostics.Exception("Main:Exception",e);
    try{Console.Error.WriteLine(e.Message);}catch{}
    return exit;
   }
  }
 }
}
