const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {AcpClient}=require('./acpClient.cjs');
class HermesAgentService {
  constructor(appDataDir,log=()=>{}) {
    this.hermesPath=path.join(os.homedir(),'AppData','Local','hermes','bin','hermes-acp.exe');
    const cwd=path.join(appDataDir,'agent-workspace'); fs.mkdirSync(cwd,{recursive:true}); this.client=new AcpClient(this.hermesPath,cwd); this.log=log;
  }
  async checkStatus() {const installed=fs.existsSync(this.hermesPath);return {installed,isInstalled:installed,path:this.hermesPath,executablePath:this.hermesPath,protocol:'ACP',...this.client.status()};}
  async runOneShot(prompt) {if(!fs.existsSync(this.hermesPath))return {success:false,error:'Hermes ACP is not installed.'};return this.client.prompt(prompt);}
  stop(){this.client.close();}
}
module.exports=HermesAgentService;
