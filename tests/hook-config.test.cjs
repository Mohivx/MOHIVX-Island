const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {AgentHookConfig,merge}=require('../electron/services/agentHookConfig.cjs');
test('Antigravity commands retain native Windows paths and all event hooks',()=>{
 const value=merge({},'antigravity','C:/Users/Fixture/.mohivx-island/bin/mohivx-hook.exe');
 for(const [event,entries] of Object.entries(value.mohivx)){
  const item=event.includes('Tool')?entries[0].hooks[0]:entries[0];
  assert.equal(item.command,'C:\\Users\\Fixture\\.mohivx-island\\bin\\mohivx-hook.exe --agent antigravity '+event);
 }
 const spaced=merge({},'antigravity','C:/Users/Test User/.mohivx-island/bin/mohivx-hook.exe');
 assert.equal(spaced.mohivx.Stop[0].command,'"C:\\Users\\Test User\\.mohivx-island\\bin\\mohivx-hook.exe" --agent antigravity Stop');
});
test('Coucou-derived adapters add and remove only MOHIVX hooks for seven real agent schemas',()=>{
  for(const agent of ['claude','codex','gemini','cursor','antigravity','copilot','muse']){
    const original=agent==='antigravity'?{mine:{Stop:[{command:'other hook'}]},privateValue:'unchanged'}:{hooks:{Unrelated:[{hooks:[{command:'other hook'}]}]},privateValue:'unchanged'};
    const added=merge(original,agent,'C:\\MOHIVX\\mohivx-hook.exe');
    assert.equal(added.privateValue,'unchanged');assert.match(JSON.stringify(added),/other hook/);assert.match(JSON.stringify(added),/mohivx-hook/);
    const twice=merge(added,agent,'C:\\MOHIVX\\mohivx-hook.exe');assert.deepEqual(twice,added);
    const removed=merge(added,agent,'C:\\MOHIVX\\mohivx-hook.exe',false);assert.match(JSON.stringify(removed),/other hook/);assert.ok(!JSON.stringify(removed).includes('mohivx-hook'));
  }
});
test('Windows Copilot and Gemini use executable PowerShell commands; Muse timeouts are milliseconds',()=>{
  const exe="C:\\Users\\O'Brien\\MOHIVX App\\mohivx-hook.exe";
  const copilot=merge({},'copilot',exe).hooks.permissionRequest[0];
  assert.equal(copilot.timeoutSec,120);assert.match(copilot.powershell,/^& 'C:.*O''Brien/);assert.match(copilot.bash,/--agent copilot permissionRequest$/);
  assert.match(merge({},'gemini',exe).hooks.BeforeTool[0].hooks[0].command,/^& '/);
  assert.equal(merge({},'muse',exe).hooks.PermissionRequest[0].hooks[0].timeout,120000);
});
test('hook configuration writes only reviewed content, backs up existing settings, and rejects races and malformed JSON',t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-config-')),exe=path.join(home,'mohivx-hook.exe');fs.writeFileSync(exe,'test fixture');
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const config=new AgentHookConfig(home,exe);const file=config.file('claude');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({theme:'custom',hooks:{SessionStart:[{hooks:[{command:'existing'}]}]}}));
  const plan=config.preview('claude');assert.ok(!('before' in plan));const result=config.apply(plan.id);assert.ok(fs.existsSync(result.backup));assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).theme,'custom');
  assert.throws(()=>config.apply(plan.id),/expired/);
  const stale=config.preview('claude',false);fs.appendFileSync(file,'\n');assert.throws(()=>config.apply(stale.id),/changed/);
  fs.writeFileSync(file,'{broken');assert.throws(()=>config.preview('claude'),/safely/);assert.equal(fs.readFileSync(file,'utf8'),'{broken');
});

test('global Codex connection configures hooks, MCP ask_user with ELECTRON_RUN_AS_NODE=1 and 120s timeout, and AGENTS.override.md/AGENTS.md idempotently while preserving unrelated config',t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-codex-global-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const binDir=path.join(home,'.mohivx-island','bin'),exe=path.join(binDir,'mohivx-hook.exe'),runtimeExe='C:\\Program Files\\MOHIVX Island\\MOHIVX Island.exe';
  fs.mkdirSync(binDir,{recursive:true});fs.writeFileSync(exe,'fixture');
  const codexDir=path.join(home,'.codex');fs.mkdirSync(codexDir,{recursive:true});
  const tomlFile=path.join(codexDir,'config.toml'),agentsFile=path.join(codexDir,'AGENTS.md'),overrideFile=path.join(codexDir,'AGENTS.override.md');
  const existingToml='model = "gpt-5-codex"\n\n[mcp_servers.existing_tool]\ncommand = "custom-mcp"\nargs = ["--stdio"]\n\n[mcp_servers.existing_tool.env]\nAPI_SECRET = "super-secret-value-do-not-leak"\n';
  const existingAgents='# Personal Rules\n- Keep diffs focused.\n';
  fs.writeFileSync(tomlFile,existingToml);
  fs.writeFileSync(agentsFile,existingAgents);

  const config=new AgentHookConfig(home,exe,{binDir,runtimeExe});
  const preview=config.preview('codex',true);
  assert.equal(preview.paths.length,3);
  assert.ok(preview.paths.includes(tomlFile)&&preview.paths.includes(agentsFile));
  assert.ok(!preview.diff.includes('super-secret-value-do-not-leak'),'preview diff must never expose secret-bearing config values');
  const applied=config.apply(preview.id);
  assert.equal(applied.success,true);
  assert.equal(config.status().find(s=>s.agent==='codex').installed,true);
  assert.ok(fs.existsSync(path.join(binDir,'island-mcp.cjs'))&&fs.existsSync(path.join(binDir,'ask-island.cjs')),'bridge scripts materialized in binDir');

  const tomlAfter=fs.readFileSync(tomlFile,'utf8');
  assert.match(tomlAfter,/model = "gpt-5-codex"/);
  assert.match(tomlAfter,/\[mcp_servers\.existing_tool\]/);
  assert.match(tomlAfter,/\[mcp_servers\.mohivx_island\]/);
  assert.match(tomlAfter,/tool_timeout_sec = 120/);
  assert.match(tomlAfter,/ELECTRON_RUN_AS_NODE = "1"/);
  const agentsAfter=fs.readFileSync(agentsFile,'utf8');
  assert.match(agentsAfter,/# Personal Rules/);
  assert.match(agentsAfter,/MOHIVX Island Questions/);

  // Idempotent second connect produces no diff
  const secondPreview=config.preview('codex',true);
  assert.equal(secondPreview.changed,false);
  config.apply(secondPreview.id);
  assert.equal(fs.readFileSync(tomlFile,'utf8'),tomlAfter);
  assert.equal(fs.readFileSync(agentsFile,'utf8'),agentsAfter);

  // Disconnect removes only MOHIVX hooks, MCP server, and instructions block
  const removePreview=config.preview('codex',false);
  config.apply(removePreview.id);
  assert.equal(config.status().find(s=>s.agent==='codex').installed,false);
  assert.equal(fs.readFileSync(tomlFile,'utf8'),existingToml);
  assert.equal(fs.readFileSync(agentsFile,'utf8'),existingAgents);

  // Non-empty AGENTS.override.md is preferred over AGENTS.md when present
  fs.writeFileSync(overrideFile,'# Override instructions\n');
  const overridePreview=config.preview('codex',true);
  assert.ok(overridePreview.paths.includes(overrideFile));
  config.apply(overridePreview.id);
  assert.match(fs.readFileSync(overrideFile,'utf8'),/MOHIVX Island Questions/);
  assert.equal(fs.readFileSync(agentsFile,'utf8'),existingAgents);
});

test('Gemini CLI and Antigravity configure global MCP and instructions; secondary file races and mid-apply errors roll back cleanly',t=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-multi-agent-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const exe=path.join(home,'mohivx-hook.exe');fs.writeFileSync(exe,'fixture');
  const config=new AgentHookConfig(home,exe);

  for(const agent of ['gemini','antigravity']){
    const p=config.preview(agent,true);
    config.apply(p.id);
    const st=config.status().find(s=>s.agent===agent);
    assert.equal(st.installed,true,agent+' installed');
    assert.equal(st.questionSupport,'global-mcp');
    const rm=config.preview(agent,false);
    config.apply(rm.id);
    assert.equal(config.status().find(s=>s.agent===agent).installed,false,agent+' removed');
  }

  // Secondary file race detection before any write
  const codexPreview=config.preview('codex',true);
  const tomlPath=path.join(home,'.codex','config.toml');
  fs.mkdirSync(path.dirname(tomlPath),{recursive:true});
  fs.writeFileSync(tomlPath,'model = "changed-after-preview"\n');
  assert.throws(()=>config.apply(codexPreview.id),/changed/);
  assert.equal(fs.existsSync(config.file('codex')),false,'no partial write when secondary target changed');

  // Mid-apply failure rolls back already-written targets to exact prior bytes
  const hooksPath=config.file('codex');
  const initialHooks=JSON.stringify({hooks:{SessionStart:[{hooks:[{command:'keep-me'}]}]}})+'\n';
  fs.writeFileSync(hooksPath,initialHooks);
  const rollbackConfig=new AgentHookConfig(home,exe,{
    onAfterTargetWrite:(_target,index)=>{if(index===1)throw Error('Simulated disk failure on second target');}
  });
  const plan=rollbackConfig.preview('codex',true);
  assert.throws(()=>rollbackConfig.apply(plan.id),/Simulated disk failure/);
  assert.equal(fs.readFileSync(hooksPath,'utf8'),initialHooks,'first target rolled back to exact original bytes');
  assert.equal(fs.readFileSync(tomlPath,'utf8'),'model = "changed-after-preview"\n','second target restored to exact original bytes');
});
