const test=require('node:test'),assert=require('node:assert/strict');
const {PhoneBridge,validateInput,jpegSize}=require('../electron/services/phoneBridge.cjs');
const https=require('node:https'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Gateway=require('../electron/services/secureGateway.cjs');
const {pinClient}=require('./helpers/pinClient.cjs');
// A bounded SOF fixture exercises metadata validation; actual decoding is done by native image readers.
const jpeg=Buffer.from([255,216,255,192,0,17,8,0,12,0,16,3,1,17,0,2,17,0,3,17,0,255,217]);
test('phone sessions reject uploads after stop, replacement, expiry and per-device revocation',()=>{
 const events=[],bridge=new PhoneBridge(value=>events.push(value));
 const first=bridge.begin('a','screen');const frame={streamId:first.streamId,data:jpeg.toString('base64')};bridge.publish('a','screen',frame);
 assert.deepEqual(jpegSize(jpeg),{width:16,height:12});assert.equal(bridge.latest('a','screen').width,16);assert.equal(bridge.snapshot()[0].dataUrl,undefined);
 assert.throws(()=>bridge.publish('b','screen',frame),/stopped/);
 const next=bridge.begin('a','screen');assert.notEqual(next.streamId,first.streamId);assert.equal(bridge.latest('a','screen'),null);assert.throws(()=>bridge.publish('a','screen',frame),/stopped/);
 bridge.publish('a','screen',{...frame,streamId:next.streamId});bridge.expire(Date.now()+9000);assert.equal(bridge.latest('a','screen'),null);assert.throws(()=>bridge.publish('a','screen',{...frame,streamId:next.streamId}),/stopped/);
 const mic=bridge.begin('a','mic'),pcm={streamId:mic.streamId,data:Buffer.alloc(6400).toString('base64'),rate:16000};for(let i=0;i<35;i++)bridge.publish('a','mic',pcm);assert.equal(bridge.microphone('a').length,30);assert.throws(()=>bridge.publish('a','mic',{...pcm,rate:8000}),/Invalid microphone/);assert.throws(()=>bridge.publish('a','mic',{...pcm,data:Buffer.alloc(3).toString('base64')}),/Invalid microphone/);
 bridge.clearAll();assert.equal(bridge.microphone('a').length,0);assert.equal(bridge.snapshot().length,0);assert.throws(()=>bridge.publish('a','mic',pcm),/stopped/);assert(events.some(event=>event.stopped));
});
test('phone input is typed and bounded; malformed image packets never reach a native provider',()=>{
 assert.deepEqual(validateInput({type:'move',dx:9999,dy:-9999}),{type:'move',dx:2000,dy:-2000});assert.throws(()=>validateInput({type:'move',dx:NaN,dy:1}));assert.throws(()=>validateInput({type:'key',key:'powershell'}));assert.throws(()=>validateInput({type:'text',text:'x'.repeat(2001)}));
 for(const data of [Buffer.alloc(0),Buffer.from([255,216,...Array(30).fill(255),255,217]),Buffer.from(jpeg.map((x,i)=>i===9||i===7?255:x))])assert.equal(jpegSize(data),null);
});
test('phone APIs enforce individual permissions and re-check revocation while requests are in flight',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-phone-media-'));const bridge=new PhoneBridge(),g=new Gateway(0,dir,()=>{},{host:'127.0.0.1',discovery:false});t.after(()=>{g.stop();fs.rmSync(dir,{recursive:true,force:true});});await g.start();
 const cert=JSON.parse(fs.readFileSync(path.join(dir,'companion-tls.json'),'utf8')).cert;let token='';const request=(route,data)=>new Promise((resolve,reject)=>{const req=https.request({host:'127.0.0.1',port:g.port,path:route,method:data?'POST':'GET',ca:cert,checkServerIdentity:()=>undefined,headers:{Authorization:'Bearer '+token}},res=>{let text='';res.on('data',part=>text+=part);res.on('end',()=>resolve({status:res.statusCode,...JSON.parse(text)}));});req.on('error',reject);req.end(data?JSON.stringify(data):undefined);});
 g.generateNewPin();const phone=await pinClient(g.pairing.pin);t.after(()=>phone.close());const start=await request('/api/pair/start',{A:phone.A});const paired=await request('/api/pair/finish',{session:start.session,proof:await phone.proof(start,g.fingerprint)});token=paired.token;
 let inputs=0,release,started;g.setProviders({phoneMedia:bridge,input:{send:async()=>{inputs++;return {success:true};}},desktop:{screen:()=>new Promise(resolve=>{release=resolve;started?.();})}});
 assert.equal((await request('/api/remote-input',{type:'key',key:'enter'})).status,403);assert.equal(inputs,0);assert.equal((await request('/api/phone-start',{kind:'camera'})).status,403);
 g.setCapabilities(paired.id,['phoneScreen','remoteInput','desktopView']);const stream=await request('/api/phone-start',{kind:'screen'});assert(stream.streamId);
 assert.equal((await request('/api/phone-screen',{streamId:stream.streamId,data:jpeg.toString('base64')})).success,true);assert.equal(bridge.snapshot().length,1);
 await request('/api/phone-stop',{kind:'screen'});assert.equal((await request('/api/phone-screen',{streamId:stream.streamId,data:jpeg.toString('base64')})).success,false);
 assert.equal((await request('/api/remote-input',{type:'text',text:'مرحبا'})).success,true);assert.equal(inputs,1);
 const waiting=new Promise(resolve=>started=resolve),capture=request('/api/pc-screen');await waiting;g.setCapabilities(paired.id,['phoneScreen']);release({dataUrl:'private-frame'});const blocked=await capture;assert.equal(blocked.status,403);assert.equal(blocked.dataUrl,undefined);
 const last=await request('/api/phone-start',{kind:'screen'});g.revoke(paired.id);assert.equal(bridge.snapshot().length,0);assert.throws(()=>bridge.publish(paired.id,'screen',{streamId:last.streamId,data:jpeg.toString('base64')}),/stopped/);assert.equal((await request('/api/status')).status,401);
});
