const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const AgentHooks=require('../electron/services/agentHooks.cjs');
async function until(fn){const deadline=Date.now()+5000;while(Date.now()<deadline){const result=fn();if(result)return result;await new Promise(r=>setTimeout(r,10));}throw Error('Hook event did not arrive');}
async function fixture(t,options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-hooks-'));
  const endpoint=process.platform==='win32'?'\\\\.\\pipe\\mohivx-test-'+crypto.randomUUID():path.join(dir,'events.sock');
  const service=new AgentHooks(dir,{endpoint,...options});await service.start();
  t.after(()=>{service.stop();fs.rmSync(dir,{recursive:true,force:true});});return {dir,endpoint,service};
}
function raw(endpoint,payload){const socket=net.connect(endpoint);let output='';socket.setEncoding('utf8');const done=new Promise((resolve,reject)=>{socket.on('data',x=>output+=x);socket.on('end',()=>resolve(output));socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify(payload)+'\n'));});return {socket,done};}
test('authenticated local hooks preserve session state and actual upstream file diffs without exposing secrets',async t=>{
  const {service,endpoint}=await fixture(t);
  await raw(endpoint,{mohivx_token:'0'.repeat(64),hook_event_name:'SessionStart',session_id:'fake'}).done;assert.equal(service.snapshot().sessions.length,0);
  const base={mohivx_token:service.token,coucou_agent:'codex',session_id:'s1',cwd:'E:\\mm'};
  await raw(endpoint,{...base,hook_event_name:'SessionStart'}).done;
  await raw(endpoint,{...base,hook_event_name:'PostToolUse',tool_name:'Edit',tool_input:{file_path:'E:\\mm\\a.ts',old_string:'one\ntwo\n',new_string:'one\nthree\n'}}).done;
  const state=service.snapshot();assert.equal(state.sessions[0].status,'working');assert.equal(state.sessions[0].diffs[0].added,1);assert.equal(state.sessions[0].diffs[0].removed,1);assert.ok(!JSON.stringify(state).includes(service.token));
  await raw(endpoint,{...base,hook_event_name:'Stop',last_assistant_message:'**Finished**'}).done;assert.equal(service.snapshot().sessions[0].status,'completed');
});
test('permission answers require the exact fingerprint, expire, and can only be consumed once',async t=>{
  let now=1000;const {service,endpoint}=await fixture(t,{now:()=>now});
  const payload={mohivx_token:service.token,coucou_agent:'codex',session_id:'approve',hook_event_name:'PermissionRequest',tool_name:'Bash',tool_input:{command:'fixture only'}};
  const first=raw(endpoint,payload);const request=await until(()=>service.snapshot().pendingApprovals[0]);
  assert.deepEqual(JSON.parse(request.detail),payload.tool_input);
  assert.equal(service.decide(request.id,'f'.repeat(64),'allow').success,false);
  assert.equal(service.decide(request.id,'ش'.repeat(64),'allow').success,false);
  assert.equal(service.decide(request.id,request.fingerprint,'allow').success,true);assert.equal((await first.done).trim(),'allow');
  assert.equal(service.decide(request.id,request.fingerprint,'allow').success,false);
  const second=raw(endpoint,payload);const expired=await until(()=>service.snapshot().pendingApprovals[0]);now=expired.expires+1;
  assert.equal(service.decide(expired.id,expired.fingerprint,'allow').success,false);assert.equal(await second.done,'');
});
test('truncated requests and unsupported approval agents never create an allow button',async t=>{
  const {service,endpoint}=await fixture(t);const base={mohivx_token:service.token,session_id:'s',hook_event_name:'PermissionRequest',tool_name:'Bash'};
  await raw(endpoint,{...base,coucou_agent:'codex',mohivx_approval_truncated:true}).done;
  await raw(endpoint,{...base,coucou_agent:'codex',tool_input:{command:'x'.repeat(2100)}}).done;
  await raw(endpoint,{...base,coucou_agent:'antigravity'}).done;
  assert.equal(service.snapshot().pendingApprovals.length,0);
});
const executable=path.resolve(__dirname,'../bin/mohivx-hook.exe');
test('deferring to the terminal sends no allow, and a second pending request keeps its session waiting',async t=>{
  const {service,endpoint}=await fixture(t);const base={mohivx_token:service.token,coucou_agent:'codex',session_id:'parallel',hook_event_name:'PermissionRequest',tool_name:'Bash',tool_input:{command:'fixture'}};
  const first=raw(endpoint,base);await until(()=>service.snapshot().pendingApprovals.length===1);
  const second=raw(endpoint,base);await until(()=>service.snapshot().pendingApprovals.length===2);
  const p=service.snapshot().pendingApprovals[0];assert.equal(service.decide(p.id,p.fingerprint,'defer').success,true);assert.equal(await first.done,'');
  assert.equal(service.snapshot().sessions[0].status,'waiting');
  const remaining=service.snapshot().pendingApprovals[0];service.decide(remaining.id,remaining.fingerprint,'deny');assert.equal((await second.done).trim(),'deny');
});
test('actual adapted Coucou relay carries events, edit diffs, approvals and question answers over the production pipe',{skip:process.platform!=='win32'||!fs.existsSync(executable)},async t=>{
  const {service,endpoint,dir}=await fixture(t);
  const children=[];t.after(()=>children.forEach(child=>child.kill()));
  function relay(agent,payload){
    const child=spawn(executable,agent?['--agent',agent]:[],{windowsHide:true,env:{...process.env,MOHIVX_HOOK_PIPE:endpoint,MOHIVX_HOOK_LINK_FILE:path.join(dir,'bin','hook-link.json'),CLAUDE_CODE_ENTRYPOINT:'cli'},stdio:['pipe','pipe','pipe']});children.push(child);
    let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve(stdout):reject(Error(stderr||'Native relay failed')));});child.stdin.end(JSON.stringify(payload));return {child,done};
  }
  await relay('codex',{hook_event_name:'SessionStart',session_id:'native',cwd:'E:\\mm'}).done;
  assert.equal(service.snapshot().sessions[0].name,'Codex');
  const child=relay('codex',{hook_event_name:'PermissionRequest',session_id:'native',tool_name:'Bash',tool_input:{command:'fixture command; never executed'}});
  const p=await until(()=>service.snapshot().pendingApprovals[0]);service.decide(p.id,p.fingerprint,'allow');
  assert.equal(JSON.parse(await child.done).hookSpecificOutput.decision.behavior,'allow');
  const denied=relay('codex',{hook_event_name:'PermissionRequest',session_id:'native',tool_name:'Read',tool_input:{file_path:'fixture.txt'}});
  const d=await until(()=>service.snapshot().pendingApprovals[0]);service.decide(d.id,d.fingerprint,'deny');assert.equal(JSON.parse(await denied.done).hookSpecificOutput.decision.behavior,'deny');
  const questions=[{question:'Pick one',options:[{label:'One'},{label:'Two'}],multiSelect:false}];
  const answer=relay('',{hook_event_name:'PermissionRequest',session_id:'question',tool_name:'AskUserQuestion',tool_input:{questions}});
  const q=await until(()=>service.snapshot().pendingApprovals[0]);service.decide(q.id,q.fingerprint,'answer',{'Pick one':'Two'});
  assert.equal(JSON.parse(await answer.done).hookSpecificOutput.decision.updatedInput.answers['Pick one'],'Two');
  for(const agent of ['copilot','muse']){
    const pending=relay(agent,{hook_event_name:'PermissionRequest',session_id:agent,tool_name:'Bash',tool_input:{command:'fixture, never executed'}});
    const request=await until(()=>service.snapshot().pendingApprovals[0]);service.decide(request.id,request.fingerprint,'deny');
    assert.equal(JSON.parse(await pending.done).permissionDecision,'deny');
  }
  const deferred=relay('copilot',{hook_event_name:'PermissionRequest',session_id:'fallback',tool_name:'Bash',tool_input:{command:'fixture'}});
  const fallback=await until(()=>service.snapshot().pendingApprovals[0]);service.decide(fallback.id,fallback.fingerprint,'defer');
  assert.equal(JSON.parse(await deferred.done).permissionDecision,'ask');
  const large=await relay('codex',{hook_event_name:'PermissionRequest',session_id:'long',tool_name:'Bash',tool_input:{command:'x'.repeat(4000)}}).done;
  assert.equal(large.trim(),'');assert.equal(service.snapshot().pendingApprovals.length,0);
  await relay('codex',{hook_event_name:'PostToolUse',session_id:'native',tool_name:'Edit',tool_input:{file_path:'a.ts',old_string:'old',new_string:'new'}}).done;
  assert.equal(service.snapshot().sessions.find(s=>s.agent==='codex'&&s.id.endsWith('native')).diffs[0].added,1);
});
