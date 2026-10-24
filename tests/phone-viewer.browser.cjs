const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.MOHIVX_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../dist');
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname,file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.MOHIVX_TEST_BROWSER||undefined});
 try{for(const lang of ['en','ar']){
  const context=await browser.newContext({viewport:{width:460,height:820}});await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await context.addInitScript(({lang})=>{
   const listeners=new Map(),requests=[];let maximized=false,pinned=false,held=null,delayed=false;
   let frame={device:'fixture-phone',kind:'screen',sequence:1,at:Date.now(),width:720,height:1600,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='};
   const emit=value=>{for(const callback of listeners.get('phone-media-updated')||[])callback(null,value);};
   const ipc={on:(channel,fn)=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel).add(fn);},removeListener:(channel,fn)=>listeners.get(channel)?.delete(fn),invoke:async(channel,arg)=>{
    requests.push({channel,arg});if(channel==='get-app-settings')return {appLang:lang};if(channel==='desktop-window-state')return {maximized,pinned};
    if(channel==='desktop-window-action'){if(arg==='maximize')maximized=!maximized;if(arg==='pin')pinned=!pinned;return {maximized,alwaysOnTop:pinned};}
    if(channel==='phone-media-get'){const value=frame;if(delayed){delayed=false;return new Promise(resolve=>held=()=>resolve(value));}return value;}
    if(channel==='phone-media-stop'){frame=null;emit({device:'fixture-phone',kind:'screen',stopped:true});return {success:true};}return null;
   }};window.require=()=>({ipcRenderer:ipc});window.__viewerTest={requests,hold:()=>{delayed=true;frame={...frame,sequence:2,at:Date.now()};emit({...frame,dataUrl:undefined});},release:()=>held?.(),held:()=>Boolean(held),stop:()=>{frame=null;emit({device:'fixture-phone',kind:'screen',stopped:true});}};
  },{lang});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/?view=phone-viewer&device=fixture-phone&kind=screen');const ar=lang==='ar';
  await page.getByAltText(ar?'شاشة الهاتف المباشرة':'Live phone screen').waitFor();
  await page.getByRole('button',{name:ar?'تكبير النافذة':'Maximize window'}).click();await page.getByRole('button',{name:ar?'استعادة حجم النافذة':'Restore window'}).waitFor();
  await page.getByRole('button',{name:ar?'البقاء في المقدمة':'Keep on top'}).click();assert.equal(await page.getByRole('button',{name:ar?'البقاء في المقدمة':'Keep on top'}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:ar?'ملء النافذة':'Fill window'}).click();assert.equal(await page.locator('.phone-viewer-canvas img').evaluate(el=>getComputedStyle(el).objectFit),'cover');
  await page.setViewportSize({width:800,height:500});const bounds=await page.locator('.phone-viewer-toolbar').boundingBox();assert.ok(bounds.y+bounds.height<=500,'toolbar must remain visible after resizing');
  await page.evaluate(()=>window.__viewerTest.hold());await page.waitForFunction(()=>window.__viewerTest.held());await page.evaluate(()=>window.__viewerTest.stop());await page.getByRole('heading',{name:ar?'بانتظار هاتفك':'Waiting for your phone'}).waitFor();await page.evaluate(()=>window.__viewerTest.release());await page.waitForTimeout(120);assert.equal(await page.locator('.phone-viewer-canvas img').count(),0,'late IPC frames cannot restore stopped sharing');
  await page.getByRole('button',{name:ar?'تصغير النافذة':'Minimize window'}).click();assert(await page.evaluate(()=>window.__viewerTest.requests.some(r=>r.channel==='desktop-window-action'&&r.arg==='minimize')));
  assert.equal(await page.evaluate(()=>window.__viewerTest.requests.filter(r=>['phone-camera-install','remote-start'].includes(r.channel)).length),0);assert.deepEqual(errors,[]);await context.close();console.log('Separate live viewer, window controls, resize and stop-race accepted: '+lang);
 }}finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>server.close());
