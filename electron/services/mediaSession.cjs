const EMPTY = {title:'',artist:'',isPlaying:false,position:0,duration:0,artwork:'',sourceApp:''};
function parseMedia(stdout) {
  try {
    const value=JSON.parse(String(stdout).trim());
    if(!value||typeof value.title!=='string'||!value.title.trim())return {...EMPTY};
    const seconds=v=>Math.max(0,Number.isFinite(Number(v))?Number(v):0);
    return {title:value.title.slice(0,1000),artist:String(value.artist||'Windows Media').slice(0,500),isPlaying:value.isPlaying===true,position:seconds(value.position),duration:seconds(value.duration),sourceApp:String(value.sourceApp||'').slice(0,256),artwork:typeof value.artwork==='string'&&value.artwork.length<360000&&/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value.artwork)?value.artwork:''};
  }catch{return {...EMPTY};}
}
// Share a single native query across renderers; polling never stacks processes.
function createMediaQuery(read,{now=Date.now,ttl=1800}={}) {
  let pending=null,value={...EMPTY},at=-Infinity;
  return async()=>{
    if(pending)return pending;
    if(now()-at<ttl)return {...value};
    pending=Promise.resolve().then(read).then(out=>{value=parseMedia(out);at=now();return {...value};}).catch(()=>({...value})).finally(()=>{pending=null;});
    return pending;
  };
}
module.exports={parseMedia,createMediaQuery};
