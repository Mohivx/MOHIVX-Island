const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const AgentHooks=require('../electron/services/agentHooks.cjs'),{ask}=require('../scripts/ask-island.cjs');
async function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-question-'));const endpoint=process.platform==='win32'?'\\\\.\\pipe\\mohivx-question-'+crypto.randomUUID():path.join(dir,'question.sock');const service=new AgentHooks(dir,{endpoint});await service.start();fs.copyFileSync(path.join(__dirname,'../bin/mohivx-hook.exe'),path.join(dir,'bin/mohivx-hook.exe'));t.after(()=>{service.stop();fs.rmSync(dir,{recursive:true,force:true});});return {dir,endpoint,service};}
async function pending(service,count=1){for(let i=0;i<200;i++){const list=service.snapshot().pendingApprovals;if(list.length>=count)return count===1?list[0]:list;await new Promise(r=>setTimeout(r,10));}throw Error('Question did not reach the island');}
test('explicit desktop question travels through the authenticated island bridge and returns an Arabic answer once',async t=>{
 const f=await fixture(t),input={questions:[{question:'اختر المظهر',options:[{label:'قرص الألبوم'},{label:'إيقاف'}],multiSelect:false}]};
 const waiting=ask(input,f),p=await pending(f.service);
 assert.equal(p.agent,'codex');assert.deepEqual(p.questions,input.questions);assert.equal(f.service.snapshot().sessions[0].name,'Codex · App');
 assert.equal(f.service.snapshot().sessions[0].chat[0].role,'assistant');assert.match(f.service.snapshot().sessions[0].chat[0].content,/اختر المظهر/);
 assert.ok(!JSON.stringify(f.service.snapshot()).includes(f.service.token));
 assert.equal(f.service.decide(p.id,'a'.repeat(64),'answer',{'اختر المظهر':'إيقاف'}).success,false);
 assert.equal(f.service.decide(p.id,p.fingerprint,'answer',{'اختر المظهر':'قرص الألبوم'}).success,true);
 assert.deepEqual(await waiting,{answers:{'اختر المظهر':'قرص الألبوم'}});
 const chat=f.service.snapshot().sessions[0].chat;assert.equal(chat[1].role,'user');assert.match(chat[1].content,/قرص الألبوم/);
 assert.equal(f.service.decide(p.id,p.fingerprint,'answer',{'اختر المظهر':'إيقاف'}).success,false);
});
test('agent prompts and replies stay in the conversation of their own session',()=>{
 const service=new AgentHooks(os.tmpdir());
 service.ingest({coucou_agent:'codex',session_id:'session-one',cwd:'C:\\work\\MOHIVX',hook_event_name:'UserPromptSubmit',prompt:'Fix the wallpaper keys.'});
 service.ingest({coucou_agent:'codex',session_id:'session-one',cwd:'C:\\work\\MOHIVX',hook_event_name:'Stop',last_assistant_message:'Ctrl+arrows now change sections.'});
 service.ingest({coucou_agent:'codex',session_id:'session-two',cwd:'C:\\work\\MOHIVX',hook_event_name:'UserPromptSubmit',prompt:'A different request.'});
 const sessions=service.snapshot().sessions,first=sessions.find(session=>session.id==='codex:session-one'),second=sessions.find(session=>session.id==='codex:session-two');
 assert.deepEqual(first.chat.map(message=>[message.role,message.content]),[['user','Fix the wallpaper keys.'],['assistant','Ctrl+arrows now change sections.']]);
 assert.deepEqual(second.chat.map(message=>message.content),['A different request.']);
});
test('dismissed, unavailable and timed-out questions do not manufacture an answer',async t=>{const f=await fixture(t),input={questions:[{question:'Choice?',options:[{label:'A'}]}]};const result=ask(input,{...f,timeout:10000});const p=await pending(f.service);f.service.decide(p.id,p.fingerprint,'defer');await assert.rejects(result,/expired|dismissed/);const timeout=ask(input,{...f,timeout:40});await assert.rejects(timeout,/No answer/);await assert.rejects(ask({questions:[...input.questions,...input.questions]},f),/unique/);});
test('a stale installed helper falls back to the current bundled native helper without changing user files',async t=>{const f=await fixture(t);fs.writeFileSync(path.join(f.dir,'bin/mohivx-hook.exe'),'obsolete');const before=fs.readFileSync(path.join(f.dir,'bin/hook-link.json'));const result=ask({questions:[{question:'Keep its size?',options:[{label:'Yes'}]}]},f);const p=await pending(f.service);assert.equal(f.service.decide(p.id,p.fingerprint,'answer',{'Keep its size?':'Yes'}).success,true);assert.deepEqual(await result,{answers:{'Keep its size?':'Yes'}});assert.equal(fs.readFileSync(path.join(f.dir,'bin/mohivx-hook.exe'),'utf8'),'obsolete');assert.deepEqual(fs.readFileSync(path.join(f.dir,'bin/hook-link.json')),before);});
test('the connected Codex lifecycle hook supplies the explicit question route without changing approval behavior',async t=>{const f=await fixture(t);fs.writeFileSync(path.join(f.dir,'bin/ask-island.cjs'),'// installed SDK fixture');const out=require('node:child_process').execFileSync(path.join(f.dir,'bin/mohivx-hook.exe'),['--agent','codex'],{windowsHide:true,encoding:'utf8',input:JSON.stringify({session_id:'lifecycle-fixture',hook_event_name:'UserPromptSubmit',prompt:'Test question routing'}),env:{...process.env,MOHIVX_HOOK_PIPE:f.endpoint,MOHIVX_HOOK_LINK_FILE:path.join(f.dir,'bin/hook-link.json')}});const response=JSON.parse(out);assert.equal(response.hookSpecificOutput.hookEventName,'UserPromptSubmit');assert.ok(response.hookSpecificOutput.additionalContext.includes('ask-island.cjs'));assert.ok(!out.includes(f.service.token));assert.equal(response.decision,undefined);});
test('MCP server returns global question instructions and isolates simultaneous multi-chat questions without superseding each other',async t=>{
 const f=await fixture(t);
 const mcpScript=path.resolve(__dirname,'../scripts/island-mcp.cjs');
 const spawnMcp=threadId=>{
  const child=spawn(process.execPath,[mcpScript,'--agent','codex'],{windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',CODEX_THREAD_ID:threadId,MOHIVX_QUESTION_AGENT:threadId==='thread-beta'?'gemini':'codex',MOHIVX_DATA_DIR:f.dir,MOHIVX_HOOK_PIPE:f.endpoint},stdio:['pipe','pipe','pipe']});
  const replies=new Map(),waiters=new Map();let buf='';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
   buf+=chunk;
   let idx;
   while((idx=buf.indexOf('\n'))>=0){
    const line=buf.slice(0,idx).trim();buf=buf.slice(idx+1);
    if(!line)continue;
    const msg=JSON.parse(line);
    if(waiters.has(msg.id)){waiters.get(msg.id)(msg);waiters.delete(msg.id);}else replies.set(msg.id,msg);
   }
  });
  const call=(id,method,params)=>new Promise(resolve=>{if(replies.has(id)){const m=replies.get(id);replies.delete(id);return resolve(m);}waiters.set(id,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  return {child,call};
 };
 const chatA=spawnMcp('thread-alpha'),chatB=spawnMcp('thread-beta');
 t.after(()=>{chatA.child.kill();chatB.child.kill();});

 const init=await chatA.call(1,'initialize',{});
 assert.match(init.result.instructions,/ask_user/);
 assert.match(init.result.instructions,/fallback/i);
 const tools=await chatA.call(2,'tools/list',{});
 assert.equal(tools.result.tools[0].name,'ask_user');

 const session='same-session-'.padEnd(160,'x');
 const callA=chatA.call(3,'tools/call',{name:'ask_user',arguments:{session,questions:[{question:'Chat A choice?',options:[{label:'Alpha 1'},{label:'Alpha 2'}]}]}});
 const callB=chatB.call(4,'tools/call',{name:'ask_user',arguments:{session,questions:[{question:'Chat B choice?',options:[{label:'Beta 1'},{label:'Beta 2'}]}]}});
 const callA2=chatA.call(5,'tools/call',{name:'ask_user',arguments:{session,questions:[{question:'Another A choice?',options:[{label:'A3'}]}]}});

 const approvals=await pending(f.service,3);
 assert.equal(approvals.length,3,'all requests remain pending despite identical explicit long session names');
 const reqA=approvals.find(p=>p.questions?.[0]?.question==='Chat A choice?');
 const reqB=approvals.find(p=>p.questions?.[0]?.question==='Chat B choice?');
 const reqA2=approvals.find(p=>p.questions?.[0]?.question==='Another A choice?');
 assert.ok(reqA&&reqB&&reqA.sessionId!==reqB.sessionId,'each chat gets a distinct session id');
 assert.equal(new Set(approvals.map(p=>p.sessionId)).size,3);
 assert.equal(f.service.snapshot().sessions.find(s=>s.id===reqB.sessionId).name,'Gemini CLI · App');

 assert.equal(f.service.decide(reqB.id,reqB.fingerprint,'answer',{'Chat B choice?':'Beta 2'}).success,true);
 assert.equal(f.service.decide(reqA.id,reqA.fingerprint,'answer',{'Chat A choice?':'Alpha 1'}).success,true);
 assert.equal(f.service.decide(reqA2.id,reqA2.fingerprint,'answer',{'Another A choice?':'A3'}).success,true);

 const [resA,resB,resA2]=await Promise.all([callA,callB,callA2]);
 assert.deepEqual(JSON.parse(resA.result.content[0].text),{answers:{'Chat A choice?':'Alpha 1'}});
 assert.deepEqual(JSON.parse(resB.result.content[0].text),{answers:{'Chat B choice?':'Beta 2'}});
 assert.deepEqual(JSON.parse(resA2.result.content[0].text),{answers:{'Another A choice?':'A3'}});
});

test('long explicit session names keep distinguishing suffixes through the native bridge',async t=>{
 const f=await fixture(t),prefix='x'.repeat(200);
 const question=name=>({session:prefix+name,questions:[{question:name,options:[{label:'Yes'}]}]});
 const a=ask(question('suffix-A'),f),b=ask(question('suffix-B'),f),requests=await pending(f.service,2);
 assert.equal(new Set(requests.map(p=>p.sessionId)).size,2);
 for(const request of requests)assert.equal(f.service.decide(request.id,request.fingerprint,'answer',{[request.questions[0].question]:'Yes'}).success,true);
 assert.deepEqual(await a,{answers:{'suffix-A':'Yes'}});assert.deepEqual(await b,{answers:{'suffix-B':'Yes'}});
});

test('the terminal command sends Arabic choices and returns the real isolated fixture answer',async t=>{
 const f=await fixture(t),question='تختار أي لون للجزيرة؟';
 const child=spawn(process.execPath,[path.resolve(__dirname,'../scripts/ask-island.cjs'),'--agent','antigravity','--question',question,'--option','الأزرق','--option','البنفسجي'],{windowsHide:true,env:{...process.env,MOHIVX_DATA_DIR:f.dir,MOHIVX_HOOK_PIPE:f.endpoint},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());let output='',error='';child.stdout.setEncoding('utf8');child.stdout.on('data',s=>output+=s);child.stderr.setEncoding('utf8');child.stderr.on('data',s=>error+=s);
 const result=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(output)):reject(Error(error)));});
 const request=await pending(f.service);assert.equal(f.service.snapshot().sessions[0].name,'Antigravity · App');assert.equal(request.questions[0].question,question);assert.equal(f.service.decide(request.id,request.fingerprint,'answer',{[question]:'الأزرق'}).success,true);
 assert.deepEqual(await result,{answers:{[question]:'الأزرق'}});
});
