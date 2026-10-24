// Headless Chromium with memory-only IPC. Never touches the user's desktop or phone.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),assert=require('node:assert/strict');
const fixtureDir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-ui-reference-'));
const activity=new (require('../electron/services/activityStore.cjs').ActivityStore)(path.join(fixtureDir,'activity.json')).snapshot();
activity.ownedSkins=['hitodama','ember','wisp','amethyst'];activity.ownedAbilities=[];
const workspace=new (require('../electron/services/companionWorkspace.cjs').CompanionWorkspace)(path.join(fixtureDir,'workspace.json')).snapshot();
let source=fs.readFileSync(path.join(__dirname,'reviewed-features.browser.cjs'),'utf8').split('(async()=>{')[0];
source=source.replace("if(channel==='get-app-version')",`if(channel==='desktop-window-state')return window.__windowState||{maximized:false};
 if(channel==='desktop-window-action'){const old=window.__windowState||{maximized:false};window.__windowState={...old,maximized:arg==='maximize'?!old.maximized:old.maximized};emit('desktop-window-state-changed',window.__windowState);return window.__windowState;}
 if(channel==='preview-island-notification')return {success:true};
 if(channel==='get-app-version')`);
source=source.replace("if(channel==='activity-get')return {tasks:[],focus:null};", 'if(channel===\'activity-get\')return '+JSON.stringify(activity)+';');
source=source.replace("if(channel==='workspace-get')return {snippets:[]};", 'if(channel===\'workspace-get\')return '+JSON.stringify(workspace)+';');
const moduleFixture={exports:{}};
vm.runInNewContext(source+'\nmodule.exports={server,fixture,chromium};',{require,__dirname,module:moduleFixture,process,URL});
const {server,fixture,chromium}=moduleFixture.exports;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.MOHIVX_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const lang of ['en','ar']){
  const ar=lang==='ar',context=await browser.newContext({viewport:{width:1180,height:800},screen:{width:1180,height:800}});
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await fixture(context,lang);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/?view=hub');
  const nav=page.getByRole('navigation',{name:ar?'أقسام الإعدادات':'Settings sections'}),dock=page.getByRole('navigation',{name:ar?'التنقل الرئيسي':'Main navigation'});
  await nav.getByRole('button',{name:ar?'الخصوصية':'Privacy',exact:true}).click();
  await page.waitForTimeout(300);
  assert.equal(Math.round((await page.locator('.companion-sidebar').boundingBox()).width),250);
  assert.equal(await page.getByTestId('companion-app').evaluate(el=>getComputedStyle(el).borderRadius),'26px');
  await page.screenshot({path:path.join(__dirname,`reference-settings-${lang}.png`)});
  await nav.getByRole('button',{name:ar?'التخصيص':'Customization',exact:true}).click();
  await page.getByRole('group',{name:ar?'حافة الجزيرة':'Island edge',exact:true}).getByRole('button',{name:ar?'يسار':'Left',exact:true}).click();
  assert.equal(await page.locator('.customization-preview').getAttribute('data-edge'),'left');
  await page.getByRole('button',{name:ar?'استعادة الكل':'Reset all',exact:true}).click();
  await page.locator('#island-glow-strength').fill('75');await page.locator('#island-glow-strength').dispatchEvent('change');
  assert((await page.locator('#island-glow-strength').boundingBox()).width>200,'glow slider should span its card');
  assert.equal(await page.getByTestId('companion-app').evaluate(el=>el.style.getPropertyValue('--character-glow-strength')),'0.75');
  const handle=page.getByRole('button',{name:ar?'اسحب لتغيير اتساع الإضاءة':'Drag glow spread',exact:true});
  const grip=await handle.boundingBox();await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2+35,grip.y+grip.height/2,{steps:6});await page.mouse.up();
  assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-settings')).islandGlowSpread>1),'preview handle persists a wider glow');
  await page.screenshot({path:path.join(__dirname,`reference-customization-${lang}.png`)});
  const strip=page.locator('.tab-order-strip');await strip.scrollIntoViewIfNeeded();
  const direction=await strip.evaluate(el=>getComputedStyle(el).direction);assert.equal(direction,ar?'rtl':'ltr');
  const from=strip.locator('[data-tab-id="apps"] button'),to=strip.locator('[data-tab-id="wallpaper"] button');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-settings')||'{}').tabOrder||['apps','controls','wallpaper']);
  const a=await from.boundingBox(),b=await to.boundingBox();assert(Math.abs(a.y-b.y)<2,'section order must be horizontal');
  if(ar)assert(a.x>b.x,'Arabic section order starts at the right');
  await from.dragTo(to);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-settings')||'{}').tabOrder?.[0]==='controls');
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-settings')).tabOrder);assert.notDeepEqual(after,before);
  assert.equal(await strip.getByRole('button',{name:/Move .* earlier|إلى الأعلى/}).count(),0);
  await nav.getByRole('button',{name:ar?'الإشعارات':'Notifications',exact:true}).click();
  await page.locator('#notice-width').fill('600');
  await page.locator('#notice-width').dispatchEvent('change');
  assert.equal(await page.locator('output[for="notice-width"]').textContent(),'600 px');
  await page.getByRole('button',{name:ar?'إظهار إشعار تجريبي':'Show test notification',exact:true}).click();
  assert(await page.evaluate(()=>window.__test.requests.some(r=>r.channel==='preview-island-notification')));
  await page.reload();await nav.getByRole('button',{name:ar?'الإشعارات':'Notifications',exact:true}).click();assert.equal(await page.locator('#notice-width').inputValue(),'600');
  await page.getByRole('button',{name:ar?'تكبير النافذة':'Maximize window',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.companion-app').dataset.maximized==='true');
  assert.equal(await page.getByTestId('companion-app').evaluate(el=>getComputedStyle(el).borderRadius),'0px');
  await page.getByRole('button',{name:ar?'استعادة حجم النافذة':'Restore window',exact:true}).click();
  await dock.getByRole('button',{name:ar?'الروح':'Soul',exact:true}).click();
  await page.waitForTimeout(400);
  const indicator=await dock.locator('.glass-dock-indicator').boundingBox(),active=await dock.locator('[aria-current="page"]').boundingBox();
  assert(Math.abs(indicator.x-active.x)<1&&Math.abs(indicator.width-active.width)<1,'glass indicator must align with the selected button');
  await page.locator('.loadout-content button').filter({hasText:ar?'الروح':'Soul'}).first().click();
  const carousel=page.getByRole('region',{name:ar?'مستعرض التجهيزات':'Loadout Carousel'});await carousel.waitFor();
  await carousel.getByRole('button',{name:ar?'العنصر التالي':'Next item'}).click();
  assert.equal(await page.getByTestId('companion-app').getAttribute('data-character'),'hitodama','browsing does not apply a card');
  await carousel.locator('.loadout-primary-btn').click();
  await page.waitForFunction(()=>document.querySelector('.companion-app').dataset.character==='ember');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-settings')));
  assert.equal(stored.theme,'custom');assert.equal(stored.customAccentColor,'#ff916d');
  assert.equal(await page.getByTestId('companion-app').evaluate(el=>el.style.getPropertyValue('--app-accent')),'#ff916d');
  await page.screenshot({path:path.join(__dirname,`reference-cards-${lang}.png`)});
  for(let i=0;i<4;i++)await carousel.getByRole('button',{name:ar?'العنصر التالي':'Next item'}).click();
  assert(await carousel.locator('.loadout-primary-btn').isDisabled(),'unowned card cannot be selected');
  assert.equal(await page.getByTestId('companion-app').getAttribute('data-character'),'ember');
  const stage=carousel.locator('.loadout-card-stage'),box=await stage.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+18);await page.mouse.down();await page.mouse.move(box.x+box.width/2+(ar?-100:100),box.y+18,{steps:8});await page.mouse.up();
  assert.equal(await carousel.locator('.loadout-carousel-counter').textContent(),'5 / 6');
  await carousel.focus();await page.keyboard.press('Escape');await carousel.waitFor({state:'detached'});
  await page.setViewportSize({width:700,height:560});await dock.getByRole('button',{name:ar?'الإعدادات':'Settings',exact:true}).click();
  await page.waitForTimeout(450);
  const resizedIndicator=await dock.locator('.glass-dock-indicator').boundingBox(),resizedActive=await dock.locator('[aria-current="page"]').boundingBox();
  assert(Math.abs(resizedIndicator.x-resizedActive.x)<1&&Math.abs(resizedIndicator.width-resizedActive.width)<1,'glass indicator stays aligned after resize');
  assert(await page.locator('.companion-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'resized settings must not overflow horizontally');
  await page.screenshot({path:path.join(__dirname,`reference-settings-small-${lang}.png`)});
  for(const name of ar?['الرئيسية','الرابطة','المكتب','الوكلاء','الهاتف','الاتصالات']:['Home','Bond','Desk','Agents','Phone','Connections']){
   await dock.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(80);
   assert(await page.locator('.companion-fullpage').isVisible(),'navigation content visible: '+name);
  }
  await page.close();
  const island=await context.newPage();island.on('pageerror',error=>errors.push(error.message));await island.goto(origin);await island.locator('[data-island-stage]').waitFor();
  await island.evaluate(()=>window.__test.save({animationSpeed:'smooth',islandScale:1,position:'top-center',theme:'original-blue',notificationWidth:600}));
  for(const tab of ['controls','power','apps']){
   const samples=await island.evaluate(async tab=>{window.__test.emit('open-island-tab',tab);const samples=[];for(let i=0;i<30;i++){await new Promise(requestAnimationFrame);const box=document.querySelector('[data-island-stage]').getBoundingClientRect();samples.push(box.x+box.width/2-innerWidth/2);}return samples;},tab);
   assert(Math.max(...samples.map(Math.abs))<1,'island centre must stay fixed during open/tab morph: '+JSON.stringify(samples));
  }
  await island.mouse.move(4,700);await island.waitForTimeout(50);
  assert(await island.evaluate(()=>window.__test.requests.filter(r=>r.channel==='set-ignore-mouse-events').at(-1)?.arg===true),'empty area must pass clicks through while open');
  await island.keyboard.press('Escape');await island.waitForTimeout(450);
  await island.evaluate(()=>window.__test.emit('island-notification',{id:'width-fixture',source:'mohivx',app:'MOHIVX Island',title:'Test card',body:'Width preview',time:Date.now()}));
  const notice=island.getByTestId('island-notification');await notice.waitFor();await island.waitForTimeout(400);assert(Math.abs((await notice.boundingBox()).width-600)<1);
  for(const position of ['top-left','top-right']){
   await island.evaluate(position=>window.__test.save({position}),position);await island.waitForTimeout(400);
   const placement=await island.locator('[data-island-stage]').evaluate(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,width:innerWidth};});
   assert(Math.abs(position==='top-left'?placement.left-12:placement.width-placement.right-12)<1,'legacy top corner remains anchored: '+position);
  }
  assert.deepEqual(errors,[]);await context.close();console.log('Reference UI accepted: '+lang+'; horizontal drag, saved width/test IPC, resize/restore, glass alignment, character theme/cards, locked inventory, swipe and stationary island.');
 }}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;server.close();}).finally(()=>{assert(path.resolve(fixtureDir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(fixtureDir,{recursive:true,force:true});});
