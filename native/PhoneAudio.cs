using System;using System.Collections.Generic;using System.Runtime.InteropServices;
namespace MohivxPhone {
 // Sends PCM only to an explicitly selected, already installed virtual cable.
 // Never falls back to speakers or Windows' default output.
 sealed class PhoneAudio:IDisposable {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Caps {public ushort manufacturer,product;public uint version;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string name;public uint formats;public ushort channels,reserved;public uint support;}
  [StructLayout(LayoutKind.Sequential,Pack=2)] struct Format {public ushort tag,channels;public uint rate,bytesPerSecond;public ushort align,bits,extra;}
  [StructLayout(LayoutKind.Sequential)] struct Header {public IntPtr data;public uint length,recorded;public UIntPtr user;public uint flags,loops;public IntPtr next;public UIntPtr reserved;}
  [DllImport("winmm.dll")] static extern uint waveOutGetNumDevs();
  [DllImport("winmm.dll",CharSet=CharSet.Unicode)] static extern uint waveOutGetDevCapsW(UIntPtr device,out Caps caps,uint size);
  [DllImport("winmm.dll")] static extern uint waveOutOpen(out IntPtr handle,uint device,ref Format format,IntPtr callback,IntPtr instance,uint flags);
  [DllImport("winmm.dll")] static extern uint waveOutPrepareHeader(IntPtr handle,IntPtr header,uint size);
  [DllImport("winmm.dll")] static extern uint waveOutWrite(IntPtr handle,IntPtr header,uint size);
  [DllImport("winmm.dll")] static extern uint waveOutUnprepareHeader(IntPtr handle,IntPtr header,uint size);
  [DllImport("winmm.dll")] static extern uint waveOutReset(IntPtr handle);
  [DllImport("winmm.dll")] static extern uint waveOutClose(IntPtr handle);
  sealed class Block {public IntPtr data,header;}
  IntPtr handle=IntPtr.Zero;int selected=-1,sampleRate=0;readonly List<Block> blocks=new List<Block>();
  internal static bool Virtual(string name){return name!=null&&(name.IndexOf("CABLE Input",StringComparison.OrdinalIgnoreCase)>=0||name.IndexOf("VB-Audio Virtual",StringComparison.OrdinalIgnoreCase)>=0);}
  public static object[] Devices(){var list=new List<object>();for(uint i=0;i<waveOutGetNumDevs();i++){Caps caps;if(waveOutGetDevCapsW(new UIntPtr(i),out caps,(uint)Marshal.SizeOf(typeof(Caps)))==0&&Virtual(caps.name))list.Add(new{id=i,name=caps.name});}return list.ToArray();}
  static void Check(uint code){if(code!=0)throw new Exception("Virtual audio cable unavailable ("+code+").");}
  void Free(Block block){waveOutUnprepareHeader(handle,block.header,(uint)Marshal.SizeOf(typeof(Header)));Marshal.FreeHGlobal(block.header);Marshal.FreeHGlobal(block.data);}
  void Collect(){for(int i=blocks.Count-1;i>=0;i--){var header=(Header)Marshal.PtrToStructure(blocks[i].header,typeof(Header));if((header.flags&1)!=0){Free(blocks[i]);blocks.RemoveAt(i);}}}
  public void AutomaticWrite(int rate,string encoded){try{Write(handle==IntPtr.Zero?MicEndpoints.AutomaticDevice():selected,rate,encoded);}catch{Dispose();throw;}}
  public void Write(int device,int rate,string encoded){
   if(device<0||device>=waveOutGetNumDevs()||(rate!=16000&&rate!=24000&&rate!=48000))throw new Exception("Invalid virtual audio route.");
   Caps caps;Check(waveOutGetDevCapsW(new UIntPtr((uint)device),out caps,(uint)Marshal.SizeOf(typeof(Caps))));if(!Virtual(caps.name))throw new Exception("Select the virtual cable input, not speakers.");
   var bytes=Convert.FromBase64String(encoded);if(bytes.Length<2||bytes.Length%2!=0||bytes.Length>rate*4)throw new Exception("Invalid PCM packet.");
   if(handle==IntPtr.Zero||selected!=device||sampleRate!=rate){Dispose();var format=new Format{tag=1,channels=1,rate=(uint)rate,bytesPerSecond=(uint)rate*2,align=2,bits=16};Check(waveOutOpen(out handle,(uint)device,ref format,IntPtr.Zero,IntPtr.Zero,0));selected=device;sampleRate=rate;}
   Collect();if(blocks.Count>=4)return;
   var block=new Block{data=Marshal.AllocHGlobal(bytes.Length),header=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Header)))};
   Marshal.Copy(bytes,0,block.data,bytes.Length);Marshal.StructureToPtr(new Header{data=block.data,length=(uint)bytes.Length},block.header,false);
   bool prepared=false;try{Check(waveOutPrepareHeader(handle,block.header,(uint)Marshal.SizeOf(typeof(Header))));prepared=true;Check(waveOutWrite(handle,block.header,(uint)Marshal.SizeOf(typeof(Header))));blocks.Add(block);}catch{if(prepared)waveOutUnprepareHeader(handle,block.header,(uint)Marshal.SizeOf(typeof(Header)));Marshal.FreeHGlobal(block.header);Marshal.FreeHGlobal(block.data);throw;}
  }
  public void Dispose(){if(handle==IntPtr.Zero)return;waveOutReset(handle);foreach(var block in blocks)Free(block);blocks.Clear();waveOutClose(handle);handle=IntPtr.Zero;selected=-1;sampleRate=0;}
 }
}
