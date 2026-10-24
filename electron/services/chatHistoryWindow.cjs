const path=require('node:path');
function createChatHistoryWindow({BrowserWindow,screen,root,getSettings}){
 let window=null;
 function open(){if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();return window;}const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,s=getSettings(),side=s.position==='left'?'right':s.position==='right'?'left':s.historySide||'left',width=Math.min(410,area.width-32),height=Math.min(820,area.height-48);
  window=new BrowserWindow({x:side==='right'?area.x+area.width-width-16:area.x+16,y:area.y+24,width,height,minWidth:Math.min(340,width),minHeight:Math.min(380,height),frame:false,transparent:false,backgroundColor:'#10111d',resizable:true,minimizable:true,maximizable:true,show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,webSecurity:true}});
  const win=window;win.setTitle('MOHIVX · Chat history');win.on('page-title-updated',event=>event.preventDefault());win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.once('ready-to-show',()=>{win.show();win.focus();});for(const event of ['maximize','unmaximize'])win.on(event,()=>win.webContents.send('desktop-window-state-changed',{maximized:win.isMaximized(),alwaysOnTop:win.isAlwaysOnTop()}));win.on('closed',()=>{if(window===win)window=null;});win.loadFile(path.join(root,'dist/index.html'),{query:{view:'history'}});return win;
 }
 return {open,managed:win=>Boolean(window)&&win===window,send:(channel,value)=>{if(window&&!window.isDestroyed())window.webContents.send(channel,value);},stop:()=>{if(window&&!window.isDestroyed())window.destroy();window=null;}};
}
module.exports={createChatHistoryWindow};
