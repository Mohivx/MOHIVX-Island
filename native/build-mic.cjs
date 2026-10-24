// Builds files only. Never installs or renames a Windows audio device.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'drivers','mohiv-mic'),lock=JSON.parse(fs.readFileSync(path.join(out,'vendor-lock.json'),'utf8'));
for(const [name,expected] of Object.entries(lock.files)){const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'VB-CABLE',name))).digest('hex');if(actual!==expected)throw Error('Vendor payload hash mismatch: '+name);}
if(process.platform!=='win32')throw Error('Build MOHIV Mic on Windows.');
const csc=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
for(const [target,file,sources,refs] of [
 ['winexe',path.join(out,'MOHIVMicSetup.exe'),['MicSetup.cs','MicEndpoints.cs','MicDiagnostics.cs','MicVendorLock.cs'],['System.Web.Extensions.dll']],
 ['exe',path.join(root,'bin','mohivx-phone.exe'),['PhoneHost.cs','PhoneAudio.cs','MicEndpoints.cs','MicDiagnostics.cs'],['System.Web.Extensions.dll','System.Drawing.dll']]
]){const result=spawnSync(csc,['/nologo','/optimize+','/platform:x64','/target:'+target,'/out:'+file,...refs.map(r=>'/r:'+r),...sources.map(s=>path.join(__dirname,s))],{stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status||1);}
const result=JSON.parse(execFileSync(path.join(out,'MOHIVMicSetup.exe'),['--verify-bundle'],{windowsHide:true,encoding:'utf8'}));if(result.success!==true)throw Error('Native payload verification failed.');
console.log('MOHIV Mic and phone host built; original vendor payload verified. No devices changed.');
