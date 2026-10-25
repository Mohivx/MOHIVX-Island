const { autoUpdater } = require('electron-updater');

class AppUpdater {
  constructor({app,dialog,getWindows,getSettings,onStatus=()=>{},log=()=>{},qaMode=false}) {
    this.app=app;this.dialog=dialog;this.getWindows=getWindows;this.getSettings=getSettings;this.onStatus=onStatus;this.log=log;this.qaMode=qaMode;
    this.status={state:'idle',currentVersion:app.getVersion(),supported:false,percent:0};
    this.promptActive=false;this.started=false;this.autoCheckTimer=null;this.autoCheckInterval=null;
  }
  get supported(){return this.app.isPackaged&&process.platform==='win32'&&!this.qaMode&&!process.env.PORTABLE_EXECUTABLE_FILE&&!process.env.PORTABLE_EXECUTABLE_DIR;}
  publish(state,details={}){
    this.status={...this.status,...details,state,currentVersion:this.app.getVersion(),supported:this.supported};
    this.onStatus(this.status);
    return this.status;
  }
  snapshot(){return {...this.status,supported:this.supported,currentVersion:this.app.getVersion()};}
  init(){
    if(this.started)return this.snapshot();
    this.started=true;
    if(!this.supported)return this.publish('unsupported');
    autoUpdater.autoDownload=true;
    autoUpdater.autoInstallOnAppQuit=false;
    autoUpdater.allowPrerelease=false;
    autoUpdater.logger={info:(...args)=>this.log('Update: '+args.join(' ')),warn:(...args)=>this.log('Update warning: '+args.join(' ')),error:(...args)=>this.log('Update error: '+args.join(' ')),debug:(...args)=>this.log('Update debug: '+args.join(' '))};
    autoUpdater.on('checking-for-update',()=>this.publish('checking',{error:''}));
    autoUpdater.on('update-available',info=>this.publish('available',{version:info.version,percent:0,error:''}));
    autoUpdater.on('update-not-available',info=>this.publish('up-to-date',{version:info?.version||this.app.getVersion(),percent:0,error:''}));
    autoUpdater.on('download-progress',progress=>this.publish('downloading',{percent:Math.max(0,Math.min(100,Number(progress.percent)||0)),transferred:progress.transferred,total:progress.total,bytesPerSecond:progress.bytesPerSecond}));
    autoUpdater.on('update-downloaded',info=>{this.publish('downloaded',{version:info.version,percent:100,error:''});void this.promptRestart(info.version);});
    autoUpdater.on('update-cancelled',info=>this.publish('cancelled',{version:info?.version||'',error:''}));
    autoUpdater.on('error',error=>{this.log('Auto update failed: '+(error?.stack||error));this.publish('error',{error:String(error?.message||'Update failed.')});});
    this.autoCheckTimer=setTimeout(()=>{if(this.getSettings()?.autoCheckUpdates!==false)void this.check();},12000);this.autoCheckTimer.unref?.();
    this.autoCheckInterval=setInterval(()=>{if(this.getSettings()?.autoCheckUpdates!==false)void this.check();},6*60*60*1000);this.autoCheckInterval.unref?.();
    return this.snapshot();
  }
  async check(){
    if(!this.supported)return this.publish('unsupported');
    if(['checking','available','downloading','downloaded','installing'].includes(this.status.state))return this.snapshot();
    this.publish('checking',{error:''});
    try{
      const result=await autoUpdater.checkForUpdates();
      if(!result?.isUpdateAvailable&&this.status.state==='checking')this.publish('up-to-date',{version:this.app.getVersion(),error:''});
    }catch(error){this.log('Auto update check failed: '+(error?.stack||error));this.publish('error',{error:String(error?.message||'Update check failed.')});}
    return this.snapshot();
  }
  async promptRestart(version){
    if(this.promptActive||this.status.state!=='downloaded')return;
    this.promptActive=true;
    const ar=this.getSettings()?.appLang==='ar';
    const options={type:'info',title:ar?'تحديث MOHIVX Island جاهز':'MOHIVX Island update ready',message:ar?`اكتمل تنزيل الإصدار ${version}. هل تريد إعادة تشغيل التطبيق الآن لتثبيته؟`:`Version ${version} has finished downloading. Restart MOHIVX Island now to install it?`,buttons:ar?['لاحقًا','إعادة التشغيل والتثبيت']:['Later','Restart and install'],defaultId:0,cancelId:0,noLink:true};
    try{
      const parent=this.getWindows().find(win=>win&&!win.isDestroyed()&&win.isVisible());
      const result=parent?await this.dialog.showMessageBox(parent,options):await this.dialog.showMessageBox(options);
      if(result.response===1)this.installNow();
    }catch(error){this.log('Update restart prompt failed: '+(error?.message||error));}
    finally{this.promptActive=false;}
  }
  installNow(){
    if(!this.supported||this.status.state!=='downloaded')return {success:false,error:'No downloaded update is ready.'};
    this.publish('installing');
    autoUpdater.quitAndInstall(false,true);
    return {success:true};
  }
}

module.exports=AppUpdater;
