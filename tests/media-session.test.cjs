const test=require('node:test'),assert=require('node:assert/strict');
const {parseMedia,createMediaQuery}=require('../electron/services/mediaSession.cjs');
test('media JSON preserves Arabic, delimiters and local artwork, rejects unsafe sources',()=>{
  const value={title:'أغنية | title',artist:'فنان',isPlaying:true,position:12,duration:30,artwork:'data:image/png;base64,YQ==',sourceApp:'player'};
  assert.deepEqual(parseMedia(JSON.stringify(value)),value);
  assert.equal(parseMedia(JSON.stringify({...value,artwork:'https://tracking.invalid/cover'})).artwork,'');
  assert.equal(parseMedia('NO_MEDIA').title,'');
  assert.equal(parseMedia(JSON.stringify({...value,position:-3,duration:'bad'})).position,0);
});
test('multiple renderers share one pending media query and poll again after cache expiry',async()=>{
  let calls=0,resolve,now=0;const read=()=>{calls++;return new Promise(r=>resolve=r);};
  const query=createMediaQuery(read,{now:()=>now});
  const first=query(),second=query();await Promise.resolve();assert.equal(calls,1);
  resolve(JSON.stringify({title:'Track',isPlaying:true}));assert.equal((await first).title,'Track');assert.equal((await second).title,'Track');
  await query();assert.equal(calls,1);now=2000;const next=query();await Promise.resolve();assert.equal(calls,2);resolve('NO_MEDIA');assert.equal((await next).title,'');
});
