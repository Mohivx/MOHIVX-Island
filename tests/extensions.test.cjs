const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const https=require('node:https');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {createWallpaperService}=require('../electron/services/wallpaperService.cjs');
const {ActivityStore}=require('../electron/services/activityStore.cjs');
const {ScheduledActionsStore,CompanionAI}=require('../electron/services/companionCore.cjs');
const {routePrompt}=require('../electron/services/providerRouter.cjs');
const {AcpClient}=require('../electron/services/acpClient.cjs');
const Gateway=require('../electron/services/androidGateway.cjs');
const {pinClient}=require('./helpers/pinClient.cjs');
const {islandBounds}=require('../electron/services/windowLayout.cjs');
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-extension-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('real layout keeps every edge and oversized drawer inside an offset display work area',()=>{
  const display={bounds:{x:-1280,y:0,width:1280,height:1024},workArea:{x:-1280,y:0,width:1280,height:984}};
  for(const position of ['top-center','left','right','bottom']){const b=islandBounds(display,'drawer',{width:1800,height:1200},{position});assert.ok(b.x>=-1280&&b.y>=0&&b.x+b.width<=0&&b.y+b.height<=984);}
  assert.equal(islandBounds(display,'collapsed',{}, {position:'bottom'}).y,968);
});
test('paused focus survives reload without consuming time or awarding progress',t=>{
  let now=1000;const file=path.join(temp(t),'focus.json'),store=new ActivityStore(file,()=>now);store.focus(1);now+=10000;store.focus('pause');now+=3600000;
  const resumed=new ActivityStore(file,()=>now);assert.equal(resumed.snapshot().xp,0);assert.equal(resumed.snapshot().focus.remaining,50000);resumed.focus('resume');now+=50001;assert.equal(resumed.snapshot().xp,30);assert.equal(resumed.snapshot().focus,null);
});
test('production wallpaper service rejects invalid JSON, false success, and another full path',async()=>{
  const values=['warning {"success":true}',JSON.stringify({success:true,path:'C:\\other\\a.jpg'}),JSON.stringify({success:false,path:'C:\\wp\\a.jpg'})];
  for(const output of values){let changed=false;const s=createWallpaperService({resolvePath:()=> 'C:\\wp\\a.jpg',script:'set.ps1',execFile:(_p,_a,_o,cb)=>cb(null,output),onChanged:()=>{changed=true;}});assert.equal((await s.apply('a')).success,false);assert.equal(changed,false);}
});
test('production wallpaper calls are serialized and exact verified path broadcasts only once per apply',async()=>{
  let active=0,max=0;const changed=[];
  const s=createWallpaperService({resolvePath:v=>v,script:'set.ps1',execFile:(_p,args,opts,cb)=>{active++;max=Math.max(max,active);assert.equal(opts.windowsHide,true);setImmediate(()=>{active--;cb(null,JSON.stringify({success:true,path:args.at(-1)}));});},onChanged:p=>changed.push(p)});
  assert.deepEqual((await Promise.all([s.apply('C:\\a.jpg'),s.apply('C:\\b.jpg')])).map(r=>r.success),[true,true]);assert.equal(max,1);assert.equal(changed.length,2);
});
test('real voice service sends selected supported voice and rejects unsupported without a request',async()=>{
  const calls=[];const ai=new CompanionAI({_makeRequest:async(...args)=>{calls.push(args);return {candidates:[{content:{parts:[{inlineData:{data:'AA==',mimeType:'audio/L16'}}]}}]};}},()=>({geminiKey:'test'}));
  assert.equal((await ai.voice('Puck','test')).success,true);assert.equal(calls[0][1].generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Puck');
  assert.equal((await ai.voice('Jack','test')).success,false);assert.equal(calls.length,1);
});
test('routines await ordered steps, stop on failure, and persist actual results after restart',async t=>{
  const file=path.join(temp(t),'routines.json');let now=1000;const calls=[];
  const store=new ScheduledActionsStore(file,async s=>{calls.push(s.target);if(s.target==='bad')throw new Error('Launch failed');},()=>{},()=>now);
  store.add({actionType:'routine',title:'Morning',targetTime:2000,steps:[{actionType:'app',target:'first'},{actionType:'app',target:'bad'},{actionType:'url',target:'https://example.com'}]});now=3000;await store.tick();
  assert.deepEqual(calls,['first','bad']);const restored=new ScheduledActionsStore(file,()=>{throw Error('must not rerun');});assert.equal(restored.items[0].status,'failed');assert.deepEqual(restored.items[0].results.map(s=>s.status),['completed','failed']);
  assert.throws(()=>store.add({actionType:'routine',targetTime:4000,steps:[{actionType:'command',target:'anything'}]}),/Invalid routine/);
});
test('cancel a running routine prevents its remaining steps',async t=>{
  let release,now=1000;const pending=new Promise(r=>release=r),calls=[];
  const store=new ScheduledActionsStore(path.join(temp(t),'r.json'),async s=>{calls.push(s.target);await pending;},()=>{},()=>now);
  const item=store.add({actionType:'routine',targetTime:2000,steps:[{actionType:'app',target:'first'},{actionType:'app',target:'second'}]});now=3000;const tick=store.tick();store.cancel(item.id);release();await tick;assert.deepEqual(calls,['first']);assert.equal(store.items.length,0);
});
test('activity starts empty, rewards once daily, persists tasks, and completes an elapsed focus session once',t=>{
  let now=new Date(2026,9,17,12).getTime();const file=path.join(temp(t),'activity.json'),s=new ActivityStore(file,()=>now);
  assert.equal(s.snapshot().xp,0);assert.equal(s.snapshot().streak,0);assert.deepEqual(s.snapshot().tasks,[]);
  s.task({title:'Real task'});const id=s.snapshot().tasks[0].id;s.task({id,done:true});s.task({id,done:false});s.task({id,done:true});assert.equal(s.snapshot().xp,20);
  s.focus(1);now+=60001;assert.equal(s.snapshot().xp,50);assert.equal(s.snapshot().xp,50);assert.equal(new ActivityStore(file,()=>now).snapshot().tasks[0].done,true);assert.throws(()=>s.claim(3));
});
test('provider router actually routes Hermes and blocks cloud paths in local-only mode',async()=>{
  let gemini=0,hermes=0,fetches=0;const base={prompt:'hello',gemini:{runPrompt:async()=>{gemini++;return {success:true,reply:'Gemini'};}},hermes:{runOneShot:async()=>{hermes++;return {success:true,response:'Hermes'};}},fetcher:async()=>{fetches++;return {ok:true,json:async()=>({choices:[{message:{content:'local'}}]})};}};
  assert.equal((await routePrompt({...base,settings:{aiProvider:'hermes-local'}})).reply,'Hermes');assert.equal(hermes,1);assert.equal(gemini,0);
  assert.equal((await routePrompt({...base,settings:{aiProvider:'hermes-local',localOnlyMode:true}})).success,false);assert.equal(hermes,1);
  assert.equal((await routePrompt({...base,settings:{aiProvider:'custom-openai',localOnlyMode:true,providerUrl:'https://example.com/chat'}})).success,false);assert.equal(fetches,0);
  assert.equal((await routePrompt({...base,settings:{aiProvider:'custom-openai',localOnlyMode:true,providerUrl:'http://127.0.0.1:8000/v1/chat/completions'}})).reply,'local');assert.equal(fetches,1);
});
test('ACP permission uses the real request id and only a supplied option, cancellation denies pending requests',()=>{
  const c=new AcpClient('test','test');const writes=[];c.proc={stdin:{writable:true,write:s=>writes.push(JSON.parse(s))}};
  c.receive({id:'permission-7',method:'session/request_permission',params:{toolCall:{title:'Run command'},options:[{optionId:'allow_once',kind:'allow_once',name:'Allow once'}]}});
  assert.equal(c.decide('permission-7','invented').success,false);assert.equal(writes.length,0);
  assert.equal(c.decide('permission-7','allow_once').success,true);assert.equal(writes[0].id,'permission-7');assert.deepEqual(writes[0].result.outcome,{outcome:'selected',optionId:'allow_once'});
  c.receive({id:8,method:'session/request_permission',params:{options:[]}});c.cancel();assert.deepEqual(writes[1].result.outcome,{outcome:'cancelled'});assert.equal(c.permissions.size,0);
});
test('ACP transport sends prompts through stdin without a shell and receives real streamed answer',async()=>{
  let options;const proc=new EventEmitter();proc.stdin=new PassThrough();proc.stdout=new PassThrough();proc.stderr=new PassThrough();proc.kill=()=>proc.emit('exit',0);
  proc.stdin.on('data',bytes=>{const m=JSON.parse(bytes);if(!m.id)return;let result={};if(m.method==='session/new')result={sessionId:'session-1'};if(m.method==='session/prompt')proc.stdout.write(JSON.stringify({method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Actual answer'}}}})+'\n');proc.stdout.write(JSON.stringify({id:m.id,result})+'\n');});
  const c=new AcpClient('hermes-acp.exe','C:\\work',(_p,_a,o)=>{options=o;return proc;});const result=await c.prompt('literal $(must not execute)');assert.equal(options.shell,false);assert.equal(result.response,'Actual answer');c.close();
});
test('HTTPS companion pairing, permission denial, awaited execution, persistence and revocation',async t=>{
  const dir=temp(t);const g=new Gateway(0,dir,()=>{},{host:'127.0.0.1',discovery:false});t.after(()=>g.stop());await g.start();
  const cert=JSON.parse(fs.readFileSync(path.join(dir,'companion-tls.json'))).cert;
  let token='';const request=(route,data,overrides={})=>new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port:g.port,path:route,method:data?'POST':'GET',ca:cert,checkServerIdentity:(_host,c)=>c.fingerprint256.replaceAll(':','').toLowerCase()===g.fingerprint?undefined:Error('Pin mismatch'),headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...overrides}},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,...JSON.parse(body)}));});req.on('error',reject);req.end(data?JSON.stringify(data):undefined);});
  assert.equal((await request('/api/telemetry')).status,401);g.generateNewPin();
  assert.equal((await request('/api/pair',{pin:'wrong'})).status,401);
  const phone=await pinClient(g.pairing.pin);t.after(()=>phone.close());const start=await request('/api/pair/start',{A:phone.A});const proof=await phone.proof(start,g.fingerprint);
  const pair=await request('/api/pair/finish',{session:start.session,proof,name:'Test phone'});token=pair.token;assert.equal(pair.success,true);assert.equal(await phone.verify(pair.proof),true);assert.equal(g.pairing,null);
  assert.equal((await request('/api/pair/finish',{session:start.session,proof})).status,401);
  assert.equal(fs.readFileSync(g.file,'utf8').includes(token),false);assert.equal((await request('/api/volume',{value:50})).status,403);
  assert.equal((await request('/api/status',null,{Origin:'https://evil.example'})).status,403);
  let release,completed=false;const pending=new Promise(r=>release=r);g.setProviders({audio:{setVolume:async()=>{await pending;completed=true;return {success:false,error:'Windows rejected volume'};}}});g.setCapabilities(pair.id,['volume']);
  assert.equal((await request('/api/volume',{value:101})).status,400);const action=request('/api/volume',{value:40});await new Promise(r=>setTimeout(r,30));assert.equal(completed,false);release();assert.equal((await action).success,false);
  assert.equal(new Gateway(0,dir).devices.length,1);g.revoke(pair.id);assert.equal((await request('/api/status')).status,401);assert.equal(new Gateway(0,dir).devices.length,0);
  g.generateNewPin();const expiring=await request('/api/pair/start',{A:'5'});const expected=g.challenges.get(expiring.session).client;
  g.pairing.expires=Date.now()-1;
  assert.equal((await request('/api/pair/finish',{session:expiring.session,proof:expected})).status,401);
  g.generateNewPin();for(let i=0;i<5;i++)assert.equal((await request('/api/pair/start',{A:'5'})).status,200);
  assert.equal((await request('/api/pair/start',{A:'5'})).status,403);
});

