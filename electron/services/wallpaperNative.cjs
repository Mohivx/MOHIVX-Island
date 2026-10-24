const {spawn}=require('node:child_process');const fs=require('node:fs');
class WallpaperNative{
  constructor(exe,options={}){this.exe=exe;this.spawn=options.spawn||spawn;this.pending=new Map();this.sequence=0;this.child=null;}
  start(){
    if(this.child)return;if(!fs.existsSync(this.exe))throw Error('Native wallpaper helper unavailable.');
    const child=this.spawn(this.exe,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;let buffered='';
    const fail=()=>{if(this.child===child)this.child=null;for(const [id,p] of this.pending){clearTimeout(p.timer);p.reject(Error('Wallpaper helper disconnected.'));this.pending.delete(id);}};
    child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail);child.stderr.on('data',()=>{});
    child.stdout.on('data',data=>{buffered+=data.toString();if(buffered.length>65536){child.kill();return;}let end;while((end=buffered.indexOf('\n'))>=0){const line=buffered.slice(0,end);buffered=buffered.slice(end+1);try{const value=JSON.parse(line),p=this.pending.get(value.id);if(p){this.pending.delete(value.id);clearTimeout(p.timer);p.resolve(value);}}catch{}}});
  }
  request(action,input={}){this.start();const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);this.child?.kill();reject(Error('Wallpaper operation timed out.'));},15000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,action,...input})+'\n');});}
  stop(){this.child?.stdin.end();}
}
module.exports=WallpaperNative;
