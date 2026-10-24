const net=require('node:net'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {agentName,agentColor,validateAgent,APPROVAL_AGENTS}=require('../vendor/coucou/agents.cjs');
const {buildFileDiff,toOneLine}=require('../vendor/coucou/diff.cjs');
const text=(value,max=2000)=>typeof value==='string'?value.slice(0,max):'';
const equal=(a,b)=>/^[a-f0-9]{64}$/.test(a||'')&&/^[a-f0-9]{64}$/.test(b||'')&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
class AgentHooks {
  constructor(dir,options={}){
    this.dir=dir;this.options=options;this.sessions=new Map();this.pending=new Map();this.sockets=new Set();this.events=[];this.server=null;this.error='';this.now=options.now||Date.now;this.onChange=options.onChange||(()=>{});
    this.exe=options.exe||path.join(dir,'bin','mohivx-hook.exe');
  }
  async start(){
    if(this.server)return this.snapshot();
    const link=path.join(this.dir,'bin','hook-link.json');fs.mkdirSync(path.dirname(link),{recursive:true});
    try{this.token=JSON.parse(fs.readFileSync(link,'utf8')).token;}catch{}
    if(!/^[a-f0-9]{64}$/.test(this.token||''))this.token=crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(link,JSON.stringify({token:this.token}),{mode:0o600});
    const endpoint=this.options.endpoint||await new Promise((resolve,reject)=>execFile(this.exe,['--pipe-name'],{windowsHide:true,timeout:5000},(error,out)=>error?reject(error):resolve(out.trim())));
    const server=net.createServer(socket=>this.accept(socket));
    server.maxConnections=32;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,resolve);});
    this.server=server;this.endpoint=endpoint;this.error='';server.on('error',e=>{this.error=e.code||'Listener unavailable';});return this.snapshot();
  }
  stop(){for(const socket of this.sockets)socket.destroy();for(const p of this.pending.values())clearTimeout(p.timer);this.pending.clear();this.server?.close();this.server=null;}
  accept(socket){
    this.sockets.add(socket);let bytes=Buffer.alloc(0),received=false;socket.setTimeout(5000,()=>socket.destroy());
    socket.on('error',()=>{});socket.on('close',()=>{this.sockets.delete(socket);for(const [id,p] of this.pending)if(p.socket===socket)this.removePending(id,'disconnected');});
    socket.on('data',chunk=>{
      if(received)return;bytes=Buffer.concat([bytes,chunk]);if(bytes.length>1024*1024){socket.destroy();return;}
      const end=bytes.indexOf(10);if(end<0)return;received=true;
      try{
        const payload=JSON.parse(bytes.subarray(0,end).toString('utf8'));
        if(!equal(payload.mohivx_token,this.token)){socket.destroy();return;}
        delete payload.mohivx_token;
        const pending=this.ingest(payload,socket);if(!pending)socket.end();
      }catch{socket.destroy();}
    });
  }
  record(type,session,detail){this.events.unshift({at:this.now(),type,agent:session.agent,sessionId:session.id,detail:text(detail,500)});this.events.length=Math.min(this.events.length,100);this.onChange(this.snapshot());}
  ingest(payload,socket){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return false;
    const event=text(payload.hook_event_name,64),agent=text(payload.coucou_agent||'claude',24);
    if(agent!=='claude'&&!validateAgent(agent))return false;
    const externalId=text(payload.session_id,160);if(!externalId)return false;
    const id=agent+':'+externalId;
    if(!this.sessions.has(id)&&this.sessions.size>=32){const oldest=[...this.sessions.values()].filter(s=>![...this.pending.values()].some(p=>p.sessionId===s.id)).sort((a,b)=>a.updatedAt-b.updatedAt)[0];if(!oldest)return false;this.sessions.delete(oldest.id);}
    const session=this.sessions.get(id)||{id,agent,name:agent==='claude'?'Claude Code':agentName(agent),color:agent==='claude'?'#D97757':agentColor(agent),project:text(payload.cwd,1000).split(/[\\/]/).filter(Boolean).at(-1)||'',status:'idle',steps:[],diffs:[],updatedAt:this.now()};
    if(agent==='codex'&&payload.mohivx_source==='desktop-question-bridge'){const origin=['codex','gemini','antigravity','claude'].includes(payload.mohivx_question_agent)?payload.mohivx_question_agent:'codex';session.name=(origin==='claude'?'Claude Code':agentName(origin))+' · App';session.color=agentColor(origin);session.source='explicit-question-bridge';}
    this.sessions.set(id,session);session.updatedAt=this.now();
    const tool=text(payload.tool_name,100),input=payload.tool_input&&typeof payload.tool_input==='object'&&!Array.isArray(payload.tool_input)?payload.tool_input:{};
    if(['SessionEnd','Interrupt','UserPromptSubmit','Stop','StopFailure'].includes(event))for(const [request,p] of this.pending)if(p.sessionId===id){this.removePending(request,'superseded');p.socket.end();}
    if(event==='SessionStart')session.status='idle';
    if(['UserPromptSubmit','PreToolUse','PostToolUse','SubagentStart'].includes(event))session.status='working';
    if(event==='Stop')session.status='completed';
    if(['StopFailure','PostToolUseFailure'].includes(event))session.status='error';
    if(['SessionEnd','Interrupt'].includes(event))session.status='idle';
    if(event==='StatusLine'&&payload.rate_limits)session.usage=payload.rate_limits;
    const detail=event==='Stop'?toOneLine(text(payload.last_assistant_message||payload.message,2000)):text(input.command||input.file_path||input.path||payload.message||tool||event,2000);
    session.lastStep=detail;session.steps.unshift({event,tool,detail,at:this.now()});session.steps.length=Math.min(30,session.steps.length);
    if(event==='PostToolUse'){
      const diff=buildFileDiff(tool,input);
      if(diff){session.diffs.unshift({...diff,id:crypto.randomUUID()});session.diffs.length=Math.min(20,session.diffs.length);}
    }
    if(event==='PermissionRequest'&&(payload.mohivx_approval_truncated||Buffer.byteLength(JSON.stringify(input),'utf8')>2000)){session.status='waiting';session.lastStep='Request is too long. Review the complete request in the agent.';this.record('review-in-agent',session,session.lastStep);return false;}
    if(event==='PermissionRequest'&&(agent==='claude'||APPROVAL_AGENTS.has(agent))&&socket){
      if(this.pending.size>=16)return false;
      const requestId='hook:'+crypto.randomUUID(),fingerprint=digest({session:id,tool,input});
      const questions=tool==='AskUserQuestion'&&Array.isArray(input.questions)?input.questions.slice(0,4):null;
      const expires=this.now()+(this.options.expiryMs||125000);
      const p={id:requestId,fingerprint,sessionId:id,agent,bridgeSource:session.source==='explicit-question-bridge'?'desktop-question-bridge':undefined,title:tool||'Permission request',detail:JSON.stringify(input,null,2),questions,expires,socket};
      p.timer=setTimeout(()=>{if(this.pending.has(requestId)){this.removePending(requestId,'expired');socket.end();}},Math.max(1,expires-this.now()));
      this.pending.set(requestId,p);session.status='waiting';socket.setTimeout(Math.max(1,expires-this.now()+1000),()=>socket.destroy());this.record('permission',session,detail);return true;
    }
    this.record(event,session,detail);return false;
  }
  removePending(id,reason){const p=this.pending.get(id);if(!p)return;clearTimeout(p.timer);this.pending.delete(id);const s=this.sessions.get(p.sessionId);if(s){s.status=[...this.pending.values()].some(item=>item.sessionId===s.id)?'waiting':reason==='allow'||reason==='answer'?(s.source==='explicit-question-bridge'?'completed':'working'):'idle';this.record(reason,s,p.title);}}
  decide(id,fingerprint,decision,answers){
    const p=this.pending.get(String(id));
    if(!p||p.socket.destroyed||p.expires<=this.now()){if(p){this.removePending(p.id,'expired');p.socket.end();}return {success:false,error:'Request expired. Review it in the agent.'};}
    if(!equal(fingerprint,p.fingerprint))return {success:false,error:'Request changed. Refresh before deciding.'};
    if(decision==='defer'){this.removePending(p.id,'terminal');p.socket.end();return {success:true};}
    let reply;
    if(decision==='answer'){
      if(!p.questions||!answers||typeof answers!=='object'||Array.isArray(answers))return {success:false,error:'Invalid answers.'};
      const keys=p.questions.map(q=>q.question);
      if(Object.keys(answers).length!==keys.length||keys.some(k=>typeof answers[k]!=='string'||!answers[k].trim()||answers[k].length>2000))return {success:false,error:'Answer each question.'};
      reply=JSON.stringify({answers});
    }else if(decision==='deny'||decision==='allow'&&!p.questions)reply=decision;
    else return {success:false,error:'Unsupported decision.'};
    this.removePending(p.id,decision);p.socket.end(reply+'\n');return {success:true};
  }
  snapshot(){return {enabled:Boolean(this.server?.listening),error:this.error,sessions:[...this.sessions.values()].sort((a,b)=>b.updatedAt-a.updatedAt),pendingApprovals:[...this.pending.values()].filter(p=>p.expires>this.now()&&!p.socket.destroyed).map(({socket,timer,...p})=>({...p,source:'hook',options:p.questions?[]:[{optionId:'allow_once',name:'Allow once'},{optionId:'deny',name:'Deny'}]})),historyEvents:this.events};}
}
module.exports=AgentHooks;
