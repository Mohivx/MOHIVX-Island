using System;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Linq;
namespace MohivxPhone {
 sealed class MicEndpoint {public string Id,Name,Description,Adapter;public int Flow;public bool Active;}
 // Uses documented MMDevice properties. No default device, gain or physical
 // microphone setting is changed. Only the standard VB-CABLE capture alias.
 static class MicEndpoints {
  public const string Name="MOHIV Mic";
  [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]class EnumeratorClass{}
  [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface Enumerator{
   [PreserveSig]int EnumAudioEndpoints(int flow,uint state,out Collection devices);[PreserveSig]int GetDefaultAudioEndpoint(int flow,int role,out Device device);[PreserveSig]int GetDevice([MarshalAs(UnmanagedType.LPWStr)]string id,out Device device);
  }
  [ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface Collection{[PreserveSig]int GetCount(out uint count);[PreserveSig]int Item(uint index,out Device device);}
  [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface Device{
   [PreserveSig]int Activate(ref Guid iid,int context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)]out object value);[PreserveSig]int OpenPropertyStore(int access,out Store store);[PreserveSig]int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);[PreserveSig]int GetState(out uint state);
  }
  [StructLayout(LayoutKind.Sequential)]struct Key{public Guid fmt;public uint id;public Key(string value,uint index){fmt=new Guid(value);id=index;}}
  [StructLayout(LayoutKind.Explicit,Size=24)]struct Variant{[FieldOffset(0)]public ushort type;[FieldOffset(8)]public IntPtr pointer;}
  [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface Store{
   [PreserveSig]int GetCount(out uint count);[PreserveSig]int GetAt(uint index,out Key key);[PreserveSig]int GetValue(ref Key key,out Variant value);[PreserveSig]int SetValue(ref Key key,ref Variant value);[PreserveSig]int Commit();
  }
  [DllImport("ole32.dll")]static extern int PropVariantClear(ref Variant value);
  [DllImport("winmm.dll")]static extern uint waveOutGetNumDevs();
  [DllImport("winmm.dll")]static extern uint waveOutMessage(IntPtr device,uint message,IntPtr first,UIntPtr second);
  // Friendly is synthesized by Windows, e.g. "MOHIV Mic (VB-Audio Virtual Cable)".
  // The short endpoint description is the editable label. Never write the
  // synthesized Friendly property or the vendor adapter name.
  static readonly Key Friendly=new Key("a45c254e-df1c-4efd-8020-67d146a850e0",14),Description=new Key("a45c254e-df1c-4efd-8020-67d146a850e0",2),Adapter=new Key("026e516e-b814-414b-83cd-856d6fef4822",2);
  static void Release(object value){if(value!=null&&Marshal.IsComObject(value))Marshal.ReleaseComObject(value);}
  static string Read(Store store,Key key){Variant value;Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));try{return value.type==31?Marshal.PtrToStringUni(value.pointer)??"":"";}finally{PropVariantClear(ref value);}}
  public static MicEndpoint[] List(){var result=new List<MicEndpoint>();Enumerator enumerator=null;try{enumerator=(Enumerator)new EnumeratorClass();for(int flow=0;flow<=1;flow++){Collection list=null;try{Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(flow,15,out list));uint count;Marshal.ThrowExceptionForHR(list.GetCount(out count));for(uint i=0;i<count;i++){Device device=null;Store store=null;try{Marshal.ThrowExceptionForHR(list.Item(i,out device));string id;uint state;Marshal.ThrowExceptionForHR(device.GetId(out id));Marshal.ThrowExceptionForHR(device.GetState(out state));Marshal.ThrowExceptionForHR(device.OpenPropertyStore(0,out store));result.Add(new MicEndpoint{Id=id,Name=Read(store,Friendly),Description=Read(store,Description),Adapter=Read(store,Adapter),Flow=flow,Active=(state&1)!=0});}catch{}finally{Release(store);Release(device);}}}finally{Release(list);}}}finally{Release(enumerator);}return result.ToArray();}
  public static bool Standard(MicEndpoint value){return value!=null&&string.Equals(value.Adapter,"VB-Audio Virtual Cable",StringComparison.OrdinalIgnoreCase);}
  internal static bool Branded(MicEndpoint value){return value!=null&&Standard(value)&&(value.Description==Name||value.Name==Name);}
  internal static bool CanRename(MicEndpoint value){return value!=null&&value.Flow==1&&value.Active&&Standard(value)&&!string.IsNullOrEmpty(value.Id);}
  public static MicEndpoint Capture(IEnumerable<MicEndpoint> values){return values.FirstOrDefault(v=>v.Flow==1&&Standard(v));}
  public static MicEndpoint Render(IEnumerable<MicEndpoint> values){return values.FirstOrDefault(v=>v.Flow==0&&Standard(v));}
  public static int WaveDevice(string id){for(uint i=0;i<waveOutGetNumDevs();i++){IntPtr size=Marshal.AllocHGlobal(4);try{Marshal.WriteInt32(size,0);if(waveOutMessage(new IntPtr(i),0x812,size,UIntPtr.Zero)!=0)continue;int bytes=Marshal.ReadInt32(size);if(bytes<4||bytes>8192)continue;IntPtr buffer=Marshal.AllocHGlobal(bytes);try{if(waveOutMessage(new IntPtr(i),0x811,buffer,new UIntPtr((uint)bytes))==0&&string.Equals(Marshal.PtrToStringUni(buffer),id,StringComparison.OrdinalIgnoreCase))return (int)i;}finally{Marshal.FreeHGlobal(buffer);}}finally{Marshal.FreeHGlobal(size);}}return -1;}
  public static object Status(){
   var values=List();
   var capture=Capture(values);
   var render=Render(values);
   int wave=render!=null&&render.Active?WaveDevice(render.Id):-1;
   var diag=MicDiagnostics.Read();
   return new{
    success=true,
    name=Name,
    installed=capture!=null&&render!=null,
    ready=capture!=null&&capture.Active&&Branded(capture)&&wave>=0,
    captureName=capture==null?"":capture.Name,
    captureLabel=capture==null?"":capture.Description,
    captureId=capture==null?"":capture.Id,
    renderId=render==null?"":render.Id,
    waveDevice=wave,
    lastStage=diag.stage,
    lastHresult=diag.hresult,
    lastDiagnostic=diag.message
   };
  }
  public static bool Ready(){try{AutomaticDevice();return true;}catch{return false;}}
  public static int AutomaticDevice(IEnumerable<MicEndpoint> values,Func<string,int> waveDevice){var capture=Capture(values);var render=Render(values);if(capture==null||!capture.Active||!Branded(capture)||render==null||!render.Active)throw new Exception("MOHIV Mic is not ready. Complete microphone setup.");int device=waveDevice(render.Id);if(device<0)throw new Exception("MOHIV Mic audio endpoint is unavailable.");return device;}
  public static int AutomaticDevice(){return AutomaticDevice(List(),WaveDevice);}
  public static bool Brand(){
   string diagnostic;return Brand(out diagnostic);
  }
  public static bool Brand(out string stageDiagnostic){
   stageDiagnostic="";
   var capture=Capture(List());
   if(!CanRename(capture)){
    stageDiagnostic="stage:capture_lookup_inactive";
    MicDiagnostics.Write("Brand:CaptureLookup",0,"capture_lookup_inactive");
    return false;
   }
   if(Branded(capture)){
    stageDiagnostic="stage:already_branded";
    MicDiagnostics.Write("Brand:Verify",0,"already_branded");
    return true;
   }
   Enumerator enumerator=null;Device device=null;Store store=null;
   try{
    enumerator=(Enumerator)new EnumeratorClass();
    int hr=enumerator.GetDevice(capture.Id,out device);
    if(hr!=0){
     stageDiagnostic="stage:get_device:0x"+((uint)hr).ToString("X8");
     MicDiagnostics.CheckHr(hr,"Brand:GetDevice");
    }
    hr=device.OpenPropertyStore(2,out store);
    if(hr!=0){
     stageDiagnostic="stage:open_property_store:0x"+((uint)hr).ToString("X8");
     MicDiagnostics.CheckHr(hr,"Brand:OpenPropertyStore");
    }
    // Recheck the exact endpoint before changing its editable label.
    uint state;MicDiagnostics.CheckHr(device.GetState(out state),"Brand:GetState");
    if((state&1)==0||!string.Equals(Read(store,Adapter),capture.Adapter,StringComparison.OrdinalIgnoreCase))return false;
    var key=Description;var value=new Variant{type=31,pointer=Marshal.StringToCoTaskMemUni(Name)};
    try{
     hr=store.SetValue(ref key,ref value);
     if(hr!=0){
      stageDiagnostic="stage:set_value:0x"+((uint)hr).ToString("X8");
      MicDiagnostics.CheckHr(hr,"Brand:SetValue");
     }
     hr=store.Commit();
     if(hr!=0){
      stageDiagnostic="stage:commit:0x"+((uint)hr).ToString("X8");
      MicDiagnostics.CheckHr(hr,"Brand:Commit");
     }
    }finally{PropVariantClear(ref value);}
    // Fresh re-enumeration to verify actual alias mutation
    var freshCapture=Capture(List());
    if(CanRename(freshCapture)&&freshCapture.Id==capture.Id&&Branded(freshCapture)){
     stageDiagnostic="stage:branded_verified";
     MicDiagnostics.Write("Brand:Verify",0,"branded_verified");
     return true;
    }
    stageDiagnostic="stage:mutation_unreflected";
    MicDiagnostics.Write("Brand:Verify",0,"mutation_unreflected");
    return false;
   }catch(Exception e){
    if(string.IsNullOrEmpty(stageDiagnostic)){
     int hrCode=Marshal.GetHRForException(e);
     stageDiagnostic="stage:brand_exception:0x"+((uint)hrCode).ToString("X8");
     MicDiagnostics.Exception("Brand:Enumerate",e);
    }
    throw;
   }finally{Release(store);Release(device);Release(enumerator);}
  }
 }
}
