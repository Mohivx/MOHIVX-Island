const test = require('node:test');
const assert = require('node:assert/strict');
const surface = import('../src/hooks/islandSurface.mjs');
test('output audio activates music without media metadata and never borrows a paused session',async()=>{
  const {musicActivity}=await surface;
  assert.deepEqual(musicActivity({},true),{visible:true,hasSession:false,outputOnly:true});
  assert.deepEqual(musicActivity({title:'Paused player',isPlaying:false},true),{visible:true,hasSession:false,outputOnly:true});
  assert.deepEqual(musicActivity({title:'Playing track',isPlaying:true},false),{visible:true,hasSession:true,outputOnly:false});
  assert.equal(musicActivity({},false).visible,false);assert.equal(musicActivity({title:'',isPlaying:true},false).visible,false);
  assert.equal(musicActivity({},true,false).visible,false);assert.equal(musicActivity({title:'Playing track',isPlaying:true},true,false).visible,false);
});
test('persistent music fits every collapsed shape and edge, keeping the camera circle small',async()=>{
  const {collapsedSize,COLLAPSED_SHAPES,surfaceViewport}=await surface;
  for(const shape of Object.keys(COLLAPSED_SHAPES))for(const edge of ['top','left','right','bottom'])for(const scale of [.8,1,1.3]){
    const size=collapsedSize(shape,edge,true),native=surfaceViewport(size.width,size.height,shape,scale,edge);
    assert.ok(size.width*scale<=native.width&&size.height*scale<=native.height);
    if(shape==='orb-circle')assert.deepEqual(size,collapsedSize(shape,edge,false));
    else if(edge==='left'||edge==='right')assert.ok(size.height>size.width);
    else assert.ok(size.width>size.height);
  }
});
const {islandBounds}=require('../electron/services/windowLayout.cjs');
test('every shape attaches to all four edges without horizontal side notches or oversized camera circles',async()=>{
  const {COLLAPSED_SHAPES,collapsedSize,surfaceViewport}=await surface;
  const display={workArea:{x:-1280,y:24,width:1280,height:720}};
  for(const shape of Object.keys(COLLAPSED_SHAPES))for(const edge of ['top','left','right','bottom'])for(const scale of [.8,1,1.3]){
    const size=collapsedSize(shape,edge),viewport=surfaceViewport(size.width,size.height,shape,scale,edge);
    const bounds=islandBounds(display,'collapsed',viewport,{position:edge});
    assert.equal(bounds.width,viewport.width);assert.equal(bounds.height,viewport.height);
    assert.ok(bounds.x>=-1280&&bounds.y>=24&&bounds.x+bounds.width<=0&&bounds.y+bounds.height<=744);
    if(edge==='left')assert.equal(bounds.x,-1280);
    if(edge==='right')assert.equal(bounds.x+bounds.width,0);
    if(edge==='bottom')assert.equal(bounds.y+bounds.height,744);
    if(shape==='classic'&&(edge==='left'||edge==='right'))assert.ok(bounds.height>bounds.width);
    if(shape==='orb-circle')assert.ok(size.width*scale<=37&&size.height*scale<=37);
  }
});
function clock() {
  let next=0; const jobs=new Map();
  return {schedule:fn=>{jobs.set(++next,fn);return next;}, cancel:id=>jobs.delete(id), tick:()=>{const pending=[...jobs.values()];jobs.clear();pending.forEach(fn=>fn());}};
}

test('all collapsed shapes fit their native window including offset and scale, and receive clicks at their visible center', async () => {
  const {COLLAPSED_SHAPES,surfaceViewport,containsSurfacePoint}=await surface;
  for(const [shape,size] of Object.entries(COLLAPSED_SHAPES))for(const scale of [.8,1,1.3]){
    const viewport=surfaceViewport(size.width,size.height,shape,scale);
    assert.ok(viewport.width>=size.width*scale+24,shape);
    assert.ok(viewport.height>=size.inset+size.height*scale+6,shape);
    const rect={left:12,top:size.inset,right:12+size.width*scale,bottom:size.inset+size.height*scale,width:size.width*scale,height:size.height*scale};
    assert.equal(containsSurfacePoint(rect,rect.left+rect.width/2,rect.top+rect.height/2,shape==='orb-circle'?9999:0),true,shape);
    assert.equal(containsSurfacePoint(rect,rect.left-1,rect.top,0),false,shape);
  }
  assert.equal(containsSurfacePoint({left:0,top:0,right:74,bottom:74,width:74,height:74},1,1,9999),false);
});

test('leaving collapses a keyboard-opened drawer too; re-entry cancels a pending close', async () => {
  const {AutoCollapse}=await surface; const time=clock();let closes=0;
  const hover=new AutoCollapse(()=>closes++,time);
  hover.update('drawer',false);hover.leave();time.tick();assert.equal(closes,1);
  hover.enter();hover.leave();hover.enter();time.tick();assert.equal(closes,1);
  hover.leave();time.tick();assert.equal(closes,2);
  hover.dispose();
});

test('tools suspend auto-collapse and return to normal after closing, with no stale close after reopening', async () => {
  const {AutoCollapse}=await surface;const time=clock();let closes=0;
  const hover=new AutoCollapse(()=>closes++,time);
  hover.update('drawer',false);hover.enter();hover.leave();hover.update('drawer',true);time.tick();assert.equal(closes,0);
  hover.update('drawer',false);time.tick();assert.equal(closes,1);
  hover.leave();hover.update('collapsed',false);hover.update('drawer',false);hover.enter();time.tick();assert.equal(closes,1);
  hover.leave();hover.dispose();time.tick();assert.equal(closes,1);
});

test('native resize timing follows selected motion speed and reduced-motion preference', async () => {
  const {animationDuration}=await surface;
  assert.equal(animationDuration('instant'),0);assert.equal(animationDuration('fast'),160);
  assert.equal(animationDuration('smooth'),300);assert.equal(animationDuration('cinematic'),450);
  assert.equal(animationDuration('cinematic',true),0);
});

test('browser timer functions keep their required receiver when used by auto-collapse', async t => {
  const {AutoCollapse}=await surface;const originalSet=global.setTimeout,originalClear=global.clearTimeout;
  const pending=new Map();let id=0;
  t.after(()=>{global.setTimeout=originalSet;global.clearTimeout=originalClear;});
  global.setTimeout=function(fn){'use strict';assert.ok(this===undefined||this===globalThis);pending.set(++id,fn);return id;};
  global.clearTimeout=function(timer){'use strict';assert.ok(this===undefined||this===globalThis);pending.delete(timer);};
  let closed=false;const hover=new AutoCollapse(()=>{closed=true;});hover.update('drawer',false);
  hover.leave();hover.enter();assert.equal(pending.size,0);
  hover.leave();[...pending.values()][0]();assert.equal(closed,true);hover.dispose();
});

test('flat notch top corners stay clickable and curved bottom corners pass through', async () => {
  const {containsSurfacePoint}=await surface;
  const rect={left:0,top:0,right:140,bottom:14,width:140,height:14};
  const radii={topLeft:0,topRight:0,bottomLeft:10,bottomRight:10};
  assert.equal(containsSurfacePoint(rect,1,1,radii),true);
  assert.equal(containsSurfacePoint(rect,139,1,radii),true);
  assert.equal(containsSurfacePoint(rect,1,13,radii),false);
  assert.equal(containsSurfacePoint(rect,139,13,radii),false);
  assert.equal(containsSurfacePoint(rect,70,13,radii),true);
});

test('drawer heights and scaled native bounds stay inside small work areas', async () => {
  const {fitSurfaceHeight,surfaceViewport,COLLAPSED_SHAPES}=await surface;
  for(const shape of Object.keys(COLLAPSED_SHAPES))for(const scale of [.8,1,1.3]){
    const height=fitSurfaceHeight(700,shape,scale,500);
    assert.ok(surfaceViewport(400,height,shape,scale).height<=500);
  }
  assert.equal(fitSurfaceHeight(440,'classic',1,1080),440);
});

test('apps and chat leave space below the island across display sizes and scales', async () => {
  const {sectionHeightLimit,surfaceViewport,COLLAPSED_SHAPES}=await surface;
  for(const shape of Object.keys(COLLAPSED_SHAPES))for(const scale of [.8,1,1.3])for(const available of [500,768,1080,2160]){
    for(const tab of ['apps','ai']){
      const limit=sectionHeightLimit(tab,shape,scale,available);
      assert.ok(surfaceViewport(400,limit,shape,scale).height<=Math.floor(available*.78),`${shape}/${scale}/${available}/${tab}`);
      assert.ok(limit<=(tab==='apps'?560:620));
    }
  }
});
