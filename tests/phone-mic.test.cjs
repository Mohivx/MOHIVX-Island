const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const Router=require('../electron/services/phoneMicRouter.cjs'),Setup=require('../electron/services/phoneMicSetup.cjs'),AutoSetup=require('../electron/services/phoneMicAutoSetup.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('phone microphone forwards only sharing audio and respects automatic off',async()=>{const calls=[],settings={phoneMicAuto:false};const router=new Router({request:async(...args)=>{calls.push(args);return {success:true};}},()=>settings);router.frame({kind:'mic',device:'a',rate:16000,data:'AA=='});router.frame({kind:'camera',device:'a'});assert.equal(calls.length,0);settings.phoneMicAuto=true;router.frame({kind:'mic',device:'a',rate:16000,data:'AAA='});await tick();assert.deepEqual(calls,[['audio-auto',{rate:16000,data:'AAA='}]]);assert.equal(router.snapshot().active,true);router.frame({kind:'mic',device:'b',rate:16000,data:'AAA='});assert.equal(calls.length,1);router.frame({kind:'all',device:'a',stopped:true});await tick();assert.equal(calls[1][0],'audio-stop');assert.equal(router.snapshot().active,false);router.frame({kind:'mic',device:'b',rate:24000,data:'AAA='});await tick();assert.equal(router.snapshot().device,'b');});
test('a failed native route never claims connected or falls back to speakers',async()=>{let now=0,count=0;const router=new Router({request:async action=>{assert.equal(action,'audio-auto');count++;return {success:false,error:'Component missing'};}},()=>({}),()=>{},()=>now);router.frame({kind:'mic',device:'a'});await tick();assert.equal(router.snapshot().active,false);assert.match(router.snapshot().error,/missing/);router.frame({kind:'mic',device:'a'});assert.equal(count,1);now=2000;router.frame({kind:'mic',device:'a'});await tick();assert.equal(count,2);});
test('a stop during a pending frame cannot reactivate the microphone',async()=>{let resolve;const calls=[];const router=new Router({request:(action)=>{calls.push(action);return action==='audio-auto'?new Promise(done=>resolve=done):Promise.resolve({success:true});}},()=>({}));router.frame({kind:'mic',device:'a'});router.frame({kind:'mic',device:'a'});assert.equal(calls.length,1,'drop rather than queue unbounded audio');await router.stop();resolve({success:true});await tick();assert.equal(router.snapshot().active,false);assert.equal(router.snapshot().device,'');});
for(const [code,expected] of [
 [0,{success:true,code:'0'}],
 [3010,{success:true,restartRequired:true,code:'3010'}],
 [1223,{success:false,cancelled:true,code:'1223'}],
 [-2147024891,{success:false,code:'0x80070005'}],
 [-2147023729,{success:false,code:'0x8007048F'}],
 [1,{success:false,code:'1'}],
 ['ENOENT',{success:false,code:'ENOENT'}]
])test('microphone setup reports Windows exit '+code,async()=>{let callback,calls=0;const setup=new Setup('known-helper.exe',(file,args,options,done)=>{calls++;assert.equal(file,'known-helper.exe');assert.deepEqual(args,['--install']);assert.equal(options.windowsHide,true);callback=done;});assert.equal(calls,0,'constructing service never installs');const first=setup.install(),second=setup.install();assert.equal(calls,1);callback(code===0?null:{code});const result=await first;assert.equal(await second,result);for(const [key,value] of Object.entries(expected))assert.equal(result[key],value);if(!result.success&&!result.cancelled)assert.ok(String(result.error).includes(expected.code));});

test('microphone setup reads and formats per-user stage diagnostic',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-mic-stage-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const stageFile=path.join(dir,'mic-install-stage.json');
 fs.writeFileSync(stageFile,JSON.stringify({stage:'Brand:OpenPropertyStore',hresult:'0x80070005',message:'stage:open_property_store:0x80070005',at:Date.now()}));
 const setup=new Setup('known-helper.exe',(_file,_args,_opts,done)=>{fs.writeFileSync(stageFile,JSON.stringify({stage:'Brand:OpenPropertyStore',hresult:'0x80070005',at:Date.now()}));done({code:-2147024891});},dir);
 const res=await setup.install();
 assert.equal(res.success,false);
 assert.equal(res.code,'0x80070005');
 assert.equal(res.stage,'Brand:OpenPropertyStore');
 assert.ok(res.error.includes('Brand:OpenPropertyStore'));
});

test('microphone diagnostics reject stale, mismatched, malformed and oversized records',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-mic-stale-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'mic-install-stage.json');
 const write=value=>fs.writeFileSync(file,JSON.stringify(value));
 write({stage:'Brand:SetValue',hresult:'0x80070005',at:1000});
 assert.equal(Setup.formatExitResult({code:-2147024891},dir,1001).stage,'unknown');
 assert.equal(Setup.formatExitResult({code:-2147024891},dir,1000).stage,'Brand:SetValue');
 assert.equal(Setup.formatExitResult({code:1},dir).stage,'unknown');
 write({stage:'injected\ntext',hresult:'0x80070005',at:Date.now()});assert.equal(Setup.readDiagnosticStage(dir),null);
 write({stage:'Brand:SetValue',hresult:'0x80070005',at:Date.now(),padding:'x'.repeat(17000)});assert.equal(Setup.readDiagnosticStage(dir),null);
});

test('helper success without a ready endpoint is a verification failure, not an invented reboot',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-mic-unverified-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const setup=new AutoSetup({appDataDir:dir,micSetup:{file:path.join(dir,'helper.exe'),install:async()=>({success:true,code:'0'})},queryStatus:async()=>({installed:true,ready:false})});
 const result=await setup.retry();assert.equal(result.success,false);assert.equal(result.code,'MIC_NOT_READY');assert.equal(result.restartRequired,undefined);assert.equal(result.status.setup.state,'failed');
});

test('automatic startup coordinator skips when ready or in qaMode, runs once when unbranded, persists cancellation/error/restart without nagging, and allows explicit recovery retry',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-auto-mic-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const helperFile=path.join(dir,'MOHIVMicSetup.exe');
 fs.writeFileSync(helperFile,'helper-build-v1');
 let installCalls=0,nextInstall={success:false,cancelled:true,code:'1223',error:'Windows microphone setup was cancelled.'};
 let live={installed:true,ready:false,captureName:'CABLE Output',waveDevice:1};
 const micSetup={file:helperFile,install:async()=>{installCalls++;return nextInstall;}};

 // 1. qaMode skips automatic setup completely, and status() never triggers install
 const qaCoord=new AutoSetup({appDataDir:dir,micSetup,queryStatus:async()=>live,qaMode:true});
 const qaStatus=await qaCoord.ensureReady();
 assert.equal(installCalls,0);
 assert.equal(qaStatus.ready,false);
 assert.equal((await qaCoord.status()).setup.state,'skipped');
 assert.equal(installCalls,0);

 // 2. Ready device skips automatic setup without invoking UAC helper
 live={installed:true,ready:true,captureName:'MOHIV Mic',waveDevice:1};
 const readyDir=path.join(dir,'ready-profile');
 const readyCoord=new AutoSetup({appDataDir:readyDir,micSetup,queryStatus:async()=>live});
 const readyRes=await readyCoord.ensureReady();
 assert.equal(installCalls,0);
 assert.equal(readyRes.ready,true);
 assert.equal(readyRes.setup.state,'ready');

 // 3. Unbranded capture endpoint triggers automatic install once, caches pending promise, and respects cancellation across restarts
 live={installed:true,ready:false,captureName:'CABLE Output',waveDevice:1};
 const states=[];
 const coord=new AutoSetup({appDataDir:dir,micSetup,queryStatus:async()=>live,onChange:s=>states.push(s.setup.state)});
 assert.equal((await coord.status()).setup.state,'pending');
 assert.equal(installCalls,0,'polling status must never trigger UAC');
 const [firstRun,concurrentRun]=await Promise.all([coord.ensureReady(),coord.ensureReady()]);
 assert.equal(installCalls,1);
 assert.equal(firstRun.cancelled,true);
 assert.equal(concurrentRun.cancelled,true);
 assert.equal((await coord.status()).setup.state,'cancelled');
 assert.ok(states.includes('installing')&&states.at(-1)==='cancelled');

 // Subsequent startup with same helper fingerprint must not prompt UAC again
 const restartCoord=new AutoSetup({appDataDir:dir,micSetup,queryStatus:async()=>live});
 await restartCoord.ensureReady();
 assert.equal(installCalls,1,'must not nag after cancellation');
 assert.equal((await restartCoord.status()).setup.state,'cancelled');

 // 4. Error-recovery retry records diagnostic HRESULT and persists failure without nagging on next startup
 nextInstall={success:false,code:'0x80070005',error:'Administrator access was denied while configuring MOHIV Mic (0x80070005).'};
 const failedRetry=await restartCoord.retry();
 assert.equal(installCalls,2);
 assert.equal(failedRetry.code,'0x80070005');
 assert.equal((await restartCoord.status()).setup.state,'failed');
 assert.equal((await restartCoord.status()).setup.code,'0x80070005');
 await restartCoord.ensureReady();
 assert.equal(installCalls,2,'must not nag after persisted failure');

 // 5. Retry returning 3010 (or 0 while endpoint not yet branded) persists restart-required, then transitions to ready after reboot
 nextInstall={success:true,restartRequired:true,code:'3010'};
 const restartRetry=await restartCoord.retry();
 assert.equal(installCalls,3);
 assert.equal(restartRetry.restartRequired,true);
 assert.equal((await restartCoord.status()).setup.state,'restart-required');
 assert.equal((await restartCoord.status()).ready,false);
 live={installed:true,ready:true,captureName:'MOHIV Mic',waveDevice:1};
 const afterReboot=await restartCoord.status();
 assert.equal(afterReboot.ready,true);
 assert.equal(afterReboot.setup.state,'ready');

 // 6. Installer cancellation marker prevents immediate second UAC on first app launch
 const instProfile=path.join(dir,'inst-profile'),instDir=path.join(dir,'inst-bin');
 fs.mkdirSync(instDir,{recursive:true});
 fs.writeFileSync(path.join(instDir,'installer-mic-status.txt'),'cancelled:1223');
 live={installed:false,ready:false};
 const fromInstaller=new AutoSetup({appDataDir:instProfile,micSetup,queryStatus:async()=>live,installDir:instDir});
 await fromInstaller.ensureReady();
 assert.equal(installCalls,3,'installer cancellation marker must suppress immediate second UAC');
 assert.equal((await fromInstaller.status()).setup.state,'cancelled');
});

test('pure native endpoint classification, quoting, exit HRESULT mapping, bundle tamper verification, safe leaf replacement and speaker-fallback guards',{skip:process.platform!=='win32'},()=>{
 const root=path.resolve(__dirname,'..'),nativeDir=path.join(root,'native'),bundleDir=path.join(root,'drivers','mohiv-mic','VB-CABLE');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-mic-native-'));
 try{
  const harness=path.join(dir,'Harness.cs'),exe=path.join(dir,'Harness.exe');
  fs.writeFileSync(harness,`using System;using System.IO;using System.ComponentModel;using System.Runtime.InteropServices;namespace MohivxPhone{static class MicNativeHarness{
   [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool CreateHardLinkW(string fileName,string existingFileName,IntPtr reserved);
   static void Check(bool ok,string msg){if(!ok)throw new Exception(msg);}
   static void Throws(Action fn,string part){try{fn();}catch(Exception e){if(e.Message.IndexOf(part,StringComparison.OrdinalIgnoreCase)>=0)return;throw new Exception("Unexpected error: "+e.Message);}throw new Exception("Expected error containing: "+part);}
   static void Throws<T>(Action fn)where T:Exception{try{fn();}catch(T){return;}catch(Exception e){throw new Exception("Unexpected error: "+e.GetType().FullName+": "+e.Message);}throw new Exception("Expected "+typeof(T).FullName);}
   static int Main(string[] args){
    string bundle=args[0],work=args[1];
    Check(MicEndpoints.Standard(new MicEndpoint{Adapter="VB-Audio Virtual Cable"}),"standard adapter");
    Check(MicEndpoints.Standard(new MicEndpoint{Adapter="vb-audio virtual cable"}),"standard adapter case-insensitive");
    foreach(string bad in new[]{null,"","Realtek High Definition Audio","Microphone Array","Speakers","VB-Audio Cable A","VB-Audio Cable B","VB-Audio Cable C","VB-Audio Cable D","VB-Audio Virtual Cable A","VB-Audio Hi-Fi Cable"})
     Check(!MicEndpoints.Standard(new MicEndpoint{Adapter=bad}),"must exclude "+bad);
    Check(!MicEndpoints.Standard(null),"null endpoint");
    Check(!MicEndpoints.CanRename(new MicEndpoint{Id="physical",Adapter="Realtek(R) Audio",Flow=1,Active=true}),"rename excludes physical microphones");
    Check(!MicEndpoints.CanRename(new MicEndpoint{Id="render",Adapter="VB-Audio Virtual Cable",Flow=0,Active=true}),"rename excludes virtual render endpoint");
    Check(!MicEndpoints.CanRename(new MicEndpoint{Id="disabled",Adapter="VB-Audio Virtual Cable",Flow=1,Active=false}),"rename excludes disabled endpoint");
    Check(MicEndpoints.CanRename(new MicEndpoint{Id="capture",Adapter="VB-Audio Virtual Cable",Flow=1,Active=true}),"rename permits exact active standard capture");
    var nonStandard=new[]{
     new MicEndpoint{Id="phys-in",Name="Microphone Array",Adapter="Realtek(R) Audio",Flow=1,Active=true},
     new MicEndpoint{Id="phys-out",Name="Speakers",Adapter="Realtek(R) Audio",Flow=0,Active=true},
     new MicEndpoint{Id="cable-a-in",Name="CABLE-A Output",Adapter="VB-Audio Cable A",Flow=1,Active=true},
     new MicEndpoint{Id="cable-a-out",Name="CABLE-A Input",Adapter="VB-Audio Cable A",Flow=0,Active=true},
     new MicEndpoint{Id="cable-b-in",Name="CABLE-B Output",Adapter="VB-Audio Cable B",Flow=1,Active=true},
     new MicEndpoint{Id="cable-c-in",Name="CABLE-C Output",Adapter="VB-Audio Cable C",Flow=1,Active=true},
     new MicEndpoint{Id="cable-d-out",Name="CABLE-D Input",Adapter="VB-Audio Cable D",Flow=0,Active=true}
    };
    Check(MicEndpoints.Capture(nonStandard)==null,"no capture in physical/CableA-D");
    Check(MicEndpoints.Render(nonStandard)==null,"no render in physical/CableA-D");
    var mixed=new[]{
     nonStandard[0],nonStandard[1],nonStandard[2],nonStandard[3],nonStandard[4],nonStandard[5],nonStandard[6],
     new MicEndpoint{Id="std-in",Name="MOHIV Mic",Adapter="VB-Audio Virtual Cable",Flow=1,Active=true},
     new MicEndpoint{Id="std-out",Name="CABLE Input",Adapter="VB-Audio Virtual Cable",Flow=0,Active=true}
    };
    Check(MicEndpoints.Capture(mixed).Id=="std-in","exact standard capture");
    Check(MicEndpoints.Render(mixed).Id=="std-out","exact standard render");
    Throws(()=>MicEndpoints.AutomaticDevice(nonStandard,_=>0),"not ready");
    Throws(()=>MicEndpoints.AutomaticDevice(new[]{new MicEndpoint{Id="std-in",Name="CABLE Output",Adapter="VB-Audio Virtual Cable",Flow=1,Active=true},mixed[8]},_=>0),"not ready");
    Throws(()=>MicEndpoints.AutomaticDevice(new[]{new MicEndpoint{Id="std-in",Name="MOHIV Mic",Adapter="VB-Audio Virtual Cable",Flow=1,Active=false},mixed[8]},_=>0),"not ready");
    Throws(()=>MicEndpoints.AutomaticDevice(new[]{mixed[7],new MicEndpoint{Id="std-out",Name="CABLE Input",Adapter="VB-Audio Virtual Cable",Flow=0,Active=false}},_=>0),"not ready");
    Throws(()=>MicEndpoints.AutomaticDevice(mixed,_=>-1),"unavailable");
    Check(MicEndpoints.AutomaticDevice(mixed,id=>id=="std-out"?4:-1)==4,"automatic device selects exact standard render wave index");
    var synthesized=new MicEndpoint{Id="std-in",Name="MOHIV Mic (VB-Audio Virtual Cable)",Description="MOHIV Mic",Adapter="VB-Audio Virtual Cable",Flow=1,Active=true};
    Check(MicEndpoints.AutomaticDevice(new[]{synthesized,mixed[8]},_=>4)==4,"Windows synthesized full name accepts the verified short label");
    synthesized.Description="CABLE Output";
    Throws(()=>MicEndpoints.AutomaticDevice(new[]{synthesized,mixed[8]},_=>4),"not ready");
    Check(!MicEndpoints.Branded(new MicEndpoint{Name="MOHIV Mic",Description="MOHIV Mic",Adapter="Realtek(R) Audio"}),"a physical microphone with the same label is never our route");
    Check(!PhoneAudio.Virtual(null)&&!PhoneAudio.Virtual("")&&!PhoneAudio.Virtual("Speakers (Realtek High Definition Audio)")&&!PhoneAudio.Virtual("Headphones")&&!PhoneAudio.Virtual("Default Output"),"speakers rejected");
    Check(PhoneAudio.Virtual("CABLE Input (VB-Audio Virtual Cable)"),"virtual cable accepted");
    using(var audio=new PhoneAudio()){
     Throws(()=>audio.Write(-1,16000,"AAAA"),"Invalid virtual audio route");
     Throws(()=>audio.Write(99999,16000,"AAAA"),"Invalid virtual audio route");
     if(!MicEndpoints.Ready())Throws(()=>audio.AutomaticWrite(16000,"AAAA"),"MOHIV Mic");
    }
    Check(MicSetup.ExitCode(new Win32Exception(1223))==1223,"UAC cancel exit code");
    Check(MicSetup.ExitCode(new Win32Exception(5))==unchecked((int)0x80070005),"Win32 access denied -> HRESULT");
    Check(MicSetup.ExitCode(new Win32Exception(1167))==unchecked((int)0x8007048F),"Win32 device disabled -> HRESULT");
    Check(MicSetup.ExitCode(new Win32Exception(unchecked((int)0xE0000247)))==unchecked((int)0xE0000247),"SetupAPI HRESULT preserved");
    Check(MicSetup.ExitCode(new COMException("COM denied",unchecked((int)0x80070005)))==unchecked((int)0x80070005),"COMException HRESULT preserved");
    Check(MicSetup.Quote("C:\\\\Program Files\\\\MOHIVX-Microphone\\\\MOHIVMicSetup.exe")=="\\"C:\\\\Program Files\\\\MOHIVX-Microphone\\\\MOHIVMicSetup.exe\\"","quote spaces");
    Check(MicSetup.Quote("a\\"b")=="\\"a\\\\\\"b\\"","quote embedded quote");
    Check(MicSetup.Quote("a\\\\\\"b")=="\\"a\\\\\\\\\\\\\\"b\\"","quote backslash before quote");
    Check(MicSetup.Quote("C:\\\\dir\\\\")=="\\"C:\\\\dir\\\\\\\\\\"","quote trailing backslash");
    Check(MicSetup.Quote("C:\\\\dir\\\\\\\\")=="\\"C:\\\\dir\\\\\\\\\\\\\\\\\\"","quote double trailing backslash");
    Throws(()=>MicSetup.Quote("bad\\0arg"),"Invalid argument");
    MicSetup.Verify(bundle);
    string tampered=Path.Combine(work,"tampered");Directory.CreateDirectory(tampered);
    foreach(string file in Directory.GetFiles(bundle))File.Copy(file,Path.Combine(tampered,Path.GetFileName(file)));
    string target=Path.Combine(tampered,"vbMmeCable64_win10.inf");byte[] bytes=File.ReadAllBytes(target);bytes[0]^=1;File.WriteAllBytes(target,bytes);
    Throws(()=>MicSetup.Verify(tampered),"damaged");
    File.Delete(target);
    Throws<FileNotFoundException>(()=>MicSetup.Verify(tampered));
    string stage=Path.Combine(work,"stage"),source=Path.Combine(work,"source.exe"),victim=Path.Combine(work,"victim.txt"),leaf=Path.Combine(stage,"MOHIVMicSetup.exe");
    Directory.CreateDirectory(stage);File.WriteAllText(source,"trusted-helper");File.WriteAllText(victim,"untrusted-leaf");
    File.Copy(victim,leaf);File.SetAttributes(leaf,FileAttributes.ReadOnly);
    Throws<UnauthorizedAccessException>(()=>MicSetup.ReplaceHelper(source,stage));
    Check((File.GetAttributes(leaf)&FileAttributes.ReadOnly)!=0&&File.ReadAllText(leaf)=="untrusted-leaf","readonly helper must not be modified");
    File.SetAttributes(leaf,FileAttributes.Normal);
    Check(MicSetup.ReplaceHelper(source,stage)==leaf,"replace helper path");
    Check(File.ReadAllText(leaf)=="trusted-helper","helper replaced with trusted content");
    File.Delete(leaf);File.SetAttributes(victim,FileAttributes.Archive);byte[] victimBytes=File.ReadAllBytes(victim);FileAttributes victimAttrs=File.GetAttributes(victim);
    Check(CreateHardLinkW(leaf,victim,IntPtr.Zero),"create hardlink");
    Check(MicSetup.ReplaceHelper(source,stage)==leaf,"replace hardlinked helper");
    Check(BitConverter.ToString(File.ReadAllBytes(victim))==BitConverter.ToString(victimBytes)&&File.GetAttributes(victim)==victimAttrs,"hardlink target bytes and attributes must not be modified");
    Check(File.ReadAllText(leaf)=="trusted-helper","new helper content intact");
    File.Delete(leaf);Directory.CreateDirectory(leaf);
    Throws(()=>MicSetup.ReplaceHelper(source,stage),"redirected");
    MicDiagnostics.FileOverride=Path.Combine(work,"mic-install-stage.json");
    MicSetup.LogStage("Harness:Test",0,"stage_logged_ok");
    var diagResult=MicSetup.ReadLastStage();
    Check(diagResult!=null&&diagResult.stage=="Harness:Test","stage persistence verified");
    Check(diagResult.at>0,"stage timestamps use Unix milliseconds");
    string escaped="quote:"+Convert.ToChar(34)+" newline:"+Convert.ToChar(10)+" slash:"+Convert.ToChar(92);
    MicSetup.LogStage("Harness:Escaping",0,escaped);
    Check(MicSetup.ReadLastStage().message==escaped,"diagnostic JSON escaping");
    try{MicDiagnostics.CheckHr(unchecked((int)0x80070005),"Brand:SetValue");}catch(Exception error){MicDiagnostics.Exception("Outer:Handler",error);}
    diagResult=MicSetup.ReadLastStage();
    Check(diagResult.stage=="Brand:SetValue"&&diagResult.hresult=="0x80070005","outer handlers preserve the exact failing native call");
    Console.WriteLine("NATIVE_MIC_HARNESS_OK");return 0;
   }
  }}`);
  const csc=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  execFileSync(csc,['/nologo','/platform:x64','/main:MohivxPhone.MicNativeHarness','/r:System.Web.Extensions.dll','/out:'+exe,harness,path.join(nativeDir,'MicEndpoints.cs'),path.join(nativeDir,'MicDiagnostics.cs'),path.join(nativeDir,'MicSetup.cs'),path.join(nativeDir,'MicVendorLock.cs'),path.join(nativeDir,'PhoneAudio.cs')],{windowsHide:true});
  const output=execFileSync(exe,[bundleDir,dir],{windowsHide:true,encoding:'utf8'});
  assert.match(output,/NATIVE_MIC_HARNESS_OK/);
  const setupExe=path.join(root,'drivers','mohiv-mic','MOHIVMicSetup.exe');
  if(fs.existsSync(setupExe)){
   assert.deepEqual(JSON.parse(execFileSync(setupExe,['--verify-bundle'],{windowsHide:true,encoding:'utf8'})),{success:true});
   const status=JSON.parse(execFileSync(setupExe,['--status'],{windowsHide:true,encoding:'utf8'}));
   assert.equal(status.success,true);assert.equal(status.name,'MOHIV Mic');assert.equal(typeof status.installed,'boolean');assert.equal(typeof status.ready,'boolean');
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
