const os=require('node:os');
function createCompanionTelemetry(system=os){
  const sample=()=>system.cpus().reduce((total,cpu)=>{for(const [name,time]of Object.entries(cpu.times)){total.all+=time;if(name==='idle')total.idle+=time;}return total;},{all:0,idle:0});let previous=sample();
  return ()=>{const next=sample(),elapsed=next.all-previous.all,cpu=elapsed>0?Math.max(0,Math.min(100,Math.round((1-(next.idle-previous.idle)/elapsed)*100))):null;previous=next;
    return {cpu:{percent:cpu,available:cpu!==null},gpu:{available:false},ram:{percent:Math.round((1-system.freemem()/system.totalmem())*100)},uptime:Math.floor(system.uptime()/3600)+' h'};};
}
module.exports={createCompanionTelemetry};
