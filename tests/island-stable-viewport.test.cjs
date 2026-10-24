const test=require('node:test'),assert=require('node:assert/strict');
const {islandBounds}=require('../electron/services/windowLayout.cjs');
test('normal island morphs share one stationary native viewport on every edge and monitor',()=>{
 for(const display of [{bounds:{x:0,y:0,width:1920,height:1080},workArea:{x:0,y:0,width:1920,height:1040}},{bounds:{x:-1280,y:-200,width:1280,height:1024},workArea:{x:-1280,y:-200,width:1280,height:984}}]){
  for(const position of ['top-center','left','right','bottom'])for(const [mode,width,height]of [['collapsed',164,16],['drawer',764,620],['drawer',480,210],['compact-media',390,46]]){
   assert.deepEqual(islandBounds(display,mode,{width,height,stableViewport:true},{position}),display.workArea);
  }
  assert.deepEqual(islandBounds(display,'fullscreen',{stableViewport:true},{}),display.bounds);
  assert(islandBounds(display,'dictation',{stableViewport:true},{}).height<=160);
 }
});
