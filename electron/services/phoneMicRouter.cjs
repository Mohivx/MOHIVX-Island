class PhoneMicRouter {
 constructor(native,settings,onState=()=>{},now=Date.now){this.native=native;this.settings=settings;this.onState=onState;this.now=now;this.device='';this.busy=false;this.retryAt=0;this.epoch=0;this.state={active:false,device:'',name:'MOHIV Mic',error:''};}
 update(patch){const next={...this.state,...patch};if(JSON.stringify(next)!==JSON.stringify(this.state)){this.state=next;this.onState(this.snapshot());}}
 snapshot(){return {...this.state};}
 stop(){this.epoch++;this.device='';this.retryAt=0;this.update({active:false,device:'',error:'',inputLevel:0,inputPeak:0});return this.native.request('audio-stop').catch(()=>{});}
 frame(frame){
  if(!['mic','all'].includes(frame.kind))return;
  if(frame.stopped){if(this.device===frame.device)void this.stop();return;}
  if(frame.kind!=='mic'||this.settings().phoneMicAuto===false)return;
  if(this.device&&this.device!==frame.device)return;
  this.device=frame.device;this.update({device:frame.device,inputLevel:Number(frame.inputLevel)||0,inputPeak:Number(frame.inputPeak)||0,lastPacketAt:this.now()});if(this.busy||this.now()<this.retryAt)return;
  const epoch=this.epoch;this.busy=true;
  void this.native.request('audio-auto',{rate:frame.rate,data:frame.data}).then(result=>{if(result?.success!==true)throw Error(result?.error||'MOHIV Mic is unavailable.');if(epoch===this.epoch)this.update({active:true,device:frame.device,error:''});}).catch(error=>{if(epoch===this.epoch){this.retryAt=this.now()+2000;this.update({active:false,device:frame.device,error:error.message||'MOHIV Mic is unavailable.'});}}).finally(()=>{this.busy=false;});
 }
}
module.exports=PhoneMicRouter;
