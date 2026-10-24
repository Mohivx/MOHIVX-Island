const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
class AgentCenterService {
  constructor(log=()=>{}){this.log=log;this.hermes=null;this.hooks=null;this.hookConfig=null;}
  approveAction(id,optionId,fingerprint,answers){if(String(id).startsWith('hook:')){const decision={allow_once:'allow',deny:'deny',answer:'answer',reply_terminal:'defer'}[optionId];if(!decision)return {success:false,error:'Unsupported decision.'};return this.hooks?.decide(id,fingerprint,decision,answers)||{success:false,error:'Local agent connection unavailable.'};}return this.hermes?.client.decide(String(id),optionId)||{success:false,error:'No supported approval connection.'};}
  rejectAction(input){const id=typeof input==='object'?input.id:input;if(String(id).startsWith('hook:'))return this.hooks?.decide(id,input.fingerprint,'deny')||{success:false};return this.hermes?.client.decide(String(id),null)||{success:false,error:'No supported approval connection.'};}
  async getAllStatuses(){
    const home=os.homedir(), entries={antigravity:path.join(home,'.gemini','antigravity','brain'),claude:path.join(home,'.claude'),codex:path.join(home,'.codex')};
    const result={};for(const [name,dir] of Object.entries(entries)){
      let lastActive=null;try{lastActive=fs.statSync(dir).mtimeMs;}catch{}
      result[name]={installed:lastActive!==null,status:lastActive!==null?'Detected':'Not detected',lastActive,readOnly:true,source:'Local directory metadata; live status and approvals unavailable'};
    }
    const h=await this.hermes?.checkStatus();
    const hooks=this.hooks?.snapshot()||{enabled:false,sessions:[],pendingApprovals:[],historyEvents:[]};
    for(const session of hooks.sessions){const status={working:'Working',waiting:'Waiting',completed:'Completed',error:'Error',idle:'Idle'}[session.status];result[session.agent]={...(result[session.agent]||{}),installed:true,status,lastActive:session.updatedAt,readOnly:!['claude','codex','copilot','muse'].includes(session.agent),source:'Live agent hooks'};}
    result.hermes={...h,status:h?.busy?'Working':h?.connected?'Connected':h?.installed?'Ready':'Not detected',source:'Managed ACP session'};
    const historyEvents=[...(h?.events||[]),...hooks.historyEvents].sort((a,b)=>b.at-a.at).slice(0,100);
    return {...result,sessions:hooks.sessions,bridge:{enabled:hooks.enabled,error:hooks.error||'',questionRoute:'explicit-bridge',lastEventAt:hooks.historyEvents[0]?.at||null},hookIntegrations:this.hookConfig?.status()||[],recentEvents:historyEvents.slice(0,20).map(e=>`${e.agent||'Hermes'}: ${e.detail}`),historyEvents,pendingApprovals:[...(h?.pendingApprovals||[]),...hooks.pendingApprovals],timestamp:Date.now()};
  }
}
module.exports=AgentCenterService;
