const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {combineInventory,scanShortcuts,readStartApps,createAppInventory}=require('../electron/services/appInventory.cjs');
const {mergeAppEntries}=require('../electron/services/appEntries.mjs');
test('Store ChatGPT is discoverable without a Start Menu .lnk',()=>{
 const result=combineInventory([],[{Name:'ChatGPT',AppID:'OpenAI.Codex_family!App'}]);
 assert.equal(result.length,1);assert.equal(result[0].path,'shell:AppsFolder\\OpenAI.Codex_family!App');
});
test('same target and arguments merge shortcut aliases, but browser profiles remain separate',()=>{
 const links=[{name:'Editor',path:'C:/A/editor.lnk',target:'C:/Apps/Code.exe',args:''},{name:'VS Code',path:'C:/B/EDITOR.LNK',target:'c:\\apps\\code.EXE',args:''},{name:'Browser work',target:'C:/Browser.exe',args:'--profile-directory=Work'},{name:'Browser personal',target:'C:/Browser.exe',args:'--profile-directory=Personal'}];
 assert.equal(combineInventory(links,[]).length,3);
});
test('different applications sharing a display name are retained',()=>{
 assert.equal(mergeAppEntries([{name:'Viewer',target:'C:/One/viewer.exe'},{name:'Viewer',target:'C:/Two/viewer.exe'}]).length,2);
});
test('AUMID unifies Store aliases and metadata bridges shortcut identities',()=>{
 const result=combineInventory([{name:'ChatGPT',path:'C:/chat.lnk',appId:'OpenAI.Chat!App'}],[{Name:'ChatGPT',AppID:'OpenAI.Chat!App'},{Name:'ChatGPT desktop',AppID:'openai.chat!app'}]);assert.equal(result.length,1);
 const rows=mergeAppEntries([{name:'One',path:'C:/One.lnk'},{name:'Alias',appId:'app!id'},{name:'Bridge',path:'C:/One.lnk',appId:'app!id'}]);assert.equal(rows.length,1);
});
test('custom executable merges with its resolved shortcut and retains custom deletion metadata',()=>{
 const result=mergeAppEntries([{name:'My editor',path:'C:/Editor.exe',isCustom:true}],[{name:'Editor',path:'C:/Editor.lnk',target:'c:/editor.exe',args:'',icon:'data:icon'}]);
 assert.equal(result.length,1);assert.equal(result[0].name,'My editor');assert.equal(result[0].isCustom,true);assert.equal(result[0].icon,'data:icon');
});
test('desktop StartApps mirrors are suppressed and invalid shell IDs rejected',()=>{
 const result=combineInventory([{name:'Editor',path:'C:/editor.lnk',target:'C:/editor.exe'}],[{Name:'Editor',AppID:'Some.Synthetic.ID'},{Name:'Invalid',AppID:'bad\" --command'},{Name:'Control',AppID:'bad\nname'}]);assert.equal(result.length,1);
});
test('unreadable shortcuts do not lose adjacent apps; uppercase extension is supported',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-app-index-'));
 try{for(const name of ['Good.LNK','Broken.lnk','Uninstall.lnk','readme.txt'])fs.writeFileSync(path.join(dir,name),'fixture');const rows=scanShortcuts([dir,dir],file=>{if(file.endsWith('Broken.lnk'))throw Error('Unreadable');return {target:'C:/Good.exe'};});assert.equal(rows.length,2);assert.equal(rows.find(row=>row.name==='Good').target,'C:/Good.exe');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Get-StartApps uses argument arrays, UTF-8 and bounded time; malformed or failed output falls back',async()=>{
 let call;const run=(file,args,options,done)=>{call={file,args,options};done(null,'\uFEFF[{"Name":"ChatGPT","AppID":"OpenAI.Chat!App"}]');};assert.equal((await readStartApps(run))[0].Name,'ChatGPT');assert.equal(call.file,'powershell.exe');assert(call.args.includes('-NonInteractive'));assert.equal(call.options.windowsHide,true);assert(call.options.timeout<=15000);assert.deepEqual(await readStartApps((_f,_a,_o,done)=>done(Error('disabled'),'')),[]);assert.deepEqual(await readStartApps((_f,_a,_o,done)=>done(null,'bad')),[]);
});
test('inventory coalesces requests, refreshes after TTL and launch IDs come from the inventory',async()=>{
 let ticks=0,calls=0;const inventory=createAppInventory({dirs:[],now:()=>ticks,readApps:async()=>{calls++;return [{Name:'ChatGPT',AppID:'OpenAI.Chat!App'}];}});
 const [a,b]=await Promise.all([inventory.list(),inventory.list()]);assert.equal(calls,1);a[0].name='mutated';assert.equal(b[0].name,'ChatGPT');assert(inventory.resolveAppId('openai.chat!app'));assert.equal(inventory.resolveAppId('not-installed!App'),null);assert.equal(inventory.resolveAppId('invalid --flag'),null);await Promise.all([inventory.list({force:true}),inventory.list({force:true})]);assert.equal(calls,2);ticks=31000;await inventory.list();assert.equal(calls,3);
 const fallback=createAppInventory({dirs:[],readApps:async()=>{throw Error('unavailable');}});assert.deepEqual(await fallback.list(),[]);
});
