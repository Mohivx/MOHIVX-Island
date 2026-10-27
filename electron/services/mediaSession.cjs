const EMPTY = {title:'',artist:'',isPlaying:false,playbackStatus:'None',position:0,duration:0,artwork:'',sourceApp:''};
function parseMedia(stdout) {
  try {
    const value=JSON.parse(String(stdout).trim());
    if(!value||typeof value.title!=='string'||!value.title.trim())return {...EMPTY};
    const seconds=v=>Math.max(0,Number.isFinite(Number(v))?Number(v):0);
    const validStatuses=['Playing','Paused','Stopped','Closed','Changing'];
    const playbackStatus=validStatuses.includes(value.playbackStatus)?value.playbackStatus:(value.isPlaying===true?'Playing':'Paused');
    return {title:value.title.slice(0,1000),artist:String(value.artist||'Windows Media').slice(0,500),isPlaying:playbackStatus==='Playing',playbackStatus,position:seconds(value.position),duration:seconds(value.duration),sourceApp:String(value.sourceApp||'').slice(0,256),artwork:typeof value.artwork==='string'&&value.artwork.length<360000&&/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value.artwork)?value.artwork:''};
  }catch{return {...EMPTY};}
}
// Share one native query across renderers, and refresh immediately after a user command.
function createMediaQuery(read,{now=Date.now,ttl=1800}={}) {
  let pending=null,value={...EMPTY},at=-Infinity;
  const query=async({force=false}={})=>{
    if(pending)return pending;
    if(!force&&now()-at<ttl)return {...value};
    pending=Promise.resolve().then(read).then(out=>{value=parseMedia(out);at=now();return {...value};}).catch(()=>({...EMPTY})).finally(()=>{pending=null;});
    return pending;
  };
  query.refresh=async()=>{
    if(pending)await pending.catch(()=>{});
    at=-Infinity;
    return query({force:true});
  };
  return query;
}
module.exports={parseMedia,createMediaQuery};
