const path=require('node:path');
const {computeViewerDockBounds}=require('../../src/components/phonePlacement.mjs');
function createPhoneViewer({BrowserWindow,screen,root,onClose=()=>{}}){
 const windows=new Map();
 const managed=win=>[...windows.values()].includes(win);
 function applyDock(win,dock,preserveSize=false){
  if(!win||win.isDestroyed()||!dock||typeof dock!=='object')return;
  if(preserveSize&&typeof win.getBounds==='function'){
   const wasMaximized=win.isMaximized();
   const normal=wasMaximized&&typeof win.getNormalBounds==='function'?win.getNormalBounds():null;
   if(wasMaximized)win.unmaximize();
   const current=normal||win.getBounds();
   const area=dock.workArea||screen.getDisplayNearestPoint({x:current.x,y:current.y}).workArea;
   const docked=computeViewerDockBounds(area,dock.edge||'left',dock.entryRatio??0.5,{width:current.width,height:current.height});
   win.setBounds({x:Math.round(docked.x),y:Math.round(docked.y),width:docked.width,height:docked.height});
  }else if(dock.bounds&&Number.isFinite(dock.bounds.x)&&Number.isFinite(dock.bounds.y)&&Number.isFinite(dock.bounds.width)&&Number.isFinite(dock.bounds.height)){
   win.setBounds({x:Math.round(dock.bounds.x),y:Math.round(dock.bounds.y),width:Math.round(dock.bounds.width),height:Math.round(dock.bounds.height)});
  }
  const payload={active:true,device:dock.device,edge:dock.edge||'left',monitorId:dock.monitorId||null};
  if(win.webContents.isLoading())win.webContents.once('did-finish-load',()=>{if(!win.isDestroyed())win.webContents.send('phone-edge-handoff',payload);});
  else win.webContents.send('phone-edge-handoff',payload);
 }
 function open(device,kind,options={}){
  if(typeof device!=='string'||!device||device.length>100||!['screen','camera'].includes(kind))throw Error('Invalid phone preview.');
  const key=device+':'+kind,existing=windows.get(key);
  if(existing&&!existing.isDestroyed()){
   if(existing.isMinimized())existing.restore();
   if(options?.dock)applyDock(existing,{...options.dock,device},true);
   existing.show();existing.focus();return existing;
  }
  const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const defaultWidth=Math.min(kind==='screen'?460:860,area.width-32),defaultHeight=Math.min(kind==='screen'?820:620,area.height-32);
  const dockBounds=options?.dock?.bounds;
  const width=dockBounds?.width?Math.round(dockBounds.width):defaultWidth;
  const height=dockBounds?.height?Math.round(dockBounds.height):defaultHeight;
  const x=Number.isFinite(dockBounds?.x)?Math.round(dockBounds.x):area.x+Math.round((area.width-width)/2);
  const y=Number.isFinite(dockBounds?.y)?Math.round(dockBounds.y):area.y+Math.round((area.height-height)/2);
  const win=new BrowserWindow({width,height,minWidth:Math.min(320,width),minHeight:Math.min(300,height),x,y,frame:false,transparent:false,backgroundColor:'#0d0f15',resizable:true,maximizable:true,minimizable:true,show:false,autoHideMenuBar:true,webPreferences:{nodeIntegration:true,contextIsolation:false,webSecurity:true,allowRunningInsecureContent:false}});
  windows.set(key,win);win.setTitle('MOHIVX · '+(kind==='screen'?'Phone screen':'Phone camera'));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  win.on('page-title-updated',event=>event.preventDefault());
  win.once('ready-to-show',()=>{win.show();win.focus();if(options?.dock)applyDock(win,{...options.dock,device},false);});
  for(const event of ['maximize','unmaximize'])win.on(event,()=>win.webContents.send('desktop-window-state-changed',{maximized:win.isMaximized(),minimized:win.isMinimized(),alwaysOnTop:win.isAlwaysOnTop()}));
  win.on('closed',()=>{windows.delete(key);onClose(device,kind);});
  win.loadFile(path.join(root,'dist/index.html'),{query:{view:'phone-viewer',device,kind}});
  return win;
 }
 function releaseHandoff(device,reason='escape'){
  for(const [key,win]of windows.entries()){
   if((!device||key===device+':screen')&&!win.isDestroyed()){
    win.webContents.send('phone-edge-handoff',{active:false,device:device||key.split(':')[0],reason});
   }
  }
 }
 function send(channel,value){for(const win of windows.values())if(!win.isDestroyed())win.webContents.send(channel,value);}
 function stop(){for(const win of windows.values())if(!win.isDestroyed())win.destroy();windows.clear();}
 const matches=(win,device,kind)=>windows.get(device+':'+kind)===win;
 return {open,releaseHandoff,managed,matches,send,stop,windows};
}
module.exports={createPhoneViewer};
