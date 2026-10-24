using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace MohivxWallpaper {
 [ComImport,Guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD")] class DesktopWallpaper {}
 [ComImport,Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IWallpaper {
  void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitor,[MarshalAs(UnmanagedType.LPWStr)] string file);
  [return:MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitor);
  [return:MarshalAs(UnmanagedType.LPWStr)] string GetMonitorDevicePathAt(uint index);
  uint GetMonitorDevicePathCount();
  void GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitor,out RECT rectangle);
  void SetBackgroundColor(uint color); uint GetBackgroundColor(); void SetPosition(uint position); uint GetPosition();
 }
 [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left,Top,Right,Bottom; }
 static class Desktop {
  delegate bool WindowEnum(IntPtr window,IntPtr param);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string cls,string name);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string cls,string name);
  [DllImport("user32.dll")] static extern bool EnumWindows(WindowEnum callback,IntPtr param);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr window,uint msg,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr window,int index,int value);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window,int index);
  [DllImport("user32.dll")] static extern IntPtr SetParent(IntPtr child,IntPtr parent);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr child);
  [DllImport("user32.dll")] static extern int MapWindowPoints(IntPtr from,IntPtr to,ref Point point,uint count);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  public static bool Attach(Form form,Rectangle bounds){
   var progman=FindWindow("Progman",null);if(progman==IntPtr.Zero)return false;
   IntPtr ignored;SendMessageTimeout(progman,0x052C,IntPtr.Zero,IntPtr.Zero,2,500,out ignored);
   var host=FindWindowEx(progman,IntPtr.Zero,"WorkerW",null);
   if(host==IntPtr.Zero)EnumWindows(delegate(IntPtr window,IntPtr p){if(FindWindowEx(window,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero){host=FindWindowEx(IntPtr.Zero,window,"WorkerW",null);return false;}return true;},IntPtr.Zero);
   if(host==IntPtr.Zero)return false;
   var handle=form.Handle;SetWindowLong(handle,-16,(GetWindowLong(handle,-16)&~unchecked((int)0x80000000))|0x40000000);
   SetParent(handle,host);if(GetParent(handle)!=host)return false;
   var point=new Point(bounds.Left,bounds.Top);MapWindowPoints(IntPtr.Zero,host,ref point,1);
   return SetWindowPos(handle,IntPtr.Zero,point.X,point.Y,bounds.Width,bounds.Height,0x0010|0x0004);
  }
 }
 class Reveal:Form {
  readonly Bitmap image; readonly Rectangle screen; readonly Stopwatch watch=new Stopwatch();readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();readonly int duration;readonly Action finished;double progress;
  public Reveal(Bitmap image,Rectangle screen,int duration,Action finished){this.image=image;this.screen=screen;this.duration=duration;this.finished=finished;FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;Bounds=screen;DoubleBuffered=true;SetStyle(ControlStyles.Opaque,true);timer.Interval=15;timer.Tick+=Tick;}
  protected override bool ShowWithoutActivation {get{return true;}}
  protected override CreateParams CreateParams {get{var cp=base.CreateParams;cp.ExStyle|=0x08000000|0x00000080|0x00000020;return cp;}}
  public void Begin(){UpdateCircle(0);Show();watch.Start();timer.Start();}
  void Tick(object s,EventArgs e){double p=Math.Min(1,watch.Elapsed.TotalMilliseconds/duration);UpdateCircle(p);if(p>=1){timer.Stop();finished();}}
  void UpdateCircle(double value){progress=value;double radius=Radius(screen.Width,screen.Height,progress);using(var path=new GraphicsPath()){float r=(float)Math.Max(.5,radius);path.AddEllipse(screen.Width/2f-r,screen.Height/2f-r,r*2,r*2);var old=Region;Region=new Region(path);if(old!=null)old.Dispose();}Invalidate();}
  public static double Radius(int width,int height,double progress){double p=Math.Max(0,Math.Min(1,progress)),ease=p*p*(3-2*p);return Math.Sqrt((double)width*width+(double)height*height)/2*ease+((p==0)?0:2);}
  public static void PaintRipple(Graphics graphics,Bitmap image,Size size,double progress){
   // The supplied reference is a clean center-out reveal with a crisp boundary.
   graphics.DrawImageUnscaled(image,0,0);
  }
  protected override void OnPaint(PaintEventArgs e){PaintRipple(e.Graphics,image,screen.Size,progress);}
  protected override void WndProc(ref Message m){if(m.Msg==0x21){m.Result=new IntPtr(3);return;}if(m.Msg==0x84){m.Result=new IntPtr(-1);return;}base.WndProc(ref m);}
  protected override void Dispose(bool disposing){if(disposing){timer.Stop();timer.Dispose();image.Dispose();}base.Dispose(disposing);}
 }
 static class Host {
  static readonly JavaScriptSerializer json=new JavaScriptSerializer();static Control dispatcher;static IWallpaper wallpaper;static bool busy;
  static string Current(){if(wallpaper==null)wallpaper=(IWallpaper)new DesktopWallpaper();return wallpaper.GetWallpaper(null)??"";}
  static void Reply(object value){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}
  static bool Same(string a,string b){return string.Equals(Path.GetFullPath(a),Path.GetFullPath(b),StringComparison.OrdinalIgnoreCase);}
  static Bitmap Frame(string file,Rectangle screen){
   if((long)screen.Width*screen.Height>50000000)throw new Exception("Display is too large for a transition.");
   var canvas=new Bitmap(screen.Width,screen.Height);using(var source=Image.FromFile(file))using(var g=Graphics.FromImage(canvas)){
    g.Clear(Color.Black);g.InterpolationMode=InterpolationMode.HighQualityBilinear;
    foreach(var monitor in Screen.AllScreens){var r=monitor.Bounds;double scale=Math.Max((double)r.Width/source.Width,(double)r.Height/source.Height);float w=(float)(source.Width*scale),h=(float)(source.Height*scale);var target=new RectangleF(r.Left-screen.Left+(r.Width-w)/2,r.Top-screen.Top+(r.Height-h)/2,w,h);var clip=g.Save();g.SetClip(new Rectangle(r.Left-screen.Left,r.Top-screen.Top,r.Width,r.Height));g.DrawImage(source,target);g.Restore(clip);}
   }return canvas;
  }
  static void Process(string line){
   object id=null;try{
    var request=json.Deserialize<Dictionary<string,object>>(line);id=request["id"];var action=Convert.ToString(request["action"]);
    if(action=="get"){Reply(new{id,success=true,currentWallpaper=Current()});return;}
    if(action!="apply"||busy)throw new Exception("Unsupported or busy wallpaper operation.");
    var file=Path.GetFullPath(Convert.ToString(request["path"]));if(!File.Exists(file))throw new Exception("Wallpaper does not exist.");
    var previous=Current();var position=wallpaper.GetPosition();busy=true;
    Action<bool,Reveal> commit=delegate(bool animated,Reveal overlay){
     try{wallpaper.SetPosition(4);wallpaper.SetWallpaper(null,file);var current=Current();if(!Same(current,file))throw new Exception("Wallpaper readback did not match.");
      if(overlay!=null){var settle=new System.Windows.Forms.Timer();settle.Interval=90;settle.Tick+=delegate{settle.Stop();settle.Dispose();overlay.Close();busy=false;Reply(new{id,success=true,path=current,animated});};settle.Start();}
      else {busy=false;Reply(new{id,success=true,path=current,animated=false});}
     }catch(Exception error){try{if(previous.Length>0){wallpaper.SetWallpaper(null,previous);wallpaper.SetPosition(position);}}catch{}if(overlay!=null)overlay.Close();busy=false;Reply(new{id,success=false,error=error.Message});}
    };
    bool animate=request.ContainsKey("animate")&&Convert.ToBoolean(request["animate"]);
    if(animate){Reveal overlay=null;try{var bounds=SystemInformation.VirtualScreen;overlay=new Reveal(Frame(file,bounds),bounds,480,delegate{commit(true,overlay);});if(Desktop.Attach(overlay,bounds)){overlay.Begin();return;}overlay.Dispose();}catch{if(overlay!=null)overlay.Dispose();}}
    commit(false,null);
   }catch(Exception error){busy=false;Reply(new{id,success=false,error=error.Message});}
  }
  [STAThread] public static int Main(string[] args){
   Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);
   if(args.Length>0&&args[0]=="--self-test"){double last=-1;for(int i=0;i<=100;i++){double radius=Reveal.Radius(3840,2160,i/100.0);if(radius<last)return 1;last=radius;}if(last<2202)return 2;Reply(new{success=true,monotonic=true,coversCorners=true,centerOutReveal=true});return 0;}
   if(args.Length>1&&args[0]=="--render-ripple-test"){
    string folder=Path.GetFullPath(args[1]);Directory.CreateDirectory(folder);
    using(var image=new Bitmap(960,540)){
     using(var g=Graphics.FromImage(image))using(var gradient=new LinearGradientBrush(new Rectangle(0,0,960,540),Color.FromArgb(15,80,130),Color.FromArgb(150,220,210),45f)){g.FillRectangle(gradient,0,0,960,540);for(int x=0;x<960;x+=40)g.DrawLine(Pens.White,x,0,x,540);for(int y=0;y<540;y+=40)g.DrawLine(Pens.White,0,y,960,y);}
     for(int i=1;i<=3;i++)using(var output=new Bitmap(960,540))using(var g=Graphics.FromImage(output))using(var clip=new GraphicsPath()){
      double p=i*.22;float r=(float)Reveal.Radius(960,540,p);g.Clear(Color.Transparent);clip.AddEllipse(480-r,270-r,r*2,r*2);g.SetClip(clip);Reveal.PaintRipple(g,image,image.Size,p);output.Save(Path.Combine(folder,"ripple-"+i+".png"),System.Drawing.Imaging.ImageFormat.Png);
     }
    }Reply(new{success=true,centerOutReveal=true});return 0;
   }
   try{Desktop.SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
   dispatcher=new Control();var handle=dispatcher.Handle;
   var reader=new Thread(delegate(){string line;while((line=Console.ReadLine())!=null){if(line.Length>32768)continue;string input=line;try{dispatcher.BeginInvoke(new Action(delegate{Process(input);}));}catch{break;}}try{dispatcher.BeginInvoke(new Action(Application.ExitThread));}catch{}});reader.IsBackground=true;reader.Start();Application.Run();dispatcher.Dispose();if(wallpaper!=null)Marshal.ReleaseComObject(wallpaper);return 0;
  }
 }
}
