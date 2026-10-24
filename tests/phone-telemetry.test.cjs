const test=require('node:test'),assert=require('node:assert/strict');
const {createCompanionTelemetry}=require('../electron/services/companionTelemetry.cjs');
test('production phone telemetry works independently of the window closure and reports measured deltas',()=>{
 let times={idle:100,user:100,sys:0};const read=createCompanionTelemetry({cpus:()=>[{times}],freemem:()=>25,totalmem:()=>100,uptime:()=>7200});times={idle:150,user:250,sys:0};const value=read();assert.equal(value.cpu.percent,75);assert.equal(value.ram.percent,75);assert.equal(value.uptime,'2 h');assert.equal(value.gpu.available,false);assert.doesNotThrow(()=>JSON.stringify(value));
});
