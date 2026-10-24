const fs=require('node:fs'),path=require('node:path');
const {execFile}=require('node:child_process');
const {mergeAppEntries}=require('./appEntries.mjs');
const usableId=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[\x00-\x20"<>|]/.test(value);
const nameKey=value=>value.normalize('NFKC').trim().toLowerCase();
function combineInventory(shortcuts,startApps){
 const links=mergeAppEntries(shortcuts),names=new Set(links.map(item=>nameKey(item.name)));
 const ids=new Set(links.map(item=>(item.appId||'').toLowerCase()).filter(Boolean));
 const extras=[];
 for(const entry of startApps){
  if(!entry||typeof entry.Name!=='string'||!entry.Name.trim()||!usableId(entry.AppID))continue;
  const id=entry.AppID.trim();
  if(ids.has(id.toLowerCase()))continue;
  // Get-StartApps also lists the same Win32 shortcuts with synthetic identifiers.
  // Prefer the resolved shortcut; packaged applications retain their real AUMID.
  if(!id.includes('!')&&names.has(nameKey(entry.Name)))continue;
  extras.push({name:entry.Name.trim(),appId:id,path:'shell:AppsFolder\\'+id,letter:entry.Name.trim()[0].toUpperCase(),type:'Application',isReal:true});
 }
 return mergeAppEntries(links,extras).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true}));
}
function scanShortcuts(dirs,readShortcutLink){
 const rows=[],visited=new Set();
 function visit(dir){
  let entries;try{const real=fs.realpathSync(dir);if(visited.has(real.toLowerCase()))return;visited.add(real.toLowerCase());entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const entry of entries){const full=path.join(dir,entry.name);
   if(entry.isSymbolicLink())continue;
   if(entry.isDirectory()){visit(full);continue;}
   if(!/\.lnk$/i.test(entry.name))continue;
   const name=entry.name.slice(0,-4).trim();if(!name||/uninstall|help|manual|documentation|website|readme|إزالة تثبيت|إلغاء تثبيت/i.test(name))continue;
   let link={};try{link=readShortcutLink(full)||{};}catch{}
   rows.push({name,path:full,target:link.target||undefined,args:link.args||'',appId:link.appUserModelId||undefined,letter:name[0].toUpperCase(),type:'Application',isReal:true});
  }
 }
 dirs.filter(Boolean).forEach(visit);return rows;
}
function readStartApps(run=execFile){return new Promise(resolve=>{
 const script="[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); @(Get-StartApps -ErrorAction Stop | Select-Object Name,AppID) | ConvertTo-Json -Compress";
 run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,encoding:'utf8',timeout:12000,maxBuffer:4*1024*1024},(error,stdout)=>{if(error)return resolve([]);try{const result=JSON.parse(stdout.replace(/^\uFEFF/,''));resolve(Array.isArray(result)?result:result?[result]:[]);}catch{resolve([]);}});
});}
function createAppInventory({readShortcutLink,dirs,readApps=readStartApps,now=Date.now}={}){
 let cached=null,updated=0,pending=null;const known=new Map();
 const roots=dirs||[path.join(process.env.ProgramData||'C:\\ProgramData','Microsoft','Windows','Start Menu','Programs'),process.env.APPDATA&&path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs')];
 async function list({force=false}={}){
  if(!force&&cached&&now()-updated<30000)return cached.map(item=>({...item}));
  if(!pending)pending=(async()=>{const links=scanShortcuts(roots,readShortcutLink||(()=>({})));let startApps=[];try{startApps=await readApps();}catch{}cached=combineInventory(links,startApps);known.clear();for(const item of cached)if(item.appId)known.set(item.appId.toLowerCase(),item);updated=now();return cached;})().finally(()=>{pending=null;});
  return (await pending).map(item=>({...item}));
 }
 function resolveAppId(id){if(!usableId(id))return null;return known.get(id.toLowerCase())||null;}
 return {list,resolveAppId};
}
module.exports={combineInventory,scanShortcuts,readStartApps,createAppInventory};
