const assert=require('node:assert/strict');
module.exports=async function checkMusic(page,open){
 const {musicLayout,collapsedSize,surfaceViewport}=await import('../src/hooks/islandSurface.mjs');
 const cases=[];for(const position of ['top-center','left','right','bottom'])for(const musicSizing of ['fixed','expand'])for(const musicTheme of ['off','player','edge-bars','classic','split'])cases.push({position,musicSizing,musicTheme,islandShape:'dynamic-island'});
 for(const islandShape of ['classic','orb-circle','liquid-glass','mohivx-modern'])for(const position of ['top-center','left','right','bottom'])cases.push({position,islandShape,musicSizing:'fixed',musicTheme:'edge-bars'});
 for(const position of ['top-center','left','right','bottom'])for(const musicTheme of ['off','player','edge-bars','classic','split'])cases.push({position,islandShape:'orb-circle',musicSizing:'expand',musicTheme});
 await page.evaluate(()=>window.__layoutTest.setMedia({title:'Music behavior fixture',artist:'Fixture player',isPlaying:true}));
 await open(page,'power',{appLang:'en',position:'top-center',islandShape:'classic',musicTheme:undefined,musicSizing:undefined});await page.keyboard.press('Escape');await page.locator('[data-media-glance][data-music-theme="edge-bars"][data-fixed="true"]').waitFor({timeout:8000});await page.waitForTimeout(380);const defaultBox=await page.locator('[data-island-stage]').boundingBox();assert.equal(defaultBox.width,140);assert.equal(defaultBox.height,14);console.log('User default accepted: original shell size with outward lines');
 for(const settings of cases){
  await open(page,'power',{...settings,appLang:'en',islandScale:1});await page.keyboard.press('Escape');await page.waitForTimeout(390);
  await page.evaluate(()=>{window.__audioTimer=setInterval(()=>window.__layoutTest.emit('audio-meter',{available:true,peak:.6,left:.7,right:.4}),30);});
  const layout=musicLayout(settings);if(layout.enabled)await page.locator('[data-media-glance]').waitFor({timeout:8000});await page.waitForTimeout(420);
  let native=await page.evaluate(()=>window.__layoutTest.native());await page.setViewportSize({width:native.width,height:native.height});await page.waitForTimeout(50);
  const expected=collapsedSize(settings.islandShape,settings.position,layout.enabled,layout.presentation),decorations={bars:layout.enabled&&layout.bars,satellite:layout.enabled&&layout.satellite};
  assert.deepEqual({width:native.width,height:native.height},surfaceViewport(expected.width,expected.height,settings.islandShape,1,settings.position,decorations),JSON.stringify(settings));
  const box=await page.locator('[data-island-stage]').boundingBox();assert.ok(Math.abs(box.width-expected.width)<1&&Math.abs(box.height-expected.height)<1,'shell must obey selected size: '+JSON.stringify({settings,box,expected}));
  if(settings.musicSizing==='fixed')assert.deepEqual(expected,collapsedSize(settings.islandShape,settings.position,false),'fixed music cannot enlarge shell');
  assert.equal(await page.locator('[data-music-bars]').count(),Number(decorations.bars));assert.equal(await page.locator('[data-music-satellite]').count(),Number(decorations.satellite));
  const visible=await page.locator('[data-music-bars] line, [data-music-satellite]').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));for(const r of visible)assert.ok(r.x>=-1&&r.y>=-1&&r.right<=native.width+1&&r.bottom<=native.height+1,'music decoration clipped: '+JSON.stringify({settings,r,native}));
  if(decorations.bars){const lengths=await page.locator('[data-music-bars]').innerHTML();await page.waitForTimeout(70);assert.equal(await page.locator('[data-music-bars]').innerHTML(),lengths,'steady audio must not generate random movement');}
  await page.evaluate(()=>{clearInterval(window.__audioTimer);window.__layoutTest.emit('audio-meter',{available:true,peak:0,left:0,right:0});});await page.waitForTimeout(280);assert.equal(await page.locator('[data-music-bars]').count(),0,'silence must quickly hide outside lines');await page.waitForTimeout(360);
  native=await page.evaluate(()=>window.__layoutTest.native());assert.deepEqual({width:native.width,height:native.height},surfaceViewport(expected.width,expected.height,settings.islandShape,1,settings.position,{satellite:decorations.satellite}),'no unused external-line space in silence');
  if(decorations.satellite){await page.setViewportSize({width:native.width,height:native.height});await page.getByRole('button',{name:'Open music controls',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-island-stage]').dataset.islandStage==='drawer');assert.equal(await page.locator('[data-music-satellite]').count(),0);}
  console.log('Music behavior passed: '+JSON.stringify(settings));
 }
 await page.evaluate(()=>window.__layoutTest.setMedia({title:'Music behavior fixture',artist:'Fixture player',isPlaying:false}));await page.locator('[data-media-glance]').waitFor({state:'detached',timeout:8000});
 console.log('Music behaviors accepted: '+cases.length+' combinations, fixed shell, active/silent gutters, satellite controls');
};
