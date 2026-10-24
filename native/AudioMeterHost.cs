using System;
using System.Runtime.InteropServices;
using System.Threading;

// Reads normalized output peaks only. No audio buffer or microphone is opened.
class AudioMeterHost {
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]class EnumeratorClass{}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface Enumerator{
  [PreserveSig]int EnumAudioEndpoints(int flow,int state,out IntPtr devices);
  [PreserveSig]int GetDefaultAudioEndpoint(int flow,int role,out Device device);
 }
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface Device{
  [PreserveSig]int Activate(ref Guid iid,int context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)]out object value);
  [PreserveSig]int OpenPropertyStore(int access,out IntPtr store);
  [PreserveSig]int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);
 }
 [ComImport,Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface Meter{
  [PreserveSig]int GetPeakValue(out float peak);
  [PreserveSig]int GetMeteringChannelCount(out uint count);
  [PreserveSig]int GetChannelsPeakValues(uint count,[Out,MarshalAs(UnmanagedType.LPArray,SizeParamIndex=0)]float[] values);
  [PreserveSig]int QueryHardwareSupport(out uint mask);
 }
 static void Release(object value){if(value!=null&&Marshal.IsComObject(value))Marshal.ReleaseComObject(value);}
 [MTAThread]static void Main(string[] args){
  Enumerator enumerator=null;Device device=null;Meter meter=null;string endpoint="";var culture=System.Globalization.CultureInfo.InvariantCulture;var next=DateTime.MinValue;
  try{enumerator=(Enumerator)new EnumeratorClass();while(true){bool available=false;float peak=0,left=0,right=0;
   try{
    if(DateTime.UtcNow>=next){next=DateTime.UtcNow.AddSeconds(1);Device current;Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0,1,out current));string id;current.GetId(out id);
     if(id!=endpoint||meter==null){Release(meter);meter=null;Release(device);device=current;endpoint=id;object value;Guid iid=typeof(Meter).GUID;Marshal.ThrowExceptionForHR(device.Activate(ref iid,23,IntPtr.Zero,out value));meter=(Meter)value;}else Release(current);
    }
    if(meter!=null){Marshal.ThrowExceptionForHR(meter.GetPeakValue(out peak));uint count;if(meter.GetMeteringChannelCount(out count)==0&&count>0&&count<=32){var channels=new float[count];if(meter.GetChannelsPeakValues(count,channels)==0){left=channels[0];right=channels[Math.Min(1,channels.Length-1)];}}available=true;}
   }catch{Release(meter);meter=null;endpoint="";}
   Console.WriteLine("{\"available\":"+(available?"true":"false")+",\"peak\":"+peak.ToString("0.0000",culture)+",\"left\":"+left.ToString("0.0000",culture)+",\"right\":"+right.ToString("0.0000",culture)+"}");
   if(args.Length>0&&args[0]=="--once")break;Thread.Sleep(40);
  }}catch{}finally{Release(meter);Release(device);Release(enumerator);}
 }
}
