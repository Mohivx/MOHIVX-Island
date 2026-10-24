const {spawn}=require('node:child_process');
function normalizeMeter(value){if(!value||value.available!==true)return {available:false,peak:0,left:0,right:0};const clip=x=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;return {available:true,peak:clip(value.peak),left:clip(value.left),right:clip(value.right)};}
class AudioMeter {
 constructor(file,onLevel){this.file=file;this.onLevel=onLevel;this.child=null;this.closed=false;this.retry=null;}
 start(){if(this.closed||this.child)return;const child=this.child=spawn(this.file,[],{windowsHide:true,stdio:['ignore','pipe','ignore']});let buffer='';child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>8192){buffer='';return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);try{this.onLevel(normalizeMeter(JSON.parse(line)));}catch{}}});const done=()=>{if(this.child!==child)return;this.child=null;this.onLevel(normalizeMeter(null));if(!this.closed)this.retry=setTimeout(()=>this.start(),5000);};child.once('error',done);child.once('exit',done);}
 stop(){this.closed=true;clearTimeout(this.retry);this.child?.kill();this.child=null;}
}
module.exports={AudioMeter,normalizeMeter};
