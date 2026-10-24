using System;using System.IO;using System.Drawing;using System.Drawing.Imaging;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Web.Script.Serialization;using System.Threading;using System.IO.MemoryMappedFiles;using System.Security.Cryptography;using Microsoft.Win32;
namespace MohivxPhone {
 static class Input {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT {public int dx,dy;public uint data,flags,time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT {public ushort key,scan;public uint flags,time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Explicit)] struct UNION {[FieldOffset(0)]public MOUSEINPUT mouse;[FieldOffset(0)]public KEYBDINPUT key;}
  [StructLayout(LayoutKind.Sequential)] struct INPUT {public uint type;public UNION data;}
  [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,INPUT[] inputs,int size);
  static readonly Dictionary<string,ushort> keys=new Dictionary<string,ushort>{{"enter",13},{"backspace",8},{"tab",9},{"escape",27},{"left",37},{"up",38},{"right",39},{"down",40},{"home",36},{"end",35},{"delete",46}};
  public static void Send(Dictionary<string,object> value){var result=new List<INPUT>();string type=Convert.ToString(value["type"]);
   if(type=="move"){int x=Convert.ToInt32(value["dx"]),y=Convert.ToInt32(value["dy"]);if(Math.Abs(x)>2000||Math.Abs(y)>2000)throw new Exception("Invalid pointer movement.");result.Add(new INPUT{type=0,data=new UNION{mouse=new MOUSEINPUT{dx=x,dy=y,flags=1}}});}
   else if(type=="click"){string button=Convert.ToString(value["button"]);if(button!="left"&&button!="right")throw new Exception("Invalid button.");uint down=button=="left"?2u:8u;result.Add(new INPUT{type=0,data=new UNION{mouse=new MOUSEINPUT{flags=down}}});result.Add(new INPUT{type=0,data=new UNION{mouse=new MOUSEINPUT{flags=down*2}}});}
   else if(type=="scroll"){int delta=Convert.ToInt32(value["delta"]);if(Math.Abs(delta)>20)throw new Exception("Invalid scroll.");result.Add(new INPUT{type=0,data=new UNION{mouse=new MOUSEINPUT{data=unchecked((uint)(delta*120)),flags=0x800}}});}
   else if(type=="text"){string text=Convert.ToString(value["text"]);if(text.Length>2000)throw new Exception("Text too long.");foreach(char c in text){result.Add(new INPUT{type=1,data=new UNION{key=new KEYBDINPUT{scan=c,flags=4}}});result.Add(new INPUT{type=1,data=new UNION{key=new KEYBDINPUT{scan=c,flags=6}}});}}
   else if(type=="key"){ushort key;if(!keys.TryGetValue(Convert.ToString(value["key"]),out key))throw new Exception("Unsupported key.");result.Add(new INPUT{type=1,data=new UNION{key=new KEYBDINPUT{key=key}}});result.Add(new INPUT{type=1,data=new UNION{key=new KEYBDINPUT{key=key,flags=2}}});}
   else throw new Exception("Unsupported input.");
   if(result.Count>0&&SendInput((uint)result.Count,result.ToArray(),Marshal.SizeOf(typeof(INPUT)))!=(uint)result.Count)throw new Exception("Windows refused input. Administrator windows cannot be controlled.");
  }
 }
 class Camera:IDisposable {
  EventWaitHandle want=new EventWaitHandle(false,EventResetMode.AutoReset,"MohivxPhone_Want");
  public bool Frame(string data){
   using(var input=new MemoryStream(Convert.FromBase64String(data)))using(var source=new Bitmap(input))using(var image=new Bitmap(1280,720,PixelFormat.Format32bppArgb)){
    if(source.Width*source.Height>4000000)throw new Exception("Image too large.");using(var g=Graphics.FromImage(image)){g.Clear(Color.Black);float scale=Math.Min((float)image.Width/source.Width,(float)image.Height/source.Height);int width=(int)(source.Width*scale),height=(int)(source.Height*scale);g.DrawImage(source,(image.Width-width)/2,(image.Height-height)/2,width,height);}
    Mutex mutex=null;EventWaitHandle sent=null;MemoryMappedFile map=null;try{mutex=Mutex.OpenExisting("MohivxPhone_Mutx");sent=EventWaitHandle.OpenExisting("MohivxPhone_Sent");map=MemoryMappedFile.OpenExisting("MohivxPhone_Data");}catch{if(mutex!=null)mutex.Dispose();if(sent!=null)sent.Dispose();if(map!=null)map.Dispose();return false;}
    using(mutex)using(sent)using(map)using(var view=map.CreateViewAccessor()){
     bool owned=false;try{try{owned=mutex.WaitOne(500);}catch(AbandonedMutexException){owned=true;}if(!owned)return false;
      int count=image.Width*image.Height*4;if(view.ReadUInt32(0)<count)throw new Exception("Camera buffer too small.");var bytes=new byte[count];var bits=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
      try{for(int y=0;y<image.Height;y++)Marshal.Copy(IntPtr.Add(bits.Scan0,y*bits.Stride),bytes,y*image.Width*4,image.Width*4);}finally{image.UnlockBits(bits);}
      for(int i=0;i<bytes.Length;i+=4){byte b=bytes[i];bytes[i]=bytes[i+2];bytes[i+2]=b;}
      view.Write(4,image.Width);view.Write(8,image.Height);view.Write(12,image.Width);view.Write(16,0);view.Write(20,1);view.Write(24,0);view.Write(28,2000);view.WriteArray(32,bytes,0,bytes.Length);
     }finally{if(owned)mutex.ReleaseMutex();}sent.Set();return true;
    }
   }
  }
  public void Dispose(){want.Dispose();}
 }
 static class Host {
  static readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=2000000};
  const string service="{A91DE688-1B7F-4DEC-8666-912BD3E70010}",properties="{A91DE688-1B7F-4DEC-8666-912BD3E70011}",category="{860BB310-5D01-11D0-BD3B-00A0C911CE86}";
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr LoadLibrary(string file);
  [DllImport("kernel32.dll",CharSet=CharSet.Ansi)]static extern IntPtr GetProcAddress(IntPtr dll,string name);
  [DllImport("kernel32.dll")]static extern bool FreeLibrary(IntPtr dll);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Registration();
  static bool Registered(){using(var key=Registry.CurrentUser.OpenSubKey("Software\\Classes\\CLSID\\"+service+"\\InprocServer32")){var file=Convert.ToString(key==null?null:key.GetValue(""));return !string.IsNullOrEmpty(file)&&File.Exists(file);}}
  static void Register(bool install){
   string dll=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"MohivxCamera64.dll");
   if(install){byte[] bytes=File.ReadAllBytes(dll);string hash;using(var sha=SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").Substring(0,16);string dir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".mohivx-island","virtual-camera",hash);Directory.CreateDirectory(dir);dll=Path.Combine(dir,"MohivxCamera64.dll");if(!File.Exists(dll))File.WriteAllBytes(dll,bytes);
    foreach(string guid in new[]{service,properties})using(var key=Registry.CurrentUser.CreateSubKey("Software\\Classes\\CLSID\\"+guid+"\\InprocServer32")){key.SetValue("",dll);key.SetValue("ThreadingModel","Both");}
    using(var key=Registry.CurrentUser.CreateSubKey("Software\\Classes\\CLSID\\"+category+"\\Instance\\"+service)){key.SetValue("FriendlyName","MOHIVX Phone Camera");key.SetValue("CLSID",service);key.SetValue("DevicePath","mohivx:phone-camera");}
   }else{using(var key=Registry.CurrentUser.OpenSubKey("Software\\Classes\\CLSID\\"+service+"\\InprocServer32"))dll=Convert.ToString(key==null?null:key.GetValue(""));if(string.IsNullOrEmpty(dll))return;}
   var module=LoadLibrary(dll);if(module==IntPtr.Zero)throw new Exception("Camera component could not load.");try{var address=GetProcAddress(module,install?"DllRegisterServer":"DllUnregisterServer");if(address==IntPtr.Zero)throw new Exception("Camera registration is unavailable.");var register=(Registration)Marshal.GetDelegateForFunctionPointer(address,typeof(Registration));Marshal.ThrowExceptionForHR(register());}finally{FreeLibrary(module);}
   if(!install){foreach(var guid in new[]{service,properties})Registry.CurrentUser.DeleteSubKeyTree("Software\\Classes\\CLSID\\"+guid,false);Registry.CurrentUser.DeleteSubKeyTree("Software\\Classes\\CLSID\\"+category+"\\Instance\\"+service,false);}
  }
  static void Reply(object value){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}
  [STAThread]public static int Main(string[] args){Console.InputEncoding=System.Text.Encoding.UTF8;Console.OutputEncoding=new System.Text.UTF8Encoding(false);
   if(args.Length>0){try{if(args[0]=="--install-camera"||args[0]=="--remove-camera"){Register(args[0]=="--install-camera");Reply(new{success=true});return 0;}if(args[0]=="--self-test"){Reply(new{success=true});return 0;}}catch(Exception e){Reply(new{success=false,error=e.Message});return 1;}}
   Camera camera=null;var audio=new PhoneAudio();string line;while((line=Console.ReadLine())!=null){object id=null;try{if(line.Length>1500000)throw new Exception("Request too large.");var request=json.Deserialize<Dictionary<string,object>>(line);id=request["id"];string action=Convert.ToString(request["action"]);bool active=true;if(action=="audio-route-status"){Reply(new{id,success=true,microphone=MicEndpoints.Status()});continue;}else if(action=="audio-auto"){audio.AutomaticWrite(Convert.ToInt32(request["rate"]),Convert.ToString(request["data"]));}else if(action=="camera-status"){Reply(new{id,success=true,installed=Registered()});continue;}else if(action=="input")Input.Send((Dictionary<string,object>)request["input"]);else if(action=="camera"){if(camera==null)camera=new Camera();active=camera.Frame(Convert.ToString(request["data"]));}else if(action=="camera-stop"){if(camera!=null)camera.Dispose();camera=null;}else if(action=="audio-devices"){Reply(new{id,success=true,devices=PhoneAudio.Devices()});continue;}else if(action=="audio"){audio.Write(Convert.ToInt32(request["device"]),Convert.ToInt32(request["rate"]),Convert.ToString(request["data"]));}else if(action=="audio-stop"){audio.Dispose();}else throw new Exception("Unsupported action.");Reply(new{id,success=true,active});}catch(Exception e){Reply(new{id,success=false,error=e.Message});}}if(camera!=null)camera.Dispose();audio.Dispose();return 0;
  }
 }
}
