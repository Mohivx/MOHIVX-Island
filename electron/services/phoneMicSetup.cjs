const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process');
const KNOWN_ERRORS={
 '0x80070005':'Administrator access was denied while configuring MOHIV Mic (0x80070005).',
 '0x8007048F':'The virtual microphone is disabled in Windows Sound settings. Enable it and retry (0x8007048F).',
 '0x8007000D':'The bundled audio component could not be verified. Reinstall MOHIVX (0x8007000D).',
 '0x80070002':'The bundled microphone setup files are missing. Reinstall MOHIVX (0x80070002).',
 '0x800705B4':'Windows microphone setup timed out (0x800705B4).',
 'ENOENT':'The bundled microphone setup helper is unavailable (ENOENT).'
};
function readDiagnosticStage(appDataDir){
 try{
  const targetDir=appDataDir||path.join(os.homedir(),'.mohivx-island');
  const stageFile=path.join(targetDir,'mic-install-stage.json');
  if(fs.existsSync(stageFile)&&fs.statSync(stageFile).size<=16384){
   const parsed=JSON.parse(fs.readFileSync(stageFile,'utf8'));
   if(parsed&&typeof parsed==='object'&&/^[A-Za-z0-9:_-]{1,80}$/.test(parsed.stage)&&/^0x[0-9a-f]{8}$/i.test(parsed.hresult)&&Number.isFinite(parsed.at))return {stage:parsed.stage,hresult:parsed.hresult.toUpperCase().replace('0X','0x'),at:parsed.at};
  }
 }catch{}
 return null;
}
function normalizeCode(raw){
 if(raw===0||raw==='0'||raw===null||raw===undefined)return '0';
 if(typeof raw==='number'&&Number.isFinite(raw)){
  const n=Math.trunc(raw),u=n>>>0;
  if(u===0)return '0';
  if(u===3010)return '3010';
  if(u===1223||(u&0xFFFF)===1223&&u===(0x80070000|1223)>>>0)return '1223';
  if(n<0||u>=0x10000)return '0x'+u.toString(16).toUpperCase().padStart(8,'0');
  return String(u);
 }
 const text=String(raw).trim();
 if(/^-?\d+$/.test(text))return normalizeCode(Number(text));
 if(/^0x[0-9a-fA-F]{1,8}$/.test(text))return '0x'+text.slice(2).toUpperCase().padStart(8,'0');
 const safe=text.replace(/[^A-Za-z0-9_.-]/g,'').slice(0,16);
 return safe||'1';
}
function formatExitResult(error,appDataDir,after=0){
 const code=error?normalizeCode(error.code??1):'0';
 const candidate=readDiagnosticStage(appDataDir);
 const diag=candidate&&candidate.at>=after&&normalizeCode(candidate.hresult)===code?candidate:null;
 if(!error&&code==='0')return {success:true,code:'0',stage:diag?.stage||'ready'};
 if(code==='3010')return {success:true,restartRequired:true,code:'3010',stage:diag?.stage||'restart-required'};
 if(code==='1223')return {success:false,cancelled:true,code:'1223',error:'Windows microphone setup was cancelled.',stage:diag?.stage||'cancelled'};
 let detail=KNOWN_ERRORS[code]||`Windows could not finish MOHIV Mic setup (code ${code}).`;
 if(diag&&diag.stage){
  detail+=` [Stage: ${diag.stage}]`;
 }
 return {success:false,code,error:detail,stage:diag?.stage||'unknown',stageHresult:diag?.hresult||code};
}
class PhoneMicSetup {
 constructor(file,execute=execFile,appDataDir=null){this.file=file;this.execute=execute;this.appDataDir=appDataDir;this.pending=null;}
 install(){
  if(this.pending)return this.pending;
  const startedAt=Date.now();
  this.pending=new Promise(resolve=>this.execute(this.file,['--install'],{windowsHide:true,timeout:300000},error=>resolve(formatExitResult(error,this.appDataDir,startedAt)))).finally(()=>this.pending=null);
  return this.pending;
 }
}
PhoneMicSetup.normalizeCode=normalizeCode;
PhoneMicSetup.formatExitResult=formatExitResult;
PhoneMicSetup.readDiagnosticStage=readDiagnosticStage;
module.exports=PhoneMicSetup;
