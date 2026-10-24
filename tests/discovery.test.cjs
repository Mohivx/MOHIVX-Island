const test=require('node:test'),assert=require('node:assert/strict'),dgram=require('node:dgram');
const {startDiscovery}=require('../electron/services/companionDiscovery.cjs');
test('real UDP discovery locates only an open pairing service without exposing its six-digit secret',async t=>{
  const gateway={port:19120,pairing:{pin:'012345',expires:Date.now()+2000,attempts:0}};
  const server=startDiscovery(gateway,{port:0,host:'127.0.0.1'}),client=dgram.createSocket('udp4');
  t.after(()=>{server.close();client.close();});await new Promise(r=>server.once('listening',r));
  const nonce='ab'.repeat(16);
  const receive=timeout=>new Promise(resolve=>{const done=packet=>{clearTimeout(timer);client.off('message',done);resolve(packet?.toString()||null);};const timer=setTimeout(()=>done(null),timeout);client.on('message',done);});
  const pending=receive(1000);client.send(Buffer.from('MOHIVX_DISCOVER_V1 '+nonce),server.address().port,'127.0.0.1');
  const raw=await pending,reply=JSON.parse(raw);assert.equal(reply.nonce,nonce);assert.equal(reply.port,19120);assert.equal(reply.protocol,2);assert.equal(raw.includes(gateway.pairing.pin),false);
  gateway.pairing=null;
  const closed=receive(350);client.send(Buffer.from('MOHIVX_DISCOVER_V1 '+nonce),server.address().port,'127.0.0.1');assert.equal(await closed,null);
});
