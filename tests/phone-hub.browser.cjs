// Runs in an isolated headless browser. IPC is a fixture; no Windows devices are changed.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MOHIVX_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../dist');
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname;const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.MOHIVX_TEST_BROWSER||undefined});
 try{for(const lang of ['en','ar']){
  const context=await browser.newContext({viewport:{width:1080,height:760}});await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await context.addInitScript(({lang})=>{
   const listeners=new Map(),requests=[];let settings={appLang:lang,theme:'original-blue',phoneCameraDevice:'fixture-phone',phoneMicAuto:true};
   let shortcuts={'trigger-lasso':'Alt+Shift+S','trigger-dictation':'Alt+J','open-apps':'Alt+A'};
   let micStatus={success:true,name:'MOHIV Mic',installed:true,ready:false,setup:{state:'installing',code:'',error:'',canRetry:false},route:{active:false,device:'',name:'MOHIV Mic',error:''},automatic:true};
   const retryPlan=[
    {success:false,code:'0x80070005',error:'Administrator access was denied while configuring MOHIV Mic (0x80070005).',setup:{state:'failed',code:'0x80070005',error:'Administrator access was denied while configuring MOHIV Mic (0x80070005).',canRetry:true}},
    {success:true,restartRequired:true,code:'3010',setup:{state:'restart-required',code:'3010',error:'',canRetry:false}},
    {success:true,code:'0',ready:true,setup:{state:'ready',code:'0',error:'',canRetry:false}}
   ];
   const phone={id:'fixture-phone',name:'Fixture phone',capabilities:['telemetry','phoneScreen','phoneCamera','phoneMic','remoteInput','desktopView','phoneData','phoneControl']};let smsPerms={messagesRead:false,messagesSend:false};let frames=[{device:phone.id,kind:'screen',sequence:1,at:Date.now(),dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='}];
   const emit=(channel,value)=>{for(const callback of listeners.get(channel)||[])callback(null,value);};
   const ipc={on:(channel,fn)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel).add(fn);},removeListener:(channel,fn)=>listeners.get(channel)?.delete(fn),send:(channel,arg)=>requests.push({channel,arg}),invoke:async(channel,arg)=>{
    requests.push({channel,arg});if(channel==='get-app-settings')return settings;if(channel==='update-app-settings'){settings={...settings,...arg};if(arg.phoneMicAuto===false){micStatus={...micStatus,automatic:false,route:{...micStatus.route,active:false,device:'',error:''}};emit('phone-mic-route-updated',micStatus.route);}emit('app-settings-updated',settings);return settings;}if(channel==='get-hub-tab')return 'phone';if(channel==='get-app-version')return '1.5.1';if(channel==='get-app-update-status')return {state:'idle',supported:false,currentVersion:'1.5.1'};if(channel==='android-status')return {enabled:true,devices:[phone],hosts:['127.0.0.1'],port:9120};if(channel==='android-capabilities'){phone.capabilities=arg.capabilities;return {enabled:true,devices:[phone],hosts:['127.0.0.1'],port:9120};}if(channel==='phone-sync-status')return {at:Date.now(),status:{notifications:true,photos:true,folder:true,messagesRead:smsPerms.messagesRead,messagesSend:smsPerms.messagesSend,capture:['screen'],controlEnabled:true,battery:90,charging:true,name:phone.name,model:'Fixture Android',connection:'wifi'},notifications:[{id:'fixture-notification',app:'Messages',title:'New SMS',text:'Can you reply?',at:Date.now(),sms:true,replyAvailable:true}]};if(channel==='phone-command'){if(arg.command.type==='apps.list')return {items:[{packageName:'com.android.calculator2',name:'Calculator'},{packageName:'com.android.settings',name:'Settings'}],next:0};if(arg.command.type==='apps.launch')return {needsTap:true};if(arg.command.type==='notifications.reply')return {submitted:true};if(arg.command.type==='messages.threads')return {items:[{threadId:'101',address:'+15550100',preview:'Are you at your desk?',date:Date.now()-60000,unread:true}],next:0};if(arg.command.type==='messages.list')return {items:[{id:'501',address:'+15550100',text:'Are you at your desk?',date:Date.now()-60000,direction:'incoming'},{id:'502',address:'+15550100',text:'On my PC now.',date:Date.now()-30000,direction:'outgoing'}],next:0};if(arg.command.type==='messages.send')return {submitted:true};if(arg.command.type==='files.list')throw Error("Error invoking remote method 'phone-command': Error: Choose a shared folder in the phone app first.");return {items:[{id:'fixture-file',name:'Fixture file',size:12,directory:false}],next:0};}if(channel==='phone-media-status')return frames;if(channel==='phone-media-get')return frames.find(f=>f.kind===arg.kind&&f.device===arg.device)||null;if(channel==='phone-camera-status')return {installed:false};if(channel==='phone-mic-status')return {...micStatus,automatic:settings.phoneMicAuto!==false};if(channel==='phone-mic-setup'){const next=retryPlan.shift()||{success:true,ready:true,setup:{state:'ready',code:'0',error:'',canRetry:false}};micStatus={...micStatus,installed:true,ready:Boolean(next.ready),setup:next.setup};return {...next,status:{...micStatus,automatic:settings.phoneMicAuto!==false}};}if(channel==='phone-media-stop'){frames=frames.filter(f=>f.kind!==arg.kind);emit('phone-media-updated',{...arg,stopped:true});return {success:true};}if(channel==='phone-audio-devices')return {success:true,devices:[]};if(channel==='get-displays')return [];if(channel==='get-shortcuts')return shortcuts;if(channel==='update-shortcut'){shortcuts={...shortcuts,[arg.action]:arg.shortcut};return {success:true,shortcuts};}if(channel==='get-real-telemetry')return {cpu:{model:'Fixture CPU'},gpu:{model:'Fixture GPU'},ram:{used:'8 GB'}};if(channel==='get-audio-state')return {unavailable:true};if(channel==='remote-status')return {enabled:false};if(channel==='get-coding-agents-status')return {sessions:[],pendingApprovals:[],hookIntegrations:[]};return null;
   }};window.require=()=>({ipcRenderer:ipc});window.__phoneTest={requests,setSmsPerms:patch=>{smsPerms={...smsPerms,...patch};},setMicStatus:patch=>{micStatus={...micStatus,...patch};emit('phone-mic-status-updated',micStatus);},setMicRoute:route=>{micStatus={...micStatus,route:{...micStatus.route,...route}};emit('phone-mic-route-updated',micStatus.route);}};
  },{lang});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/?view=hub');
  const ar=lang==='ar';await page.getByRole('heading',{name:ar?'هاتفك، جزء من الكمبيوتر.':'Your phone. Part of your PC.'}).waitFor();

  await page.getByRole('button',{name:ar?'فتح النافذة':'Open window',exact:true}).first().click();
  assert.deepEqual(await page.evaluate(()=>window.__phoneTest.requests.find(r=>r.channel==='phone-viewer-open').arg),{device:'fixture-phone',kind:'screen'});
  await page.getByRole('button',{name:ar?'إيقاف المشاركة':'Stop sharing',exact:true}).first().click();
  assert.equal(await page.getByAltText(ar?'شاشة الهاتف':'Phone screen').count(),0,'stopping phone screen sharing clears preview');
  assert.equal(await page.evaluate(()=>window.__phoneTest.requests.filter(r=>['phone-mic-setup','phone-camera-install','phone-camera-remove','remote-start'].includes(r.channel)).length),0,'viewing Phone must not install a device or publish a tunnel');
  const disconnectCamera=page.getByRole('button',{name:ar?'فصل مسار الكاميرا':'Disconnect camera route'});assert.equal(await disconnectCamera.isEnabled(),true);await disconnectCamera.click();

  await page.getByRole('button',{name:ar?'التطبيقات':'Apps',exact:true}).click();
  await page.getByRole('button',{name:/Calculator/}).waitFor();
  const appSearch=page.getByPlaceholder(ar?'ابحث في تطبيقات الهاتف':'Search phone apps');
  await appSearch.fill('com.android.settings');
  assert.equal(await page.getByRole('button',{name:/Calculator/}).count(),0,'phone app search filters the list locally');
  await page.getByRole('button',{name:/com\.android\.settings/}).waitFor();
  await appSearch.fill('');
  await page.getByRole('button',{name:/Calculator/}).click();
  await page.getByText(ar?'أُرسل طلب الفتح إلى هاتفك. اضغط عليه للمتابعة.':'Open request sent to your phone. Tap it to continue.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__phoneTest.requests.find(r=>r.channel==='phone-command'&&r.arg.command.type==='apps.launch')?.arg),{device:'fixture-phone',command:{type:'apps.launch',packageName:'com.android.calculator2'}});

  await page.getByRole('button',{name:ar?'الملفات':'Files',exact:true}).click();
  await page.getByText(ar?'اختر مجلدًا مشتركًا من تطبيق الهاتف على أندرويد أولًا.':'Choose a shared folder in Phone on Android first.',{exact:true}).waitFor();
  assert.equal(await page.getByText(/Error invoking remote method/).count(),0,'phone IPC wrapper details must not leak into the UI');

  await page.getByRole('button',{name:ar?'الإشعارات':'Notifications',exact:true}).click();
  const reply=page.getByRole('textbox',{name:ar?'رد سريع':'Quick reply'}).first();
  await reply.fill(ar?'مرحبا':'Thanks');
  await page.getByRole('button',{name:ar?'إرسال':'Send',exact:true}).click();
  await page.getByText(ar?'أُرسل الرد إلى تطبيق الهاتف.':'Reply handed to the phone app.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__phoneTest.requests.find(r=>r.channel==='phone-command'&&r.arg.command.type==='notifications.reply')?.arg),{device:'fixture-phone',command:{type:'notifications.reply',notificationId:'fixture-notification',text:ar?'مرحبا':'Thanks'}});

  await page.getByRole('button',{name:ar?'رسائل SMS':'SMS',exact:true}).click();
  await page.getByText(ar?'فعّل «سجل رسائل SMS وإرسالها» في صلاحيات الاتصال على الكمبيوتر.':'Enable SMS history and sending in the connection permissions on your PC.',{exact:true}).waitFor();
  await page.getByText(ar?'الاتصال والصلاحيات':'Connection and permissions',{exact:true}).click();
  const smsCapCheckbox=page.getByRole('checkbox',{name:ar?'سجل رسائل SMS وإرسالها':'SMS history and sending'});
  assert.equal(await smsCapCheckbox.isChecked(),false);
  await smsCapCheckbox.click();
  assert.equal(await smsCapCheckbox.isChecked(),true);
  await page.getByText(ar?'اسمح بصلاحية SMS من قسم الهاتف في أندرويد لقراءة سجل المحادثات وإرسال الرسائل النصية. يصنّف أندرويد صلاحيتي READ_SMS وSEND_SMS كصلاحيات مقيّدة وقد يمنعهما في APK مثبّت يدويًا؛ ويظل الرد السريع متاحًا في قسم الإشعارات.':'Allow SMS access in Phone on Android to read conversation history and send texts. Android marks READ_SMS and SEND_SMS as restricted permissions and may block them for a manually installed APK; notification quick replies in Notifications remain available.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:ar?'إرسال SMS':'Send SMS',exact:true}).isDisabled(),true);

  await page.evaluate(()=>window.__phoneTest.setSmsPerms({messagesRead:true,messagesSend:true}));
  await page.getByText('+15550100',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__phoneTest.requests.filter(r=>r.channel==='phone-command'&&r.arg.command.type==='messages.threads').length),1,'entering SMS loads threads once');
  await page.getByRole('button',{name:/\+15550100/}).click();
  await page.getByText('On my PC now.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__phoneTest.requests.find(r=>r.channel==='phone-command'&&r.arg.command.type==='messages.list')?.arg),{device:'fixture-phone',command:{type:'messages.list',threadId:'101',offset:0}});
  const smsInput=page.getByRole('textbox',{name:ar?'رسالة SMS':'SMS message'});
  await smsInput.fill(ar?'أرسل من الكمبيوتر':'Replying from PC');
  await page.getByRole('button',{name:ar?'إرسال SMS':'Send SMS',exact:true}).click();
  await page.getByText(ar?'أُرسلت رسالة SMS إلى هاتفك لإرسالها.':'SMS handed to your phone for sending.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__phoneTest.requests.find(r=>r.channel==='phone-command'&&r.arg.command.type==='messages.send')?.arg),{device:'fixture-phone',command:{type:'messages.send',address:'+15550100',text:ar?'أرسل من الكمبيوتر':'Replying from PC'}});

  // Automatic setup progress state: no normal Set up MOHIV Mic button or retry button while installing
  await page.getByText(ar?'جارٍ تجهيز MOHIV Mic تلقائيًا…':'Setting up MOHIV Mic automatically…',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:ar?'تجهيز MOHIV Mic':'Set up MOHIV Mic',exact:true}).count(),0,'manual setup button must not exist');
  const retryMic=page.getByRole('button',{name:ar?'إعادة محاولة تجهيز المايك':'Retry microphone setup',exact:true});
  assert.equal(await retryMic.count(),0,'retry button hidden while automatic setup runs');

  // Cancelled automatic setup surfaces honest state and enables error-recovery retry
  await page.evaluate(()=>window.__phoneTest.setMicStatus({ready:false,setup:{state:'cancelled',code:'1223',error:'Windows microphone setup was cancelled.',canRetry:true}}));
  await page.getByText(ar?'أُلغي التجهيز التلقائي للمايك':'Automatic microphone setup was cancelled',{exact:true}).waitFor();
  assert.equal(await retryMic.isEnabled(),true);

  // Retry 1 -> diagnostic HRESULT failure (0x80070005), retry remains available
  await retryMic.click();
  await page.getByText(ar?'تعذر التجهيز التلقائي للمايك':'Automatic microphone setup failed',{exact:true}).waitFor();
  await page.getByRole('alert').filter({hasText:'0x80070005'}).waitFor();
  assert.equal(await retryMic.isEnabled(),true);

  // Retry 2 -> restart required (3010), must not mark ready
  await retryMic.click();
  await page.getByText(ar?'أعد تشغيل ويندوز لإكمال تجهيز MOHIV Mic':'Restart Windows to finish MOHIV Mic setup',{exact:true}).waitFor();
  await page.getByRole('alert').filter({hasText:ar?'أعد تشغيل ويندوز لإكمال تجهيز MOHIV Mic.':'Restart Windows to finish setting up MOHIV Mic.'}).waitFor();
  assert.equal(await page.getByText(ar?'جاهز في ويندوز':'Ready in Windows',{exact:true}).count(),0,'pending restart must not mark MOHIV Mic ready');

  // Transition to failed, then Retry 3 -> ready in Windows
  await page.evaluate(()=>window.__phoneTest.setMicStatus({ready:false,setup:{state:'failed',code:'1',error:'Windows could not finish MOHIV Mic setup (code 1).',canRetry:true}}));
  await retryMic.click();
  await page.getByRole('alert').filter({hasText:ar?'MOHIV Mic جاهز. شغّل المايك من الهاتف.':'MOHIV Mic is ready. Start the microphone on your phone.'}).waitFor();
  await page.getByText(ar?'جاهز في ويندوز':'Ready in Windows',{exact:true}).waitFor();
  assert.equal(await retryMic.count(),0);
  assert.equal(await page.evaluate(()=>window.__phoneTest.requests.filter(r=>r.channel==='phone-mic-setup').length),3);
  await page.getByText(ar?'بانتظار مشاركة المايك من الهاتف.':'Waiting for microphone sharing from the phone.',{exact:true}).waitFor();

  await page.evaluate(()=>window.__phoneTest.setMicRoute({active:true,device:'fixture-phone',error:''}));
  await page.getByText(ar?'مايك هاتفك متصل الآن بـ MOHIV Mic.':'Your phone microphone is connected to MOHIV Mic.',{exact:true}).waitFor();
  await page.evaluate(()=>window.__phoneTest.setMicRoute({active:false,device:'',error:''}));
  await page.getByText(ar?'بانتظار مشاركة المايك من الهاتف.':'Waiting for microphone sharing from the phone.',{exact:true}).waitFor();

  const autoMic=page.getByRole('checkbox',{name:ar?'اتصال تلقائي عند مشاركة مايك الهاتف':'Connect automatically when the phone shares its microphone'});
  assert.equal(await autoMic.isChecked(),true);
  await autoMic.click();
  assert.equal(await autoMic.isChecked(),false);
  assert.equal(await page.evaluate(()=>window.__phoneTest.requests.filter(r=>r.channel==='update-app-settings'&&'phoneMicAuto' in r.arg).at(-1).arg.phoneMicAuto),false);
  await page.getByText(ar?'الاتصال التلقائي للمايك متوقف.':'Automatic microphone connection is off.',{exact:true}).waitFor();

  await page.getByText(ar?'عن مكوّن الصوت':'Audio component credits',{exact:true}).click();
  await page.getByRole('button',{name:ar?'VB-Audio · المصدر والتبرع':'VB-Audio · source and donations',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__phoneTest.requests.find(r=>r.channel==='open-external-link')?.arg),'https://vb-audio.com/Cable/');

  await page.getByRole('button',{name:ar?'الإعدادات':'Settings',exact:true}).click();
  for(const name of ar?['التخصيص','الاختصارات','السلوك','النظام','مفاتيح API','بياناتك','الصلاحيات','الخصوصية']:['Customization','Shortcuts','Behavior','System','API keys','Your data','Permissions','Privacy']){await page.getByRole('navigation',{name:ar?'أقسام الإعدادات':'Settings sections'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{name,exact:true}).waitFor();}
  await page.getByRole('navigation',{name:ar?'أقسام الإعدادات':'Settings sections'}).getByRole('button',{name:ar?'الاختصارات':'Shortcuts',exact:true}).click();
  const lassoButton=page.getByRole('button',{name:'Alt + Shift + S',exact:true});await lassoButton.click();await page.keyboard.press('Control+Alt+KeyG');
  await page.getByRole('button',{name:'Ctrl + Alt + G',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__phoneTest.requests.find(r=>r.channel==='update-shortcut')?.arg),{action:'trigger-lasso',shortcut:'Control+Alt+G'});
  await page.getByRole('navigation',{name:ar?'أقسام الإعدادات':'Settings sections'}).getByRole('button',{name:ar?'التخصيص':'Customization',exact:true}).click();
  const sizeGroup=page.getByRole('group',{name:ar?'حجم الجزيرة مع الموسيقى':'Island size during music',exact:true});await sizeGroup.getByRole('button',{name:ar?'تبقى بحجمها':'Keep its size'}).click();assert.equal(await sizeGroup.getByRole('button',{name:ar?'تبقى بحجمها':'Keep its size'}).getAttribute('aria-pressed'),'true');
  const musicGroup=page.getByRole('group',{name:ar?'شكل الموسيقى':'Music appearance',exact:true});await musicGroup.getByRole('button',{name:ar?'خطوط من الحافة':'Lines from the edge'}).click();assert.equal(await page.evaluate(()=>window.__phoneTest.requests.filter(r=>r.channel==='update-app-settings'&&r.arg.musicTheme).at(-1).arg.musicTheme),'edge-bars');
  await musicGroup.getByRole('button',{name:ar?'الشكل السابق':'Previous look'}).click();await musicGroup.getByRole('button',{name:ar?'فقاعة منفصلة':'Separate bubble'}).click();
  if(process.env.MOHIVX_MUSIC_SETTINGS_SCREENSHOT&&ar)await page.screenshot({path:process.env.MOHIVX_MUSIC_SETTINGS_SCREENSHOT});
  const widthSlider=page.getByRole('slider',{name:ar?'عرض الجزيرة':'Island width',exact:true});await widthSlider.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>window.__phoneTest.requests.filter(r=>r.channel==='update-app-settings'&&r.arg.islandWidthScale).at(-1).arg.islandWidthScale),1.05);
  const heightSlider=page.getByRole('slider',{name:ar?'ارتفاع الجزيرة':'Island height',exact:true});await heightSlider.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>window.__phoneTest.requests.filter(r=>r.channel==='update-app-settings'&&r.arg.islandHeightScale).at(-1).arg.islandHeightScale),1.05);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert(overflow<=1,'hub must stay within its viewport');
  await page.getByRole('button',{name:ar?'الهاتف':'Phone',exact:true}).click();
  assert.equal(await page.getByRole('checkbox',{name:ar?'اتصال تلقائي عند مشاركة مايك الهاتف':'Connect automatically when the phone shares its microphone'}).isChecked(),false,'automatic toggle state must persist across navigation');
  await page.getByRole('checkbox',{name:ar?'اتصال تلقائي عند مشاركة مايك الهاتف':'Connect automatically when the phone shares its microphone'}).click();
  assert.equal(await page.evaluate(()=>window.__phoneTest.requests.filter(r=>r.channel==='update-app-settings'&&'phoneMicAuto' in r.arg).at(-1).arg.phoneMicAuto),true);
  await page.setViewportSize({width:800,height:600});await page.waitForTimeout(100);assert(await page.locator('.companion-dock').isVisible());assert.deepEqual(errors,[]);
  if(process.env.MOHIVX_PHONE_SCREENSHOT&&lang==='en')await page.screenshot({path:process.env.MOHIVX_PHONE_SCREENSHOT});await context.close();console.log('Phone hub and settings accepted: '+lang);
 }}finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>server.close());
