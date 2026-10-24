// Actual Chromium layout regression. Native IPC is replaced with in-memory fixtures;
// this never launches Electron, changes Windows, or uses the desktop's mouse/keyboard.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.MOHIVX_PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'../dist');
const shapes=['classic','dynamic-island','orb-circle','liquid-glass','mohivx-modern'];
const tabs=['agents','controls','today','stats','clipboard','apps','wallpaper','power','ai'];
const results=[];
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname==='/'?'/index.html':new URL(req.url,'http://local').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'}[path.extname(file)];
  try{res.writeHead(200,{'Content-Type':mime||'application/octet-stream'});res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
async function fixture(context,appCount=5,monitor={width:1920,height:1080}){
  await context.addInitScript(({appCount,monitor})=>{
    // Headless setViewportSize also changes screen.availHeight. Electron's
    // native window resize does not change its monitor's work area.
    Object.defineProperty(screen,'availHeight',{get:()=>monitor.height});
    Object.defineProperty(screen,'availWidth',{get:()=>monitor.width});
    const listeners=new Map(),requests=[];
    const settings={appLang:'ar',theme:'original-blue',islandShape:'classic',islandScale:1,animationSpeed:'smooth',mascotMode:'original',musicTheme:'player',musicSizing:'expand',visibleTabs:{ai:true}};
    const apps=Array.from({length:appCount},(_,i)=>({name:`App ${i+1}`,letter:'A',type:'App',path:`app-${i+1}`}));
    let agentData={bridge:{enabled:true},sessions:[{id:'codex:fixture',agent:'codex',name:'Codex',color:'#8ab4ff',project:'MOHIVX',status:'completed',steps:[{event:'Stop',detail:'Updated the island layout.',at:Date.now()}],diffs:[{id:'diff-1',path:'src/layout.ts',added:1,removed:1,hunks:[{lines:[{kind:'removed',text:'old layout'},{kind:'added',text:'natural height'}]}]}]}],pendingApprovals:[],hookIntegrations:[{agent:'codex',ready:true,installed:false}]};
    let mediaData=null;
    let lastNative;
    const ipc={on:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeListener:(name,fn)=>listeners.get(name)?.delete(fn),send:(channel,arg)=>{requests.push({channel,arg});if(channel==='set-window-mode')lastNative=arg;},invoke:async (name,arg)=>{
      if(name==='android-status')return {devices:[{id:'fixture-phone',name:'Test phone',capabilities:['phoneData','phoneMic','phoneCamera','phoneScreen']}]};
      if(name==='phone-sync-status')return {at:Date.now(),status:{capture:['mic'],notifications:true,folder:true,photos:true},notifications:[{id:'sms',app:'Messages',title:'Incoming SMS',text:'Phone sync fixture',sms:true,at:Date.now()},{id:'notification',app:'Calendar',title:'Meeting reminder',text:'Notification fixture',sms:false,at:Date.now()}]};
      if(name==='phone-command'){requests.push({channel:name,arg});return arg.command.type==='capture.start'?{needsTap:true}:arg.command.type==='capture.stop'?{stopped:true}:{items:[{id:'file-1',name:'Test photo.jpg',size:1024,directory:false}],next:0};}
      if(name==='phone-file-save'||name==='phone-viewer-open'){requests.push({channel:name,arg});return {success:true};}
      if(name==='get-current-media')return mediaData;
      if(name==='get-coding-agents-status')return agentData;
      if(['agent-approve-action','agent-reject-action'].includes(name)){requests.push({channel:name,arg});agentData.pendingApprovals=agentData.pendingApprovals.filter(p=>p.id!==arg.id);return {success:true};}
      if(name==='agent-hook-preview'){requests.push({channel:name,arg});return {id:'review-fixture',agent:arg.agent,install:arg.install,path:'fixture/hooks.json',diff:'+ mohivx-hook.exe\n+ PermissionRequest'};}
      if(name==='agent-hook-apply'){requests.push({channel:name,arg});return {success:true};}
      if(name==='get-app-settings')return settings;
      if(name==='get-installed-apps')return apps;
      if(name==='execute-ai-prompt'){
        requests.push({channel:name,arg});
        const result={requestId:arg.requestId,success:true,reply:'One completed response',toolsExecuted:[]};
        for(const fn of listeners.get('ai-status-change')||[])fn(null,{status:'idle',requestId:arg.requestId,result});
        return result;
      }
      if(name==='activity-get')return {tasks:[],focus:null};
      if(name==='get-top-apps')return Array.from({length:5},(_,i)=>({name:`Process ${i}`,ram:'120 MB',cpu:'1'}));
      if(['get-clipboard-history','get-wallpapers-list','get-wifi-networks','get-audio-devices'].includes(name))return [];
      return null;
    }};
    window.require=name=>{if(name==='electron')return {ipcRenderer:ipc};throw Error('Unexpected native module');};
    localStorage.setItem('tasks-migrated-1.1','1');localStorage.setItem('hitodama_lang','ar');
    window.__layoutTest={requests,setMedia:value=>{mediaData=value||{title:'',artist:'',isPlaying:false,artwork:'',sourceApp:'',position:0,duration:0};},native:()=>lastNative,setAgents:patch=>{agentData={...agentData,...patch};for(const fn of listeners.get('agent-sessions-updated')||[])fn(null,agentData);},emit:(name,arg)=>{if(name==='app-settings-updated')Object.assign(settings,arg);for(const fn of listeners.get(name)||[])fn(null,arg);}};
  },{appCount,monitor});
}
async function open(page,tab,settings={}){
  await page.evaluate(({tab,settings})=>{window.__layoutTest.requests.length=0;window.__layoutTest.emit('app-settings-updated',settings);window.__layoutTest.emit('open-island-tab',tab);},{tab,settings});
  // Keep the virtual pointer over the surface while the fixture applies native
  // resizes; otherwise real auto-collapse correctly closes a newly shrunken section.
  await page.waitForTimeout(70);
  const initial=await page.locator('[data-island-stage]').boundingBox(),old=page.viewportSize();
  if(initial)await page.mouse.move(Math.max(1,Math.min(old.width-2,initial.x+initial.width/2)),Math.max(1,Math.min(old.height-2,initial.y+16)));
  await page.waitForTimeout(480);
  const native=await page.evaluate(()=>window.__layoutTest.native());
  assert.ok(native?.height>20,`${tab}: missing complete native resize`);
  await page.setViewportSize({width:native.width,height:native.height});
  const fitted=await page.locator('[data-island-stage]').boundingBox();
  if(fitted)await page.mouse.move(fitted.x+fitted.width/2,fitted.y+16);
  await page.waitForTimeout(350);
  return page.evaluate(()=>{
    const surface=document.querySelector('[data-island-stage]'),body=document.querySelector('.island-tab-body'),drawer=document.querySelector('.island-drawer-content');
    const s=getComputedStyle(surface),r=surface.getBoundingClientRect();
    return {tab:body?.dataset.islandTab,height:r.height,width:r.width,bottom:r.bottom,navHeight:document.querySelector('.island-section-nav')?.getBoundingClientRect().height||0,background:s.backgroundColor,blur:s.backdropFilter,opacity:s.opacity,bodyOverflow:body.scrollHeight-body.clientHeight,drawerHeight:drawer.offsetHeight,screenHeight:screen.availHeight,nativeHeight:innerHeight};
  });
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.MOHIVX_TEST_BROWSER||undefined});
  try{
    const context=await browser.newContext({viewport:{width:164,height:20},screen:{width:1920,height:1080}});
    await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await fixture(context,5,process.env.MOHIVX_TABS_ONLY?{width:600,height:800}:undefined);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.waitForSelector('[data-island-stage]');await page.waitForTimeout(150);
    if(process.env.MOHIVX_OUTPUT_FALLBACK_ONLY){await require('./output-audio.browser.cjs')(page,open);assert.deepEqual(errors,[]);return;}
    if(process.env.MOHIVX_MUSIC_BEHAVIORS_ONLY){await require('./music-behaviors.browser.cjs')(page,open);assert.deepEqual(errors,[]);return;}
    if(process.env.MOHIVX_TABS_ONLY){
      for(const appLang of ['ar','en']){
        await open(page,'controls',{appLang,tabOrder:['ai','controls','today','stats','clipboard','apps','wallpaper','power']});
        const nav=page.locator('.island-section-nav'),bounds=await nav.boundingBox();
        const buttons=await nav.locator('button').all();for(const button of buttons){const r=await button.boundingBox();assert.ok(r.x>=bounds.x-1&&r.y>=bounds.y-1&&r.x+r.width<=bounds.x+bounds.width+1&&r.y+r.height<=bounds.y+bounds.height+1,'every tab must remain reachable within the navigation area');}
        assert.deepEqual(await nav.locator('button').allTextContents().then(x=>x.slice(0,2)),appLang==='ar'?['الوكلاء','الهاتف']:['Agents','Phone']);
        await nav.getByRole('button',{name:appLang==='ar'?'الهاتف':'Phone',exact:true}).click();await page.locator('.phone-dashboard').waitFor();
        await nav.getByRole('button',{name:appLang==='ar'?'الوكلاء':'Agents',exact:true}).click();await page.locator('.agent-panel').waitFor();
        console.log('Old saved tab order accepted; all tabs visible and clickable: '+appLang);
      }
      await page.mouse.move(0,0);
      await page.evaluate(()=>window.__layoutTest.setAgents({pendingApprovals:[{id:'hook:stay-visible',source:'hook',agent:'codex',sessionId:'codex:fixture',fingerprint:'a'.repeat(64),title:'AskUserQuestion',questions:[{question:'Keep this question visible?',options:[{label:'Yes'},{label:'No'}]}],expires:Date.now()+60000}]}));
      await page.getByTestId('agent-approval').waitFor();await page.waitForTimeout(900);assert.equal(await page.locator('[data-island-stage]').getAttribute('data-island-stage'),'drawer','pending question must stay open when the pointer is outside');
      const questionWindow=await page.evaluate(()=>window.__layoutTest.native());await page.setViewportSize({width:questionWindow.width,height:questionWindow.height});await page.waitForTimeout(80);
      await page.getByLabel('Yes',{exact:true}).check();await page.getByRole('button',{name:'Send answers'}).click();assert.deepEqual(await page.evaluate(()=>window.__layoutTest.requests.filter(r=>r.channel==='agent-approve-action').at(-1).arg.answers),{'Keep this question visible?':'Yes'});
      console.log('Pending question remains open and its selected answer reaches the agent');assert.deepEqual(errors,[]);return;
    }
    if(process.env.MOHIVX_PHONE_AUDIO_ONLY){
      await open(page,'phone',{appLang:'en'});await page.getByText('Incoming SMS',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Messages',exact:true}).click();assert.equal(await page.getByText('Meeting reminder',{exact:true}).count(),0);
      await page.getByRole('button',{name:'Start Camera',exact:true}).click();await page.getByText('Tap the notification on your phone to start sharing.',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Stop Microphone',exact:true}).click();assert.ok(await page.evaluate(()=>window.__layoutTest.requests.some(r=>r.channel==='phone-command'&&r.arg.command.type==='capture.stop'&&r.arg.command.kind==='mic')));
      await page.getByRole('button',{name:'Photos',exact:true}).click();await page.getByText('Test photo.jpg',{exact:true}).click();assert.ok(await page.evaluate(()=>window.__layoutTest.requests.some(r=>r.channel==='phone-file-save')));
      await page.getByRole('button',{name:'Files',exact:true}).click();await page.getByText('Test photo.jpg',{exact:true}).waitFor();
      assert.ok((await page.locator('[data-island-stage]').boundingBox()).height<=580,'phone should remain compact');
      await require('./music-behaviors.browser.cjs')(page,open);
      assert.deepEqual(errors,[]);console.log('Phone tab: notifications, SMS filter, capture controls, photos and files accepted');return;
    }
    for(const shape of (process.env.MOHIVX_EDGES_ONLY||process.env.MOHIVX_DETAIL_ONLY?[]:shapes)){
      const heights={};
      for(const tab of tabs){
        const data=await open(page,tab,{islandShape:shape});
        assert.equal(data.tab,tab);assert.equal(data.background,'rgb(0, 0, 0)');assert.equal(data.blur,'none');assert.equal(data.opacity,'1');
        assert.ok(data.bodyOverflow<=1,`${shape}/${tab}: unnecessary outer scrolling ${JSON.stringify(data)}`);
        assert.ok(data.bottom<=data.nativeHeight+1,`${shape}/${tab}: native window clips the surface`);
        heights[tab]=data.height-data.navHeight;results.push({shape,...data});
      }
      assert.ok(heights.power<heights.controls&&heights.wallpaper<heights.today,'sections must adapt to their real content: '+JSON.stringify(heights));
      console.log(`Layout passed: ${shape}, all ${tabs.length} sections`);
    }
    for(const shape of (process.env.MOHIVX_SKIP_EDGES?[]:shapes))for(const position of ['top-center','left','right','bottom'])for(const scale of [.8,1.3]){
      await open(page,'power',{position,islandShape:shape,islandScale:scale});
      const rect=await page.locator('[data-island-stage]').boundingBox();
      const viewport=page.viewportSize();assert.ok(rect.x>=-1&&rect.y>=-1&&rect.x+rect.width<=viewport.width+1&&rect.y+rect.height<=viewport.height+1,`expanded clipped: ${JSON.stringify({shape,position,scale,rect,viewport,native:await page.evaluate(()=>window.__layoutTest.native())})}`);
      const native=await page.evaluate(()=>window.__layoutTest.native());
      if(position==='left')assert.ok(rect.x<10,'left surface must grow from left');
      if(position==='right')assert.ok(viewport.width-rect.x-rect.width<10,`right surface must grow from right ${JSON.stringify({shape,position,scale,rect,viewport})}`);
      if(position==='bottom')assert.ok(viewport.height-rect.y-rect.height<10,'bottom surface must grow upwards');
      await page.keyboard.press('Escape');await page.waitForTimeout(380);
      const collapsedNative=await page.evaluate(()=>window.__layoutTest.native());await page.setViewportSize({width:collapsedNative.width,height:collapsedNative.height});await page.waitForTimeout(50);
      const mini=await page.locator('[data-island-stage]').boundingBox();
      assert.ok(mini.x>=-1&&mini.y>=-1&&mini.x+mini.width<=collapsedNative.width+1&&mini.y+mini.height<=collapsedNative.height+1,`mini clipped: ${shape}/${position}/${scale}`);
      if(shape==='classic'&&['left','right'].includes(position))assert.ok(mini.height>mini.width*5,'side notch must be vertical');
      if(shape==='orb-circle')assert.ok(mini.width<=37&&mini.height<=37,'camera cutout is oversized');
      results.push({case:'edge-shape-scale',shape,position,scale,native,collapsedNative});
    }
    if(process.env.MOHIVX_EDGES_ONLY){console.log('All edge/shape/scale checks passed');return;}
    await open(page,'power',{position:'top-center',islandShape:'classic',islandScale:1});
    await page.keyboard.press('Escape');await page.waitForTimeout(380);
    await page.evaluate(()=>window.__layoutTest.setMedia({title:'Arabic | أغنية',artist:'Artist',isPlaying:true,sourceApp:'fixture',position:10,duration:100,artwork:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='}));
    await page.waitForSelector('[data-media-glance]',{timeout:8500});await page.waitForTimeout(400);
    const musicNative=await page.evaluate(()=>window.__layoutTest.native());await page.setViewportSize({width:musicNative.width,height:musicNative.height});
    assert.equal(await page.locator('[data-island-stage]').getAttribute('data-island-stage'),'collapsed','playback must appear in the small island, without opening the drawer');
    await page.getByText('Arabic | أغنية',{exact:true}).waitFor();assert.ok(await page.locator('[data-media-glance] img').count()>0);
    if(!process.env.MOHIVX_MEDIA_MATRIX_ONLY){
    await page.mouse.move(0,musicNative.height-1);await page.waitForTimeout(6200);
    assert.equal(await page.locator('[data-media-glance]').count(),1,'music must survive the old 5.5-second timeout and pointer leave');
    await page.getByRole('button',{name:'Now playing: Arabic | أغنية · Open music controls',exact:true}).or(page.getByRole('button',{name:'الآن: Arabic | أغنية · فتح التحكم بالموسيقى',exact:true})).click();
    await page.waitForTimeout(360);let native=await page.evaluate(()=>window.__layoutTest.native());await page.setViewportSize({width:native.width,height:native.height});await page.mouse.move(native.width/2,16);
    assert.equal(await page.locator('.island-tab-body').getAttribute('data-island-tab'),'controls','clicking the playing island must open media controls');
    await page.mouse.move(native.width-1,native.height-1);await page.waitForTimeout(800);
    assert.equal(await page.locator('[data-island-stage]').getAttribute('data-island-stage'),'collapsed','leaving the drawer must collapse it');
    native=await page.evaluate(()=>window.__layoutTest.native());await page.setViewportSize({width:native.width,height:native.height});assert.equal(await page.locator('[data-media-glance]').count(),1,'music must remain after the drawer closes');
    await page.evaluate(()=>window.__layoutTest.setMedia({title:'Next track',artist:'Artist',isPlaying:true,sourceApp:'fixture',position:0,duration:100,artwork:''}));
    await page.locator('[data-media-glance]').filter({hasText:'Next track'}).waitFor({timeout:5000});assert.equal(await page.locator('[data-media-glance] img').count(),0,'no cover must show a music icon');
    await page.evaluate(()=>window.__layoutTest.setMedia({title:'Next track',artist:'Artist',isPlaying:false,sourceApp:'fixture',position:4,duration:100,artwork:''}));
    await page.locator('[data-media-glance]').waitFor({state:'detached',timeout:5000});
    await page.evaluate(()=>window.__layoutTest.setMedia({title:'Next track',artist:'Artist',isPlaying:true,sourceApp:'fixture',position:4,duration:100,artwork:''}));await page.locator('[data-media-glance]').waitFor({timeout:5000});
    }
    const mediaCases=[];
    for(const shape of shapes)for(const position of ['top-center','left','right','bottom'])for(const scale of [.8,1.3]){
      await page.evaluate(settings=>window.__layoutTest.emit('app-settings-updated',settings),{position,islandShape:shape,islandScale:scale,musicTheme:'player',musicSizing:shape==='orb-circle'?'fixed':'expand'});await page.waitForTimeout(420);
      const native=await page.evaluate(()=>window.__layoutTest.native());await page.setViewportSize({width:native.width,height:native.height});
      await page.waitForFunction(()=>[document.querySelector('.island-anchor'),document.querySelector('[data-island-stage]')].every(el=>{const css=getComputedStyle(el);return Math.abs(parseFloat(css.width)-parseFloat(el.style.width))<.1&&Math.abs(parseFloat(css.height)-parseFloat(el.style.height))<.1;}),null,{timeout:3000});
      const diagnostic=await page.locator('.island-anchor').evaluate(el=>({style:el.getAttribute('style'),width:getComputedStyle(el).width,minWidth:getComputedStyle(el).minWidth,minHeight:getComputedStyle(el).minHeight,transition:getComputedStyle(el).transition,position:getComputedStyle(el.firstElementChild?.nextElementSibling||el.firstElementChild).position,surfacePosition:getComputedStyle(document.querySelector('[data-island-stage]')).position,box:el.getBoundingClientRect().toJSON(),root:el.parentElement.getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight}}));
      const box=await page.locator('[data-island-stage]').boundingBox(),cover=await page.locator('.island-media-cover').boundingBox();
      assert.ok(box.x>=-1&&box.y>=-1&&box.x+box.width<=native.width+1&&box.y+box.height<=native.height+1,`music surface clipped: ${JSON.stringify({shape,position,scale,native,box,diagnostic})}`);
      assert.ok(cover.x>=box.x-1&&cover.y>=box.y-1&&cover.x+cover.width<=box.x+box.width+1&&cover.y+cover.height<=box.y+box.height+1,`cover clipped: ${JSON.stringify({shape,position,scale,native,box,cover,diagnostic})}`);
      if(shape==='orb-circle')assert.ok(box.width<=37&&box.height<=37,'playing music must keep the camera circle small');
      else assert.equal(await page.locator('.island-media-waves').isVisible(),true,'playing shapes must show the sound animation');
      assert.equal(await page.locator('[data-island-stage]').getAttribute('data-island-stage'),'collapsed');mediaCases.push({shape,position,scale,native});
    }
    await page.evaluate(()=>window.__layoutTest.setMedia({title:'Broken cover track',artist:'Artist',isPlaying:true,sourceApp:'fixture',position:4,duration:100,artwork:'data:image/png;base64,YQ=='}));
    await page.waitForFunction(()=>document.querySelector('[data-media-glance]')?.getAttribute('aria-label')?.includes('Broken cover track'),{timeout:5000});
    await page.waitForFunction(()=>!document.querySelector('.island-media-cover img'));
    await page.evaluate(()=>window.__layoutTest.setMedia(null));await page.locator('[data-media-glance]').waitFor({state:'detached',timeout:5000});
    console.log(`Persistent music accepted: ${mediaCases.length} shape/edge/scale cases, cover fallback, playback lifecycle, drawer controls and pointer leave`);
    if(process.env.MOHIVX_MEDIA_ONLY){if(process.env.MOHIVX_LAYOUT_REPORT)fs.writeFileSync(process.env.MOHIVX_LAYOUT_REPORT,JSON.stringify({passed:true,mediaCases},null,2));assert.deepEqual(errors,[]);return;}
    await page.evaluate(()=>window.__layoutTest.emit('app-settings-updated',{position:'top-center',islandShape:'classic',islandScale:1}));
    for(const theme of ['original-blue','original-gold','amethyst','silver-monochrome']){
      const data=await open(page,'controls',{theme,islandShape:'classic',appLang:'en'});assert.equal(data.background,'rgb(0, 0, 0)');
    }
    const before=await open(page,'apps',{appLang:'ar'});
    await page.getByText('إضافة تطبيق',{exact:true}).first().click();await page.waitForTimeout(400);
    const grown=await page.evaluate(()=>window.__layoutTest.native());await page.setViewportSize({width:grown.width,height:grown.height});await page.waitForTimeout(40);
    const expanded=await page.locator('[data-island-stage]').boundingBox();assert.ok(expanded.height>before.height+80,'Add App must grow the island');
    await page.getByText('إلغاء',{exact:true}).click();await page.waitForTimeout(400);
    const after=await page.locator('[data-island-stage]').boundingBox();assert.ok(Math.abs(after.height-before.height)<=1,'closing Add App must shrink the island');
    await open(page,'agents',{appLang:'en'});
    await page.locator('.agent-view-tabs').getByRole('button',{name:'Changes'}).click();await page.locator('.agent-diffs summary').click();
    await page.getByText('natural height',{exact:false}).waitFor();
    const review={id:'hook:ui-fixture',source:'hook',sessionId:'codex:fixture',fingerprint:'a'.repeat(64),title:'Edit',detail:JSON.stringify({file_path:'layout.ts',old_string:'old layout',new_string:'natural height'},null,2),expires:Date.now()+60000};
    await page.evaluate(review=>window.__layoutTest.setAgents({pendingApprovals:[review]}),review);
    await page.getByTestId('agent-approval').waitFor();await page.waitForTimeout(400);
    const withRequest=await page.evaluate(()=>window.__layoutTest.native());await page.setViewportSize({width:withRequest.width,height:withRequest.height});
    assert.ok(await page.getByTestId('agent-approval').locator('pre').innerText().then(text=>text.includes('new_string')&&text.includes('natural height')),'review must show the full tool input');
    await page.getByRole('button',{name:'Allow once',exact:true}).click();await page.getByTestId('agent-approval').waitFor({state:'detached'});
    const decision=await page.evaluate(()=>window.__layoutTest.requests.find(r=>r.channel==='agent-approve-action'));
    assert.equal(decision.arg.id,review.id);assert.equal(decision.arg.fingerprint,review.fingerprint);assert.equal(decision.arg.optionId,'allow_once');
    await page.evaluate(review=>window.__layoutTest.setAgents({pendingApprovals:[{...review,id:'hook:questions',title:'AskUserQuestion',questions:[{question:'Choose layout',options:[{label:'Compact'},{label:'Wide'}],multiSelect:false}]}]}),review);
    await page.getByLabel('Wide',{exact:true}).check();await page.getByRole('button',{name:'Send answers'}).click();
    const answer=await page.evaluate(()=>window.__layoutTest.requests.filter(r=>r.channel==='agent-approve-action').at(-1));assert.deepEqual(answer.arg.answers,{'Choose layout':'Wide'});
    await page.evaluate(review=>window.__layoutTest.setAgents({pendingApprovals:[{...review,id:'hook:custom',title:'AskUserQuestion',questions:[{question:'Your preference',options:[{label:'Suggested'}]}]},{...review,id:'hook:another',sessionId:'other-session',agent:'copilot'}]}),review);
    await page.waitForFunction(()=>document.querySelectorAll('[data-testid=agent-approval]').length===2);
    assert.equal(await page.getByTestId('agent-approval').count(),2,'requests from another session must remain visible');
    await page.getByLabel('Write an answer: Your preference').fill('A custom arrangement');await page.getByRole('button',{name:'Send answers'}).click();
    const written=await page.evaluate(()=>window.__layoutTest.requests.filter(r=>r.channel==='agent-approve-action').at(-1));assert.deepEqual(written.arg.answers,{'Your preference':'A custom arrangement'});
    await page.getByRole('button',{name:'Reply in terminal'}).click();
    const deferred=await page.evaluate(()=>window.__layoutTest.requests.filter(r=>r.channel==='agent-approve-action').at(-1));assert.equal(deferred.arg.optionId,'reply_terminal');
    await page.evaluate(review=>window.__layoutTest.setAgents({pendingApprovals:[{...review,id:'hook:expired',expires:Date.now()-1000}]}),review);
    await page.getByRole('button',{name:'Allow once'}).waitFor();assert.equal(await page.getByRole('button',{name:'Allow once'}).isDisabled(),true);
    await page.evaluate(()=>window.__layoutTest.setAgents({pendingApprovals:[],sessions:[]}));
    await page.getByText('Connect your agents',{exact:true}).click();await page.getByRole('button',{name:'Review connection'}).click();
    assert.equal(await page.evaluate(()=>window.__layoutTest.requests.filter(r=>r.channel==='agent-hook-apply').length),0,'connection review must not install hooks');
    await page.getByRole('button',{name:'Connect',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__layoutTest.requests.find(r=>r.channel==='agent-hook-apply').arg),'review-fixture');
    if(process.env.MOHIVX_LAYOUT_SCREENSHOT){await page.evaluate(()=>window.__layoutTest.setAgents({sessions:[{id:'codex:preview',name:'Codex',color:'#8ab4ff',project:'MOHIVX',status:'working',steps:[{at:Date.now(),detail:'Refining island transitions.'},{at:Date.now(),detail:'Updated the phone companion.'}],diffs:[]}]}));await open(page,'agents',{appLang:'ar'});await page.screenshot({path:process.env.MOHIVX_LAYOUT_SCREENSHOT});}
    assert.deepEqual(errors,[]);await context.close();
    const limited=await browser.newContext({viewport:{width:164,height:20},screen:{width:800,height:500}});
    await fixture(limited,191,{width:800,height:500});await limited.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    const small=await limited.newPage();await small.goto(origin);await small.waitForSelector('[data-island-stage]');await small.waitForTimeout(150);
    const long=await open(small,'apps',{islandScale:1.3});
    const apps=await small.locator('.apps-results').evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight}));
    assert.ok(apps.scroll>apps.client,'191 apps must scroll inside the list');assert.ok(long.bodyOverflow<=1,'the search bar must stay outside the scrolling area');assert.ok(long.bottom<=390,'scaled apps must leave space below the island');
    const searchBefore=await small.locator('input').first().boundingBox();
    await small.locator('.apps-results').evaluate(el=>el.scrollTop=el.scrollHeight);
    assert.ok(await small.getByText('App 191',{exact:true}).isVisible(),'last app must remain reachable');
    const search=await small.locator('input').first().boundingBox();assert.ok(search.y>=0&&search.y+search.height<=small.viewportSize().height&&Math.abs(search.y-searchBefore.y)<=1,'search must remain visible and stationary after scrolling to the last app');
    results.push({case:'small-display-long-list',...long});await limited.close();
    const chatContext=await browser.newContext({viewport:{width:164,height:20},screen:{width:1920,height:1080}});
    await fixture(chatContext,191);await chatContext.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    const chat=await chatContext.newPage();await chat.goto(origin);await chat.waitForSelector('[data-island-stage]');await chat.waitForTimeout(150);
    for(const language of ['en','ar']){
      await open(chat,'ai',{appLang:language});
      await chat.getByText(language==='ar'?'مرحباً بك! أنا MOHIVX، روح جهازك ومساعدك الذكي. اطلب مني فتح تطبيق، أو البحث، أو اسألني أي سؤال.':'Hello! I am MOHIVX, your desktop companion. Ask me to open an app, search, or answer a question.',{exact:true}).waitFor();
      const input=chat.locator('.ai-section input');await input.fill('Fixture request');await input.press('Enter');
      await chat.getByText('One completed response',{exact:true}).last().waitFor();
      assert.equal(await chat.getByText('One completed response',{exact:true}).count(),language==='en'?1:2,'broadcast plus invoke must append once, while separate identical replies are preserved');
    }
    await chat.evaluate(()=>{for(let i=0;i<45;i++)for(let duplicate=0;duplicate<2;duplicate++)window.__layoutTest.emit('ai-status-change',{status:'idle',requestId:'fixture-'+i,result:{reply:`Long message ${i}: `+'A complete paragraph. '.repeat(30)}});});
    const conversation=await open(chat,'ai');
    assert.equal(await chat.getByText(/^Long message /).count(),45,'duplicate broadcasts must be ignored by request identity');
    const stream=await chat.locator('.ai-message-stream').evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight,top:el.scrollTop}));
    assert.ok(stream.scroll>stream.client&&stream.top>0,'long chat must scroll internally and reveal the latest reply');
    assert.ok(conversation.height<=620&&conversation.bodyOverflow<=1,'chat must stay compact without scrolling the composer away');
    const composer=await chat.locator('.ai-section input').boundingBox();assert.ok(composer.y+composer.height<=conversation.bottom,'composer must stay inside the drawer');
    const bigApps=await open(chat,'apps');assert.ok(bigApps.height<=560&&bigApps.height>=400,'large displays must retain a compact usable app list');
    results.push({case:'long-chat',...conversation},{case:'191-apps',...bigApps});
    await chatContext.close();
    if(process.env.MOHIVX_LAYOUT_REPORT)fs.writeFileSync(process.env.MOHIVX_LAYOUT_REPORT,JSON.stringify({passed:true,results},null,2));
    console.log(`Headless layout accepted: ${results.length} section cases, theme invariance, live growth/shrink, display overflow, agent diffs/decisions/questions and connection review`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>server.close());
