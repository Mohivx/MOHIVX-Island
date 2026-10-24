const assert=require('node:assert/strict');
module.exports=async function checkOutput(page,open){
 const {collapsedSize,surfaceViewport}=await import('../src/hooks/islandSurface.mjs');let count=0;
 for(const scenario of ['missing-session','paused-session'])for(const position of ['top-center','left','right','bottom'])for(const musicTheme of scenario==='missing-session'?['edge-bars','player','classic','split','off']:['edge-bars']){
  await page.evaluate(scenario=>window.__layoutTest.setMedia(scenario==='missing-session'?{}:{title:'Paused stale player',artist:'Old artist',isPlaying:false,artwork:'data:image/png;base64,YQ=='}),scenario);
  await open(page,'power',{appLang:'en',position,islandShape:'classic',musicSizing:'fixed',musicTheme});await page.keyboard.press('Escape');await page.waitForTimeout(390);
  await page.evaluate(()=>window.__outputTimer=setInterval(()=>window.__layoutTest.emit('audio-meter',{available:true,peak:.3,left:.3,right:.3}),30));
  const enabled=musicTheme!=='off',bars=enabled&&['edge-bars','classic'].includes(musicTheme),satellite=enabled&&musicTheme==='split';
  if(enabled)await page.locator('[data-media-glance][data-media-source=output]').waitFor({timeout:3000});await page.waitForTimeout(380);
  assert.equal(await page.locator('[data-media-glance]').count(),Number(enabled));assert.equal(await page.locator('[data-music-bars]').count(),Number(bars));assert.equal(await page.locator('[data-music-satellite]').count(),Number(satellite));
  if(enabled){assert.match(await page.locator('[data-media-glance]').getAttribute('aria-label'),/Device audio/);assert.equal(await page.locator('[data-media-glance] img, [data-music-satellite] img').count(),0,'do not show paused player artwork for an unknown audio source');}
  const size=collapsedSize('classic',position,false),native=await page.evaluate(()=>window.__layoutTest.native());assert.deepEqual({width:native.width,height:native.height},surfaceViewport(size.width,size.height,'classic',1,position,{bars,satellite}));await page.setViewportSize({width:native.width,height:native.height});const box=await page.locator('[data-island-stage]').boundingBox();assert.equal(box.width,size.width);assert.equal(box.height,size.height);
  await page.evaluate(()=>{clearInterval(window.__outputTimer);window.__layoutTest.emit('audio-meter',{available:true,peak:0,left:0,right:0});});await page.locator('[data-media-glance]').waitFor({state:'detached',timeout:1000});await page.waitForTimeout(420);const silent=await page.evaluate(()=>window.__layoutTest.native());assert.deepEqual({width:silent.width,height:silent.height},surfaceViewport(size.width,size.height,'classic',1,position));
  count++;console.log('Output-only audio accepted: '+scenario+'/'+position+'/'+musicTheme);
 }
 await page.evaluate(()=>window.__layoutTest.setMedia({title:'Actual playing track',artist:'Actual player',isPlaying:true}));await open(page,'power',{position:'top-center',musicTheme:'player',musicSizing:'expand'});await page.keyboard.press('Escape');await page.locator('[data-media-glance][data-media-source=session]').waitFor({timeout:3000});assert.match(await page.locator('[data-media-glance]').getAttribute('aria-label'),/Actual playing track/);
 console.log('Browser audio fallback accepted: '+count+' cases, no metadata requirement, silence cleanup, no stale title/artwork, original session preserved');
};
