const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
class AcpClient extends EventEmitter {
  constructor(executable, cwd, launcher = spawn) { super(); this.executable = executable; this.cwd = cwd; this.launcher = launcher; this.pending = new Map(); this.permissions = new Map(); this.events = []; this.sequence = 0; this.proc = null; this.busy = false; this.sessionId = null; }
  event(type, detail) { this.events.unshift({ type, detail: String(detail).slice(0,2000), at: Date.now() }); this.events = this.events.slice(0,100); this.emit('change', this.status()); }
  status() { return { connected: Boolean(this.proc), busy:this.busy, sessionId:this.sessionId, events:this.events, pendingApprovals:[...this.permissions.values()].map(({ timer, ...p }) => p) }; }
  send(value) { if (!this.proc?.stdin.writable) throw new Error('Hermes connection closed.'); this.proc.stdin.write(JSON.stringify({jsonrpc:'2.0',...value})+'\n'); }
  request(method, params, timeout = 120000) { return new Promise((resolve,reject) => { const id = ++this.sequence; const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Hermes request timed out.')); },timeout); this.pending.set(id,{resolve,reject,timer}); try { this.send({id,method,params}); } catch(e) { clearTimeout(timer); this.pending.delete(id); reject(e); } }); }
  receive(message) {
    if (message.id !== undefined && !message.method) { const p = this.pending.get(message.id); if (p) { this.pending.delete(message.id); clearTimeout(p.timer); message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result); } return; }
    if (message.method === 'session/update') {
      const u = message.params?.update || {};
      if (u.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') { this.answer += u.content.text; }
      else if (u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update') this.event(u.status || 'tool',u.title || u.toolCallId || 'Hermes');
      return;
    }
    if (message.method === 'session/request_permission' && message.id !== undefined) {
      const id = String(message.id), p = message.params || {};
      const timer = setTimeout(() => this.decide(id,null), 300000);
      this.permissions.set(id,{id, wireId:message.id, title:String(p.toolCall?.title || 'Hermes permission'), options:(p.options || []).map(o => ({ optionId:o.optionId,kind:o.kind,name:o.name })), timer}); this.event('permission',p.toolCall?.title || 'Hermes permission'); return;
    }
    if (message.id !== undefined) this.send({id:message.id,error:{code:-32601,message:'Client capability is not supported.'}});
  }
  async connect() {
    if (this.sessionId && this.proc) return;
    const proc = this.launcher(this.executable,[],{cwd:this.cwd,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}}); this.proc = proc;
    let buffer = ''; proc.stdout.on('data', chunk => { buffer += chunk.toString('utf8'); if (buffer.length > 4*1024*1024) { this.close(); return; } let i; while ((i=buffer.indexOf('\n')) >= 0) { const line=buffer.slice(0,i); buffer=buffer.slice(i+1); try { this.receive(JSON.parse(line)); } catch {} } });
    proc.stderr.on('data', () => {}); // Do not expose environment/provider diagnostics that may contain secrets.
    const end = () => { if (this.proc !== proc) return; this.proc=null; this.sessionId=null; this.busy=false; for (const p of this.pending.values()) {clearTimeout(p.timer);p.reject(new Error('Hermes process ended.'));} this.pending.clear(); for (const p of this.permissions.values()) clearTimeout(p.timer); this.permissions.clear(); this.event('closed','Hermes'); };
    proc.on('error',end); proc.on('exit',end);
    try {
      await this.request('initialize',{protocolVersion:1,clientInfo:{name:'mohivx-island',version:'1.1.1'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}},30000);
      const session = await this.request('session/new',{cwd:this.cwd,mcpServers:[]},60000); this.sessionId=session.sessionId; this.event('connected','Hermes ACP');
    } catch(e) { this.close(); throw e; }
  }
  decide(id, optionId) {
    const p=this.permissions.get(String(id)); if (!p) return {success:false,error:'Permission expired.'};
    if (optionId !== null && !p.options.some(o=>o.optionId===optionId)) return {success:false,error:'Unknown permission option.'};
    clearTimeout(p.timer); this.permissions.delete(String(id)); this.send({id:p.wireId,result:{outcome:optionId===null?{outcome:'cancelled'}:{outcome:'selected',optionId}}}); this.event('decision',optionId || 'cancelled'); return {success:true};
  }
  async prompt(text) {
    if (this.busy) return {success:false,error:'Hermes is already working.'}; this.busy=true; this.answer='';
    try { await this.connect(); this.event('working','Hermes'); await this.request('session/prompt',{sessionId:this.sessionId,prompt:[{type:'text',text:String(text).slice(0,30000)}]},300000); this.event('completed','Hermes'); return {success:true,response:this.answer.trim()}; }
    catch(e) { this.event('error',e.message); this.cancel(); return {success:false,error:e.message}; }
    finally { this.busy=false; this.emit('change',this.status()); }
  }
  cancel() { if (this.proc && this.sessionId) this.send({method:'session/cancel',params:{sessionId:this.sessionId}}); for (const id of [...this.permissions.keys()]) this.decide(id,null); }
  close() { try { this.cancel(); } catch {} this.proc?.kill(); this.sessionId=null; }
}
module.exports = { AcpClient };
