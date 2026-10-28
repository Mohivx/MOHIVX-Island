const test=require('node:test');const assert=require('node:assert/strict');const {GeminiAgent}=require('../electron/services/geminiAgent.cjs');
test('AI tool execution emits start/end events with request correlation',async()=>{const events=[];const agent=new GeminiAgent({onToolEvent:e=>events.push(e)});agent.actionRegistry=new Map([['demo',async()=>({success:true,message:'done'})]]);const result=await agent.executeTool('demo',{value:1},{requestId:'req-1'});assert.equal(result.success,true);assert.deepEqual(events.map(e=>[e.phase,e.tool,e.requestId]),[['start','demo','req-1'],['end','demo','req-1']]);assert.equal(events[1].success,true);});
test('AI tool execution refuses a canceled request before touching a tool',async()=>{let touched=false;const agent=new GeminiAgent({onToolEvent:()=>{}});agent.actionRegistry=new Map([['demo',async()=>{touched=true;return {success:true};}]]);await assert.rejects(agent.executeTool('demo',{}, {isActive:()=>false}),/Canceled/);assert.equal(touched,false);});
test('Gemini stream chunks preserve text and assemble function-call arguments',()=>{
  const agent=new GeminiAgent();
  const result=agent._mergeStreamChunks([
    {candidates:[{content:{parts:[{text:'سأفتح '}]}}]},
    {candidates:[{content:{parts:[{text:'التطبيق.'},{functionCall:{name:'open_application',args:{appName:'Notepad'}}}]}}]}
  ]);
  assert.equal(result.candidates[0].content.parts[0].text,'سأفتح ');
  assert.equal(result.candidates[0].content.parts[1].text,'التطبيق.');
  assert.deepEqual(result.candidates[0].content.parts[2].functionCall,{name:'open_application',args:{appName:'Notepad'}});
});
