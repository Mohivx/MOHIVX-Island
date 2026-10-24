const test=require('node:test'),assert=require('node:assert/strict'),https=require('node:https'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Gateway=require('../electron/services/secureGateway.cjs');
const {pinClient}=require('./helpers/pinClient.cjs');
test('phone agent approvals require separate permission, carry the exact request fingerprint, and reject replay and revocation',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-phone-agents-'));
  const g=new Gateway(0,dir,()=>{},{host:'127.0.0.1',discovery:false});t.after(()=>{g.stop();fs.rmSync(dir,{recursive:true,force:true});});await g.start();
  const cert=JSON.parse(fs.readFileSync(path.join(dir,'companion-tls.json'),'utf8')).cert;
  let token='';const request=(route,data)=>new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port:g.port,path:route,method:data?'POST':'GET',ca:cert,checkServerIdentity:(_host,c)=>c.fingerprint256.replaceAll(':','').toLowerCase()===g.fingerprint?undefined:Error('Pin mismatch'),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,...JSON.parse(body)}));});req.on('error',reject);req.end(data?JSON.stringify(data):undefined);});
  g.generateNewPin();const phone=await pinClient(g.pairing.pin);t.after(()=>phone.close());const start=await request('/api/pair/start',{A:phone.A}),proof=await phone.proof(start,g.fingerprint);const paired=await request('/api/pair/finish',{session:start.session,proof,name:'Fixture phone'});assert.equal(await phone.verify(paired.proof),true);token=paired.token;
  const pending={id:'hook:fixture',source:'hook',fingerprint:'a'.repeat(64),title:'Fixture request',expires:Date.now()+10000};let accepted=0;
  g.setProviders({agentCenter:{getAllStatuses:async()=>({sessions:[],pendingApprovals:accepted?[]:[pending],hermes:{pendingApprovals:[{id:'managed-only'}]}}),approveAction:(id,option,fingerprint)=>{if(id!==pending.id||fingerprint!==pending.fingerprint||accepted)return {success:false,error:'Request changed or expired.'};accepted++;return {success:true};}}});
  const decision={id:pending.id,optionId:'allow_once',fingerprint:pending.fingerprint};
  g.setCapabilities(paired.id,['agents']);assert.equal((await request('/api/agents')).agents.pendingApprovals.length,0);assert.equal((await request('/api/agent-decision',decision)).status,403);assert.equal(accepted,0);
  g.setCapabilities(paired.id,['agents','agentApprovals']);const visible=await request('/api/agents');assert.equal(visible.agents.pendingApprovals[0].fingerprint,pending.fingerprint);assert.deepEqual(visible.agents.hermes.pendingApprovals,[]);
  assert.equal((await request('/api/agent-decision',{...decision,fingerprint:'b'.repeat(64)})).success,false);assert.equal(accepted,0);
  assert.equal((await request('/api/agent-decision',decision)).success,true);assert.equal(accepted,1);assert.equal((await request('/api/agent-decision',decision)).success,false);
  g.revoke(paired.id);assert.equal((await request('/api/agent-decision',decision)).status,401);assert.equal(accepted,1);
});
