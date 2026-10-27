// Focused headless browser verification for Stage 2B (opt-in contact-name resolution, call history, and ACTION_DIAL handoff) in English and Arabic.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MOHIVX_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../dist');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://local').pathname;
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 try{
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
  res.end(fs.readFileSync(file));
 }catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.MOHIVX_TEST_BROWSER||undefined});
 try{
  for(const lang of ['en','ar']){
   const context=await browser.newContext({viewport:{width:1080,height:760}});
   await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   await context.addInitScript(({lang})=>{
    const listeners=new Map(),requests=[];
    let settings={appLang:lang,theme:'original-blue',phoneCameraDevice:'fixture-phone',phoneMicAuto:true};
    const phone={id:'fixture-phone',name:'Fixture phone',capabilities:['telemetry','phoneData','phoneMessages']};
    let phonePerms={messagesRead:true,messagesSend:true,contactsRead:false,callsRead:false};
    const emit=(channel,value)=>{for(const callback of listeners.get(channel)||[])callback(null,value);};
    const ipc={
     on:(channel,fn)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel).add(fn);},
     removeListener:(channel,fn)=>listeners.get(channel)?.delete(fn),
     send:(channel,arg)=>requests.push({channel,arg}),
     invoke:async(channel,arg)=>{
      requests.push({channel,arg});
      if(channel==='get-app-settings')return settings;
      if(channel==='update-app-settings'){settings={...settings,...arg};emit('app-settings-updated',settings);return settings;}
      if(channel==='get-hub-tab')return 'phone';
      if(channel==='get-app-version')return '1.1.3';
      if(channel==='get-app-update-status')return {state:'idle',supported:false,currentVersion:'1.1.3'};
      if(channel==='android-status')return {enabled:true,devices:[phone],hosts:['127.0.0.1'],port:9120};
      if(channel==='android-capabilities'){phone.capabilities=arg.capabilities;return {enabled:true,devices:[phone],hosts:['127.0.0.1'],port:9120};}
      if(channel==='phone-sync-status')return {
       at:Date.now(),
       status:{
        notifications:true,photos:true,folder:true,
        messagesRead:phonePerms.messagesRead,messagesSend:phonePerms.messagesSend,
        contactsRead:phonePerms.contactsRead,callsRead:phonePerms.callsRead,
        capture:[],controlEnabled:false,battery:88,charging:false,name:phone.name,model:'Fixture Android',connection:'wifi'
       },
       notifications:[]
      };
      if(channel==='phone-command'){
       if(arg.command.type==='messages.threads')return {items:[{threadId:'101',address:'+15550100',preview:'SMS unchanged check',date:Date.now()-60000,unread:false}],next:0};
       if(arg.command.type==='calls.list')return {
        items:[
         {id:'901',number:'+15550100',type:'incoming',date:Date.now()-120000,duration:95},
         {id:'902',number:'+966550100000',type:'missed',date:Date.now()-60000,duration:0}
        ],
        next:0
       };
       if(arg.command.type==='contacts.resolve')return {
        contacts:{
         '+15550100':lang==='ar'?'سارة':'Sarah Connor',
         '+966550100000':lang==='ar'?'خالد':'Khalid'
        }
       };
       if(arg.command.type==='calls.dial')return {opened:true,needsTap:false};
       return {items:[],next:0};
      }
      if(channel==='phone-media-status')return [];
      if(channel==='phone-camera-status')return {installed:false};
      if(channel==='phone-mic-status')return {success:true,name:'MOHIV Mic',installed:true,ready:true,setup:{state:'ready',code:'0',error:'',canRetry:false},route:{active:false,device:'',name:'MOHIV Mic',error:''},automatic:true};
      if(channel==='phone-audio-devices')return {success:true,devices:[]};
      if(channel==='get-displays')return [];
      if(channel==='get-shortcuts')return {};
      if(channel==='get-real-telemetry')return {cpu:{model:'Fixture CPU'},gpu:{model:'Fixture GPU'},ram:{used:'8 GB'}};
      if(channel==='get-audio-state')return {unavailable:true};
      if(channel==='remote-status')return {enabled:false};
      if(channel==='get-coding-agents-status')return {sessions:[],pendingApprovals:[],hookIntegrations:[]};
      return null;
     }
    };
    window.require=()=>({ipcRenderer:ipc});
    window.__phoneCallsTest={
     requests,
     setPhonePerms:patch=>{phonePerms={...phonePerms,...patch};}
    };
   },{lang});

   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin+'/?view=hub');
   const ar=lang==='ar';
   await page.getByRole('heading',{name:ar?'هاتفك، جزء من الكمبيوتر.':'Your phone. Part of your PC.'}).waitFor();

   // Verify SMS remains unchanged
   await page.getByRole('button',{name:ar?'رسائل SMS':'SMS',exact:true}).click();
   await page.getByText('SMS unchanged check',{exact:true}).waitFor();

   // Switch to Calls tab before enabling phoneCalls capability
   await page.getByRole('button',{name:ar?'المكالمات':'Calls',exact:true}).click();
   await page.getByText(
    ar?'فعّل «سجل المكالمات وفتح الاتصال» في صلاحيات الاتصال على الكمبيوتر.':'Enable Call history and dialer in the connection permissions on your PC.',
    {exact:true}
   ).waitFor();
   assert.equal(await page.getByRole('button',{name:ar?'فتح في لوحة اتصال الهاتف':'Open in phone dialer',exact:true}).isDisabled(),true);

   // Enable phoneCalls capability in Connection and permissions (leave phoneContacts off first)
   await page.getByText(ar?'الاتصال والصلاحيات':'Connection and permissions',{exact:true}).click();
   const callsCapCheckbox=page.getByRole('checkbox',{name:ar?'سجل المكالمات وفتح الاتصال':'Call history and dialer'});
   const contactsCapCheckbox=page.getByRole('checkbox',{name:ar?'أسماء جهات الاتصال':'Contact names'});
   assert.equal(await callsCapCheckbox.isChecked(),false);
   assert.equal(await contactsCapCheckbox.isChecked(),false);
   await callsCapCheckbox.click();
   assert.equal(await callsCapCheckbox.isChecked(),true);

   // With phoneCalls enabled on PC but READ_CALL_LOG not granted on Android yet, honest restricted-permission hint shows and ACTION_DIAL dialer form still works
   await page.getByText(
    ar
     ?'اسمح بصلاحية سجل المكالمات من قسم الهاتف في أندرويد لعرض المكالمات الأخيرة. يصنّف أندرويد صلاحية READ_CALL_LOG كصلاحية مقيّدة وقد يمنعها في APK مثبّت يدويًا؛ ويظل فتح الأرقام في لوحة اتصال الهاتف متاحًا أدناه.'
     :'Allow call history in Phone on Android to view recent calls. Android marks READ_CALL_LOG as a restricted permission and may block it for a manually installed APK; opening numbers in the phone dialer below remains available.',
    {exact:true}
   ).waitFor();
   const dialInput=page.getByRole('textbox',{name:ar?'رقم الهاتف للاتصال':'Phone number to dial'});
   await dialInput.fill('+15550199');
   await page.getByRole('button',{name:ar?'فتح في لوحة اتصال الهاتف':'Open in phone dialer',exact:true}).click();
   await page.getByText(
    ar?'فُتح الرقم في لوحة اتصال الهاتف. أكّد المكالمة من أندرويد.':'Number opened in your phone dialer. Confirm the call on Android.',
    {exact:true}
   ).waitFor();
   assert.deepEqual(
    await page.evaluate(()=>window.__phoneCallsTest.requests.find(r=>r.channel==='phone-command'&&r.arg.command.type==='calls.dial')?.arg),
    {device:'fixture-phone',command:{type:'calls.dial',number:'+15550199'}}
   );

   // Grant READ_CALL_LOG on Android while phoneContacts is still off -> call history numbers load, no contact names resolved
   await page.evaluate(()=>window.__phoneCallsTest.setPhonePerms({callsRead:true}));
   await page.getByText('+15550100',{exact:true}).waitFor();
   await page.getByText('+966550100000',{exact:true}).waitFor();
   assert.equal(
    await page.evaluate(()=>window.__phoneCallsTest.requests.filter(r=>r.channel==='phone-command'&&r.arg.command.type==='contacts.resolve').length),
    0,
    'contacts.resolve must not run when phoneContacts capability is disabled'
   );
   assert.equal(await page.getByText(ar?'سارة':'Sarah Connor',{exact:true}).count(),0);

   // Enable phoneContacts on PC while Android contactsRead is still false -> prompts to allow contact names on Android
   await contactsCapCheckbox.click();
   assert.equal(await contactsCapCheckbox.isChecked(),true);
   await page.getByText(
    ar
     ?'اسمح بصلاحية أسماء جهات الاتصال من قسم الهاتف في أندرويد لإظهار الأسماء المحفوظة لأرقام المكالمات.'
     :'Allow contact names in Phone on Android to resolve call numbers to saved contact names.',
    {exact:true}
   ).waitFor();

   // Grant READ_CONTACTS on Android -> contacts.resolve runs and displays contact names
   await page.evaluate(()=>window.__phoneCallsTest.setPhonePerms({contactsRead:true}));
   await page.getByText(ar?'سارة':'Sarah Connor',{exact:true}).waitFor();
   await page.getByText(ar?'خالد':'Khalid',{exact:true}).waitFor();
   assert.deepEqual(
    await page.evaluate(()=>window.__phoneCallsTest.requests.find(r=>r.channel==='phone-command'&&r.arg.command.type==='contacts.resolve')?.arg),
    {device:'fixture-phone',command:{type:'contacts.resolve',numbers:['+15550100','+966550100000']}}
   );

   // Turn off phoneContacts capability -> resolved contact names are cleared immediately
   await contactsCapCheckbox.click();
   assert.equal(await contactsCapCheckbox.isChecked(),false);
   await page.waitForFunction(name=>!document.body.innerText.includes(name),ar?'سارة':'Sarah Connor');
   assert.equal(await page.getByText(ar?'سارة':'Sarah Connor',{exact:true}).count(),0);

   assert.deepEqual(errors,[]);
   await context.close();
   console.log('Stage 2B phone calls and contacts UI accepted: '+lang);
  }
 }finally{
  await browser.close();
 }
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>server.close());
