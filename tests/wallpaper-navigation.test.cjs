const test=require('node:test'),assert=require('node:assert/strict');
test('rapid wallpaper navigation applies current and latest requests, skipping obsolete queued images',async()=>{
  const {WallpaperQueue}=await import('../src/hooks/wallpaperQueue.mjs');const calls=[],success=[],busy=[];let release;
  const gate=new Promise(r=>release=r);const queue=new WallpaperQueue(async item=>{calls.push(item.id);if(item.id===1)await gate;return {success:true,path:item.path};},{busy:v=>busy.push(v),success:item=>success.push(item.id),error:e=>{throw e;}});
  const running=queue.request({id:1,path:'first'});queue.request({id:2,path:'obsolete'});queue.request({id:3,path:'last'});release();await running;
  assert.deepEqual(calls,[1,3]);assert.deepEqual(success,[1,3]);assert.deepEqual(busy,[true,false]);
});
test('wallpaper failure keeps navigation usable and disposal suppresses late UI feedback',async()=>{
  const {WallpaperQueue}=await import('../src/hooks/wallpaperQueue.mjs');const errors=[],success=[];
  const queue=new WallpaperQueue(async item=>item.fail?{success:false,error:'Windows refused'}:{success:true},{busy:()=>{},success:item=>success.push(item.id),error:e=>errors.push(e.message)});
  await queue.request({id:1,fail:true});await queue.request({id:2});assert.equal(errors.length,1);assert.deepEqual(success,[2]);
  let resolve;const gate=new Promise(r=>resolve=r);const disposed=new WallpaperQueue(()=>gate,{busy:()=>{},success:()=>assert.fail('late UI update'),error:()=>assert.fail('late error')});const run=disposed.request({id:3});disposed.dispose();resolve({success:true});await run;
});
