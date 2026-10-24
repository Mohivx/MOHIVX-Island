const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),https=require('node:https'),http=require('node:http');
const Gateway=require('../electron/services/secureGateway.cjs'),Remote=require('../electron/services/remoteLink.cjs'),{seal,open}=require('../electron/services/secureEnvelope.cjs'),{pinClient}=require('./helpers/pinClient.cjs');
test('Java-derived pairing key protects remote bearer credentials and commands, rejects tampering/replay, and survives restart without replaying reserved counters',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-remote-'));let gateway=new Gateway(0,dir,()=>{},{host:'127.0.0.1',discovery:false});t.after(()=>{gateway.stop();fs.rmSync(dir,{recursive:true,force:true});});await gateway.start();
 const cert=JSON.parse(fs.readFileSync(path.join(dir,'companion-tls.json'))).cert;
 const post=(route,data)=>new Promise((resolve,reject)=>{const request=https.request({hostname:'127.0.0.1',port:gateway.port,path:route,method:'POST',ca:cert,checkServerIdentity:()=>undefined,headers:{'Content-Type':'application/json'}},res=>{let bytes='';res.on('data',b=>bytes+=b);res.on('end',()=>resolve({status:res.statusCode,...JSON.parse(bytes)}));});request.on('error',reject);request.end(JSON.stringify(data));});
 gateway.generateNewPin();const phone=await pinClient(gateway.pairing.pin);t.after(()=>phone.close());const start=await post('/api/pair/start',{A:phone.A,secure:true}),proof=await phone.proof(start,gateway.fingerprint),finish=await post('/api/pair/finish',{session:start.session,proof,name:'Remote fixture'});
 assert.equal(await phone.verify(finish.proof),true);assert.equal(finish.token,undefined);const pair=open(phone.key,'pair:'+start.session,finish.sealed);assert.ok(pair.token);assert.ok(!JSON.stringify(gateway.status()).includes(phone.key));
 const envelope=(counter,route='/api/status')=>({device:pair.id,counter,...seal(phone.key,'request:'+pair.id+':'+counter,{route,method:'GET',token:pair.token})});
 const packet=envelope(1),response=await post('/api/secure',packet);assert.ok(!JSON.stringify(response).includes('telemetry'));assert.equal(open(phone.key,'response:'+pair.id+':1',response).success,true);
 const replay=await post('/api/secure',packet);assert.equal(open(phone.key,'response:'+pair.id+':1',replay).code,'COUNTER');
 const tampered=envelope(2);tampered.data=tampered.data.slice(0,-6)+'AAAAAA';assert.equal((await post('/api/secure',tampered)).success,false);
 gateway.stop();gateway=new Gateway(0,dir,()=>{},{host:'127.0.0.1',discovery:false});await gateway.start();const after=await post('/api/secure',envelope(2));const stale=open(phone.key,'response:'+pair.id+':2',after);assert.equal(stale.code,'COUNTER');assert.ok(stale.minimumCounter>=513);
 const next=stale.minimumCounter+1,result=await post('/api/secure',envelope(next));assert.equal(open(phone.key,'response:'+pair.id+':'+next,result).success,true);
 gateway.revoke(pair.id);assert.equal((await post('/api/secure',envelope(next+1))).status,401);
});
test('public tunnel facade blocks every legacy route and plaintext pairing path',async t=>{
 const remote=new Remote({challenges:new Map()},'unused','unused');const server=http.createServer((req,res)=>remote.proxy(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const request=(route,data)=>new Promise(resolve=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:route,method:data?'POST':'GET'},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.end(data?JSON.stringify(data):undefined);});
 assert.equal(await request('/api/status'),403);assert.equal(await request('/api/volume',{value:0}),403);assert.equal(await request('/api/pair/start',{A:'1'}),403);assert.equal(await request('/api/pair/finish',{session:'legacy'}),403);
});

test('camera media is independent of a pending AI action, while lane permissions, AAD and replay protection remain enforced after restart',async t=>{
 const {PhoneBridge}=require('../electron/services/phoneBridge.cjs'),bridge=new PhoneBridge();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-lanes-'));let gateway=new Gateway(0,dir,()=>{},{host:'127.0.0.1',discovery:false}),release;
 t.after(()=>{release?.({reply:'complete'});gateway.stop();fs.rmSync(dir,{recursive:true,force:true});});await gateway.start();
 const cert=JSON.parse(fs.readFileSync(path.join(dir,'companion-tls.json'))).cert;
 const post=(route,data)=>new Promise((resolve,reject)=>{const request=https.request({hostname:'127.0.0.1',port:gateway.port,path:route,method:'POST',ca:cert,checkServerIdentity:()=>undefined},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,...JSON.parse(text)}));});request.on('error',reject);request.end(JSON.stringify(data));});
 gateway.generateNewPin();const phone=await pinClient(gateway.pairing.pin);t.after(()=>phone.close());const start=await post('/api/pair/start',{A:phone.A,secure:true}),proof=await phone.proof(start,gateway.fingerprint),finish=await post('/api/pair/finish',{session:start.session,proof});await phone.verify(finish.proof);const pair=open(phone.key,'pair:'+start.session,finish.sealed);
 const packet=(lane,counter,route,body)=>({device:pair.id,counter,...(lane?{lane}:{}),...seal(phone.key,`request:${pair.id}:${lane?lane+':':''}${counter}`,{route,method:body?'POST':'GET',token:pair.token,...(body?{body}:{})})});
 const unpack=(lane,counter,response)=>open(phone.key,`response:${pair.id}:${lane?lane+':':''}${counter}`,response);
 const denied=unpack('camera',1,await post('/api/secure',packet('camera',1,'/api/phone-camera',{data:'AA==',streamId:'x'})));assert.equal(denied.httpStatus,403);
 gateway.setCapabilities(pair.id,['phoneCamera','ai']);let began;const waiting=new Promise(resolve=>began=resolve);
 gateway.setProviders({phoneMedia:bridge,ask:()=>{began();return new Promise(resolve=>release=resolve);}});
 const media=unpack('',1,await post('/api/secure',packet('',1,'/api/phone-start',{kind:'camera'})));assert.equal(media.mediaLanes,true);
 const ask=post('/api/secure',packet('',2,'/api/ask',{prompt:'Fixture long task'}));await waiting;
 const jpeg=Buffer.from([255,216,255,192,0,17,8,0,12,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64');
 const frame=packet('camera',2,'/api/phone-camera',{streamId:media.streamId,data:jpeg});
 const accepted=unpack('camera',2,await post('/api/secure',frame));assert.equal(accepted.success,true,'a pending AI task must not block the camera');assert.equal(bridge.snapshot().length,1);
 assert.equal(unpack('camera',2,await post('/api/secure',frame)).code,'COUNTER');
 assert.equal((await post('/api/secure',{...frame,lane:'screen'})).success,false,'lane identity must be authenticated');
 assert.equal(unpack('camera',3,await post('/api/secure',packet('camera',3,'/api/ask',{prompt:'Wrong lane'}))).success,false);
 const stopped=unpack('camera',4,await post('/api/secure',packet('camera',4,'/api/phone-stop',{kind:'camera'})));assert.equal(stopped.success,true);assert.equal(bridge.snapshot().length,0);
 release({reply:'complete'});assert.equal(unpack('',2,await ask).reply,'complete');
 gateway.stop();gateway=new Gateway(0,dir,()=>{},{host:'127.0.0.1',discovery:false});await gateway.start();
 const replay=unpack('camera',5,await post('/api/secure',packet('camera',5,'/api/phone-camera',{streamId:media.streamId,data:jpeg})));assert.equal(replay.code,'COUNTER');assert.ok(replay.minimumCounter>=513);
 assert.ok(!JSON.stringify(gateway.status()).includes('liveMediaCounters'));
});
