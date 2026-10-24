const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),manifest=path.join(__dirname,'agent-hook','Cargo.toml');
const result=spawnSync('cargo',['build','--locked','--release','--manifest-path',manifest],{stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status||1);
const target=process.env.CARGO_TARGET_DIR?path.resolve(process.env.CARGO_TARGET_DIR):path.join(__dirname,'agent-hook','target');
fs.mkdirSync(path.join(root,'bin'),{recursive:true});
fs.copyFileSync(path.join(target,'release',process.platform==='win32'?'mohivx-hook.exe':'mohivx-hook'),path.join(root,'bin',process.platform==='win32'?'mohivx-hook.exe':'mohivx-hook'));
if(process.platform==='win32'){
  const csc=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  const compile=spawnSync(csc,['/nologo','/target:exe','/platform:x64','/optimize+','/out:'+path.join(root,'bin','mohivx-wallpaper.exe'),'/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll',path.join(__dirname,'WallpaperHost.cs')],{stdio:'inherit',windowsHide:true});
  if(compile.status!==0)process.exit(compile.status||1);
  const meter=spawnSync(csc,['/nologo','/target:exe','/platform:x64','/optimize+','/out:'+path.join(root,'bin','mohivx-audio-meter.exe'),path.join(__dirname,'AudioMeterHost.cs')],{stdio:'inherit',windowsHide:true});
  if(meter.status!==0)process.exit(meter.status||1);
  const phone=spawnSync(csc,['/nologo','/target:exe','/platform:x64','/optimize+','/out:'+path.join(root,'bin','mohivx-phone.exe'),'/r:System.Drawing.dll','/r:System.Web.Extensions.dll',path.join(__dirname,'PhoneHost.cs'),path.join(__dirname,'PhoneAudio.cs'),path.join(__dirname,'MicEndpoints.cs'),path.join(__dirname,'MicDiagnostics.cs')],{stdio:'inherit',windowsHide:true});
  if(phone.status!==0)process.exit(phone.status||1);
  const mic=spawnSync(process.execPath,[path.join(__dirname,'build-mic.cjs')],{stdio:'inherit',windowsHide:true});
  if(mic.status!==0)process.exit(mic.status||1);
  for(const name of ['LICENSE','NOTICE'])fs.copyFileSync(path.join(__dirname,'camera',name),path.join(root,'bin','phone-camera-'+name+'.txt'));
  const camera=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/c',path.join(__dirname,'build-camera.cmd')],{stdio:'inherit',windowsHide:true});
  if(camera.status!==0)process.exit(camera.status||1);
}
