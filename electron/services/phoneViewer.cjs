const path=require('node:path');
function createPhoneViewer({BrowserWindow,screen,root,onClose=()=>{}}){
 const windows=new Map();
 const managed=win=>[...windows.values()].includes(win);
 function open(device,kind){
  if(typeof device!=='string'||!device||device.length>100||!['screen','camera'].includes(kind))throw Error('Invalid phone preview.');
  const key=device+':'+kind,existing=windows.get(key);
  if(existing&&!existing.isDestroyed()){if(existing.isMinimized())existing.restore();existing.show();existing.focus();return existing;}
  const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width=Math.min(kind==='screen'?460:860,area.width-32),height=Math.min(kind==='screen'?820:620,area.height-32);
  const win=new BrowserWindow({width,height,minWidth:Math.min(320,width),minHeight:Math.min(300,height),x:area.x+Math.round((area.width-width)/2),y:area.y+Math.round((area.height-height)/2),frame:false,transparent:false,backgroundColor:'#0d0f15',resizable:true,maximizable:true,minimizable:true,show:false,autoHideMenuBar:true,webPreferences:{nodeIntegration:true,contextIsolation:false,webSecurity:true,allowRunningInsecureContent:false}});
  windows.set(key,win);win.setTitle('MOHIVX · '+(kind==='screen'?'Phone screen':'Phone camera'));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  win.on('page-title-updated',event=>event.preventDefault());
  win.once('ready-to-show',()=>{win.show();win.focus();});
  for(const event of ['maximize','unmaximize'])win.on(event,()=>win.webContents.send('desktop-window-state-changed',{maximized:win.isMaximized(),minimized:win.isMinimized(),alwaysOnTop:win.isAlwaysOnTop()}));
  win.on('closed',()=>{windows.delete(key);onClose(device,kind);});
  win.loadFile(path.join(root,'dist/index.html'),{query:{view:'phone-viewer',device,kind}});
  return win;
 }
 function send(channel,value){for(const win of windows.values())if(!win.isDestroyed())win.webContents.send(channel,value);}
 function stop(){for(const win of windows.values())if(!win.isDestroyed())win.destroy();windows.clear();}
 const matches=(win,device,kind)=>windows.get(device+':'+kind)===win;
 return {open,managed,matches,send,stop,windows};
}
module.exports={createPhoneViewer};
