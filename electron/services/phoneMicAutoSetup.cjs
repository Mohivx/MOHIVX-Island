const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PhoneMicSetup=require('./phoneMicSetup.cjs');

class PhoneMicAutoSetup {
 constructor({appDataDir,micSetup,queryStatus,qaMode=false,installDir=null,onChange=()=>{},now=Date.now}){
  this.appDataDir=appDataDir;
  this.stateFile=path.join(appDataDir,'mohiv-mic-setup.json');
  this.micSetup=micSetup;
  this.queryStatus=queryStatus;
  this.qaMode=Boolean(qaMode);
  this.installDir=installDir;
  this.onChange=onChange;
  this.now=now;
  this.pending=null;
 }
 fingerprint(){
  const file=this.micSetup?.file||'';
  try{
   const bytes=fs.readFileSync(file);
   return crypto.createHash('sha256').update(bytes).digest('hex');
  }catch{
   return 'helper:'+path.basename(String(file||'MOHIVMicSetup.exe'));
  }
 }
 readState(){
  try{
   const raw=JSON.parse(fs.readFileSync(this.stateFile,'utf8'));
   if(raw&&typeof raw==='object'&&!Array.isArray(raw))return raw;
  }catch{}
  return null;
 }
 writeState(next){
  try{
   fs.mkdirSync(this.appDataDir,{recursive:true});
   fs.writeFileSync(this.stateFile,JSON.stringify(next,null,2));
  }catch{}
  return next;
 }
 readInstallerMarker(){
  if(!this.installDir)return null;
  try{
   const markerFile=path.join(this.installDir,'installer-mic-status.txt');
   const text=fs.readFileSync(markerFile,'utf8').trim();
   if(text.length>64)return null;
   const match=/^(ready|restart|cancelled|failed):([A-Za-z0-9_x.-]{1,16})$/.exec(text);
   if(!match)return null;
   const [,kind,rawCode]=match;
   const code=PhoneMicSetup.normalizeCode(rawCode);
   if(kind==='ready')return {raw:text,outcome:'ready',code:'0',error:''};
   if(kind==='restart')return {raw:text,outcome:'restart-required',code:'3010',error:''};
   if(kind==='cancelled')return {raw:text,outcome:'cancelled',code:'1223',error:'Windows microphone setup was cancelled.'};
   const formatted=PhoneMicSetup.formatExitResult({code},this.appDataDir);
   return {raw:text,outcome:'failed',code:formatted.code,error:formatted.error,stage:formatted.stage};
  }catch{
   return null;
  }
 }
 syncStateWithMarker(fp){
  const state=this.readState();
  const marker=this.readInstallerMarker();
  if(marker&&(!state||state.fingerprint!==fp||state.installerMarker!==marker.raw)){
   return this.writeState({
    fingerprint:fp,
    outcome:marker.outcome,
    code:marker.code,
    error:marker.error,
    source:'installer',
    installerMarker:marker.raw,
    updatedAt:this.now()
   });
  }
  return state;
 }
 buildStatus(live,fp,state,ignorePending=false){
  const base={name:'MOHIV Mic',installed:false,ready:false,...(live||{})};
  if(base.ready){
   if(!state||state.fingerprint!==fp||state.outcome!=='ready'){
    this.writeState({fingerprint:fp,outcome:'ready',code:'0',error:'',source:state?.source||'detected',installerMarker:state?.installerMarker,updatedAt:this.now()});
   }
   return {...base,ready:true,setup:{state:'ready',code:'0',error:'',canRetry:false}};
  }
  if(this.pending&&!ignorePending){
   return {...base,ready:false,setup:{state:'installing',code:'',error:'',canRetry:false}};
  }
  if(state&&state.fingerprint===fp){
   if(state.outcome==='restart-required'){
    return {...base,ready:false,setup:{state:'restart-required',code:state.code||'3010',error:'',canRetry:false}};
   }
   if(state.outcome==='cancelled'){
    return {...base,ready:false,setup:{state:'cancelled',code:state.code||'1223',error:state.error||'Windows microphone setup was cancelled.',canRetry:true}};
   }
   if(state.outcome==='failed'){
    return {...base,ready:false,setup:{state:'failed',code:state.code||'1',error:state.error||`Windows could not finish MOHIV Mic setup (code ${state.code||'1'}).`,canRetry:true}};
   }
  }
  return {...base,ready:false,setup:{state:this.qaMode?'skipped':'pending',code:'',error:'',canRetry:true}};
 }
 async status(){
  const fp=this.fingerprint();
  const state=this.syncStateWithMarker(fp);
  const live=await Promise.resolve().then(()=>this.queryStatus()).catch(()=>null);
  return this.buildStatus(live,fp,state);
 }
 async ensureReady(){
  if(this.qaMode)return this.status();
  if(this.pending)return this.pending;
  const fp=this.fingerprint();
  const state=this.syncStateWithMarker(fp);
  const live=await Promise.resolve().then(()=>this.queryStatus()).catch(()=>null);
  if(live?.ready){
   return this.buildStatus(live,fp,state);
  }
  if(state&&state.fingerprint===fp&&['restart-required','cancelled','failed'].includes(state.outcome)){
   return this.buildStatus(live,fp,state);
  }
  return this.runInstall('auto',fp,state?.installerMarker);
 }
 async retry(){
  if(this.qaMode){
   const status=await this.status();
   return {success:false,skipped:true,code:'QA_SKIPPED',ready:Boolean(status.ready),status};
  }
  if(this.pending)return this.pending;
  const fp=this.fingerprint();
  const state=this.syncStateWithMarker(fp);
  const live=await Promise.resolve().then(()=>this.queryStatus()).catch(()=>null);
  if(live?.ready){
   const status=this.buildStatus(live,fp,state);
   this.onChange(status);
   return {success:true,code:'0',ready:true,status};
  }
  return this.runInstall('retry',fp,state?.installerMarker);
 }
 runInstall(source,fp=this.fingerprint(),installerMarker){
  if(this.qaMode){
   return this.status().then(status=>({success:false,skipped:true,code:'QA_SKIPPED',ready:Boolean(status.ready),status}));
  }
  if(this.pending)return this.pending;
  const markerRaw=installerMarker!==undefined?installerMarker:(this.readInstallerMarker()?.raw||this.readState()?.installerMarker);
  let task;
  task=(async()=>{
   const initialLive=await Promise.resolve().then(()=>this.queryStatus()).catch(()=>null);
   this.onChange({name:'MOHIV Mic',installed:false,ready:false,...(initialLive||{}),setup:{state:'installing',code:'',error:'',canRetry:false}});
   const result=await Promise.resolve().then(()=>this.micSetup.install()).catch(err=>{
    const rawCode=err?.code??err?.status??err?.exitCode??1;
    const formatted=PhoneMicSetup.formatExitResult({code:rawCode,message:err?.message},this.appDataDir);
    const msg=typeof err?.message==='string'&&err.message.trim()?err.message.trim():'';
    return {
     success:false,
     code:formatted.code,
     stage:formatted.stage,
     error:msg?(msg.includes(formatted.code)?msg:`${msg} (${formatted.code})`):formatted.error
    };
   });
   const live=await Promise.resolve().then(()=>this.queryStatus()).catch(()=>null);
   let outcome='failed',code=String(result?.code||'1'),error=result?.error||'';
   if(result?.cancelled){
    outcome='cancelled';
    code='1223';
    error=result.error||'Windows microphone setup was cancelled.';
   }else if(result?.success){
    if(!result.restartRequired&&live?.ready){
     outcome='ready';
     code='0';
     error='';
    }else if(result.restartRequired){
     outcome='restart-required';
     code='3010';
     error='';
    }else{
     outcome='failed';
     code='MIC_NOT_READY';
     error='Windows microphone setup finished, but MOHIV Mic could not be verified (MIC_NOT_READY).';
    }
   }else{
    outcome='failed';
    code=PhoneMicSetup.normalizeCode(result?.code??1);
    error=result?.error||PhoneMicSetup.formatExitResult({code},this.appDataDir).error;
   }
   const saved=this.writeState({fingerprint:fp,outcome,code,error,source,installerMarker:markerRaw,updatedAt:this.now()});
   if(this.pending===task)this.pending=null;
   const status=this.buildStatus(live,fp,saved,true);
   this.onChange(status);
   return {
    ...result,
    success:outcome==='ready'||outcome==='restart-required',
    code,
    error:error||undefined,
    restartRequired:outcome==='restart-required'?true:result?.restartRequired,
    ready:Boolean(live?.ready&&outcome==='ready'),
    status
   };
  })().finally(()=>{
   if(this.pending===task)this.pending=null;
  });
  this.pending=task;
  return this.pending;
 }
}

module.exports=PhoneMicAutoSetup;
