const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const RemoteLink=require('../electron/services/remoteLink.cjs');
test('stopping remote access while the gateway starts prevents any tunnel process from being created',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-remote-stop-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let finish,spawned=0;const ready=new Promise(resolve=>finish=resolve);
 const remote=new RemoteLink({start:()=>ready},__filename,dir,{spawn:()=>{spawned++;throw Error('Must not spawn');}});const starting=remote.start();remote.stop();finish();await assert.rejects(starting,/cancelled/);assert.equal(spawned,0);assert.equal(remote.status().enabled,false);assert.equal(remote.server,null);
});
test('a late QR result cannot restore a stopped remote connection or leak a proxy server',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-remote-qr-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let finishQr,qrStarted;const waiting=new Promise(resolve=>qrStarted=resolve);let killed=0;
 const remote=new RemoteLink({start:async()=>{}},__filename,dir,{spawn:()=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{killed++;setImmediate(()=>child.emit('exit',0));};setImmediate(()=>child.stderr.emit('data',Buffer.from('https://fixture-test.trycloudflare.com')));return child;},qr:()=>{qrStarted();return new Promise(resolve=>finishQr=resolve);}});
 const starting=remote.start();await waiting;remote.stop();finishQr('late-qr');await assert.rejects(starting,/cancelled/);assert.equal(killed,1);assert.equal(remote.server,null);assert.equal(remote.status().url,'');assert.equal(remote.status().qr,'');
});
