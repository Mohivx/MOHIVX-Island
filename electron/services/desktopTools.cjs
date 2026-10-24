const fs=require('node:fs'),path=require('node:path');
class DesktopTools{
 constructor({confirm,getSettings,openPath,trashItem,execute,input,screen,weather}){Object.assign(this,{confirm,getSettings,openPath,trashItem,execute,input,screen,weather});}
 async permission(title,detail,guard=()=>true){if(!guard()||!await this.confirm(title,String(detail).slice(0,12000))||!guard())throw Error('Action canceled.');}
 filePath(value){if(typeof value!=='string'||!path.isAbsolute(value)||value.length>2000||value.includes('\0'))throw Error('Use an absolute local path.');return path.resolve(value);}
 async files(args,{isActive=()=>true}={}){const action=args.action,file=this.filePath(args.path);if(!['list','read','write','mkdir','copy','move','trash','open','usage'].includes(action))throw Error('Unknown file action.');let destination;if(['copy','move'].includes(action))destination=this.filePath(args.destination);await this.permission('File action · '+action,file+(destination?'\n→ '+destination:'')+(action==='write'?'\n\n'+String(args.content||'').slice(0,8000):''),isActive);
  if(action==='list'){const items=fs.readdirSync(file,{withFileTypes:true}).slice(0,250).map(item=>({name:item.name,directory:item.isDirectory()}));return {success:true,referenceOnly:true,path:file,items};}
  if(action==='read'){const stat=fs.statSync(file);if(!stat.isFile()||stat.size>1000000)throw Error('Choose a text file smaller than 1 MB.');return {success:true,referenceOnly:true,path:file,text:fs.readFileSync(file,'utf8')};}
  if(action==='usage'){const stat=fs.statSync(file);return {success:true,bytes:stat.size,directory:stat.isDirectory()};}
  if(action==='write'){if(typeof args.content!=='string'||Buffer.byteLength(args.content)>1000000)throw Error('Content is too large.');fs.writeFileSync(file,args.content);}
  if(action==='mkdir')fs.mkdirSync(file,{recursive:true});
  if(action==='copy'){if(fs.existsSync(destination))throw Error('Destination already exists.');if(!fs.statSync(file).isFile())throw Error('Choose one file.');fs.copyFileSync(file,destination,fs.constants.COPYFILE_EXCL);}
  if(action==='move'){if(fs.existsSync(destination))throw Error('Destination already exists.');fs.renameSync(file,destination);}
  if(action==='trash')await this.trashItem(file);
  if(action==='open'){const error=await this.openPath(file);if(error)throw Error(error);}
  return {success:true,path:file};
 }
 async command(args,{isActive=()=>true}={}){if(!this.getSettings().advancedMode)throw Error('Enable advanced tools in Permissions first.');const command=String(args.command||'').trim();if(!command||command.length>8000)throw Error('Enter a command under 8000 characters.');await this.permission('Run a PowerShell command',command,()=>isActive()&&this.getSettings().advancedMode);const result=await this.execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:30000,maxBuffer:1000000,encoding:'utf8'});return {success:true,referenceOnly:true,output:String(result).slice(0,30000)};}
 async control(args,{isActive=()=>true}={}){if(!this.getSettings().advancedMode)throw Error('Enable advanced tools in Permissions first.');const value=args.input;if(!value||typeof value!=='object')throw Error('Choose a control action.');const validated=require('./phoneBridge.cjs').validateInput(value);await this.permission('Control this computer',JSON.stringify(validated,null,2),()=>isActive()&&this.getSettings().advancedMode);return this.input(validated);}
 async capture(args,{isActive=()=>true}={}){await this.permission('Read the screen','Capture the screen and send it to your configured Gemini service to answer: '+String(args.question||'Describe the screen.'),isActive);return this.screen(String(args.question||'Describe the screen.'));}
}
module.exports={DesktopTools};
