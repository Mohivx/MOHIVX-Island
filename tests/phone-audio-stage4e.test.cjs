const test=require('node:test');
const assert=require('node:assert/strict');
const {PhoneBridge}=require('../electron/services/phoneBridge.cjs');
const {PhoneSync}=require('../electron/services/phoneSync.cjs');
const {decodePhoneAudioFrame,PhoneAudioPlayer}=require('../src/components/phoneAudioPlayer.mjs');

const pcm=(samples)=>Buffer.from(samples.flatMap(value=>[value&255,(value>>8)&255])).toString('base64');

test('phone playback audio is scoped, validated and removed on stop or permission revocation',()=>{
 const events=[],bridge=new PhoneBridge(frame=>events.push(frame)),{streamId}=bridge.begin('phone-a','audio');
 const result=bridge.publish('phone-a','audio',{streamId,rate:48000,channels:2,data:pcm([16384,-16384,0,0])});
 assert.equal(result.success,true);assert.equal(bridge.latest('phone-a','audio').inputLevel>0,true);
 assert.throws(()=>bridge.publish('phone-a','audio',{streamId,rate:44100,channels:2,data:pcm([0,0])}),/Invalid phone audio/);
 assert.throws(()=>bridge.publish('phone-a','audio',{streamId,rate:48000,channels:1,data:pcm([0,0])}),/Invalid phone audio/);
 bridge.clear('phone-a','audio');assert.equal(bridge.latest('phone-a','audio'),null);assert.equal(events.at(-1).stopped,true);
 assert.throws(()=>bridge.publish('phone-a','audio',{streamId,rate:48000,channels:2,data:pcm([0,0])}),/session stopped/);
});

test('playback audio capture is independently permissioned and queued for the phone user to approve',async()=>{
 let now=1000;const sync=new PhoneSync({now:()=>now}),device={id:'phone-a',capabilities:['phoneAudio']};sync.exchange(device,{});
 const started=sync.request(device,{type:'capture.start',kind:'audio'});const command=sync.exchange(device,{}).commands[0];
 assert.equal(command.type,'capture.start');assert.equal(command.kind,'audio');
 sync.exchange(device,{results:[{id:command.id,value:{needsTap:true}}]});assert.deepEqual(await started,{needsTap:true});
 const stopped=sync.request(device,{type:'capture.stop',kind:'audio'});const stopCommand=sync.exchange(device,{}).commands[0];
 sync.exchange(device,{results:[{id:stopCommand.id,value:{stopped:true}}]});assert.deepEqual(await stopped,{stopped:true});
 const revoked=sync.request(device,{type:'capture.start',kind:'audio'});device.capabilities=[];sync.exchange(device,{});await assert.rejects(revoked,/revoked/);sync.clear();now++;
});

test('PCM frames decode as stereo signed 16-bit and reject malformed input',()=>{
 const decoded=decodePhoneAudioFrame({rate:48000,channels:2,data:pcm([16384,-16384,-32768,32767])});
 assert.deepEqual([...decoded.left],[.5,-1]);assert.deepEqual([...decoded.right],[-.5,32767/32768]);
 assert.throws(()=>decodePhoneAudioFrame({rate:44100,channels:2,data:pcm([0,0])}),/Invalid phone audio/);
 assert.throws(()=>decodePhoneAudioFrame({rate:48000,channels:2,data:'AA=='}),/Invalid phone audio/);
});

test('PC playback schedules a bounded live queue and stops scheduled samples cleanly',async()=>{
 const sources=[];let currentTime=0,closed=false;
 const context={state:'running',destination:{},get currentTime(){return currentTime},async resume(){},async close(){closed=true},createBuffer(channels,length,rate){return {channels,length,rate,copyToChannel(){}}},createBufferSource(){const source={buffer:null,stopped:0,connect(){},start(when){this.when=when},stop(){this.stopped++;this.onended?.()}};sources.push(source);return source;}};
 const player=new PhoneAudioPlayer({contextFactory:()=>context,maxBufferedSeconds:.22});await player.resume();
 const frame={rate:48000,channels:2,data:Buffer.alloc(19200).toString('base64')};
 player.push(frame);player.push(frame);player.push(frame);player.push(frame);
 assert.equal(sources[0].when>=.012,true);assert.equal(sources.length,4);
 assert.equal(sources.slice(0,3).some(source=>source.stopped>0),true,'latency cap discards a stale scheduled queue');
 currentTime=.5;player.push(frame);player.stop();assert.equal(closed,true);assert.equal(sources.at(-1).stopped>0,true);
});
