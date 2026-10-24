using System;using System.IO;using System.Text;using System.Web.Script.Serialization;using System.Runtime.InteropServices;
namespace MohivxPhone {
 sealed class MicDiagnostic { public string stage="",hresult="0x00000000",message="";public long at; }
 // Shared by the installer and phone host. Status reads never mutate audio or logs.
 static class MicDiagnostics {
  internal static string FileOverride=null;
  static string FilePath {get{return FileOverride??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".mohivx-island","mic-install-stage.json");}}
  static bool PlainDirectory(string directory){for(var dir=new DirectoryInfo(directory);dir!=null;dir=dir.Parent)if(dir.Exists&&(dir.Attributes&FileAttributes.ReparsePoint)!=0)return false;return true;}
  public static void Write(string stage,int hr,string message){
   string temporary=null;
   try{
    string file=FilePath,dir=Path.GetDirectoryName(file);if(!PlainDirectory(dir))return;Directory.CreateDirectory(dir);if(!PlainDirectory(dir))return;
    var value=new MicDiagnostic{stage=stage,hresult="0x"+((uint)hr).ToString("X8"),message=message??"",at=(long)(DateTime.UtcNow-new DateTime(1970,1,1)).TotalMilliseconds};
    temporary=Path.Combine(dir,".mic-stage-"+Guid.NewGuid().ToString("N")+".tmp");
    using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var writer=new StreamWriter(stream,new UTF8Encoding(false)))writer.Write(new JavaScriptSerializer().Serialize(value));
    if(File.Exists(file))File.Replace(temporary,file,null);else File.Move(temporary,file);temporary=null;
   }catch{}finally{if(temporary!=null)try{File.Delete(temporary);}catch{}}
  }
  public static MicDiagnostic Read(){try{var info=new FileInfo(FilePath);if(info.Exists&&info.Length<=16384){var value=new JavaScriptSerializer().Deserialize<MicDiagnostic>(File.ReadAllText(info.FullName));if(value!=null)return value;}}catch{}return new MicDiagnostic();}
  internal static void CheckHr(int hr,string stage){if(hr>=0)return;var error=new COMException("Microphone setup failed at "+stage+" (0x"+((uint)hr).ToString("X8")+").",hr);error.Data["MicStage"]=stage;Write(stage,hr,"native_call_failed");throw error;}
  internal static void Exception(string fallback,Exception error){string stage=error.Data["MicStage"] as string??fallback;error.Data["MicStage"]=stage;Write(stage,Marshal.GetHRForException(error),"native_call_failed");}
 }
}
