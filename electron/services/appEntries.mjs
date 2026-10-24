// Shared by the Windows inventory and renderer so aliases cannot reappear on merge.
const text=value=>typeof value==='string'?value.trim():'';
const file=value=>text(value).replace(/\//g,'\\').replace(/\\+$/,'').toLowerCase();
export function appEntryKeys(item){
 const keys=[];
 if(text(item.appId))keys.push('id:'+text(item.appId).toLowerCase());
 if(text(item.target))keys.push('target:'+file(item.target)+'\0'+text(item.args));
 if(text(item.path))keys.push('path:'+file(item.path));
 if(/\.exe$/i.test(text(item.path)))keys.push('target:'+file(item.path)+'\0'+text(item.args));
 if(!keys.length)keys.push('name:'+text(item.name).normalize('NFKC').toLowerCase());
 return keys;
}
export function mergeAppEntries(...groups){
 const rows=[],owners=new Map();
 for(const source of groups.flat()){
  if(!source||!text(source.name))continue;
  const item={...source,name:text(source.name)},keys=appEntryKeys(item);
  const matches=[...new Set(keys.map(key=>owners.get(key)).filter(row=>row!==undefined))];
  if(!matches.length){const row={item,keys:new Set(keys)};rows.push(row);for(const key of keys)owners.set(key,row);continue;}
  const row=matches[0];
  // The earlier/custom entry keeps its label; missing metadata and icons can be enriched.
  for(const other of matches.slice(1)){
   row.item={...other.item,...row.item,isOpen:Boolean(other.item.isOpen||row.item.isOpen)};
   for(const key of other.keys){row.keys.add(key);owners.set(key,row);}other.removed=true;
  }
  const first=row.item,defined=Object.fromEntries(Object.entries(first).filter(([,value])=>value!==undefined&&value!==''));row.item={...item,...defined,icon:first.icon||item.icon,isOpen:Boolean(first.isOpen||item.isOpen)};
  for(const key of keys){row.keys.add(key);owners.set(key,row);}
 }
 return rows.filter(row=>!row.removed).map(row=>row.item);
}
