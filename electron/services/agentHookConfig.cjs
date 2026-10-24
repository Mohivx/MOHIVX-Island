const managed=require('./managedAgentConfig.cjs');
// JSON hook adapters follow Coucou windows/src-tauri/src/agents.rs and hooks.rs.
// Copyright (c) 2026 Louis Raillé, MIT. See ../vendor/coucou/LICENSE.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=bytes=>crypto.createHash('sha256').update(bytes||Buffer.from('missing')).digest('hex');
const events=['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','PermissionRequest','Notification','Stop','StopFailure','SubagentStart','SubagentStop'];
const definitions={
  copilot:{file:['.copilot','hooks','mohivx.json'],events:['sessionStart','userPromptSubmitted','preToolUse','permissionRequest','postToolUse','agentStop','sessionEnd','notification'],copilot:true,questionSupport:'approvals-only'},
  muse:{file:['.config','muse','settings.json'],events:['SessionStart','UserPromptSubmit','PreToolUse','PermissionRequest','PostToolUse','Stop','SessionEnd'],matcher:true,questionSupport:'approvals-only'},
  claude:{file:['.claude','settings.json'],instructions:['.claude','CLAUDE.md'],events,matcher:true,questionSupport:'global-hooks'},
  codex:{file:['.codex','hooks.json'],toml:['.codex','config.toml'],instructions:['.codex','AGENTS.md'],overrideInstructions:['.codex','AGENTS.override.md'],events:['SessionStart','UserPromptSubmit','PreToolUse','PermissionRequest','PostToolUse','Stop','SubagentStart','SubagentStop','Interrupt','SessionEnd'],questionSupport:'global-mcp'},
  gemini:{file:['.gemini','settings.json'],mcpInSettings:true,instructions:['.gemini','GEMINI.md'],events:['SessionStart','SessionEnd','BeforeAgent','AfterAgent','BeforeTool','AfterTool'],matcher:true,questionSupport:'global-mcp'},
  cursor:{file:['.cursor','hooks.json'],events:['sessionStart','sessionEnd','beforeSubmitPrompt','beforeShellExecution','afterShellExecution','beforeFileRead','afterFileEdit','stop'],flat:true,questionSupport:'activity-only'},
  antigravity:{file:['.gemini','config','hooks.json'],mcpFile:['.gemini','config','mcp_config.json'],instructions:['.gemini','config','AGENTS.md'],events:['PreInvocation','PostInvocation','PreToolUse','PostToolUse','Stop'],group:true,questionSupport:'global-mcp'}
};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const ours=hook=>object(hook)&&(hook.mohivx===true||JSON.stringify(hook).includes('mohivx-hook'));
const oursMcp=entry=>object(entry)&&(entry.mohivx===true||JSON.stringify(entry).includes('island-mcp.cjs'));
const TOML_START='# BEGIN MOHIVX ISLAND MCP';
const TOML_END='# END MOHIVX ISLAND MCP';
const MD_START='<!-- BEGIN MOHIVX ISLAND QUESTIONS -->';
const MD_END='<!-- END MOHIVX ISLAND QUESTIONS -->';

function merge(value,agent,exe,install=true){
  const def=definitions[agent];if(!def)throw Error('Unsupported agent.');
  if(!object(value))throw Error('Unexpected settings format.');
  const root=JSON.parse(JSON.stringify(value));
  const command=(event,shell=agent==='gemini'?'powershell':'cmd')=>{
    const nativePath=exe.replace(/\//g,'\\');
    // Antigravity's Windows command parser requires a native path. Avoid an
    // extra quoted executable token for the common path without spaces.
    const antigravityProgram=/[\s&|<>^()%!"]/.test(nativePath)?`"${nativePath}"`:nativePath;
    const program=shell==='powershell'?`& '${exe.replace(/'/g,"''")}'`:shell==='bash'?"'"+exe.replace(/\\/g,'/').replace(/'/g,"'\\''")+"'":agent==='antigravity'?antigravityProgram:`"${exe.replace(/\\/g,'/')}"`;
    return `${program}${agent==='claude'?'':` --agent ${agent}`}${event?' '+event:''}`;
  };
  const handler=event=>({type:'command',command:command(event),timeout:(event==='PermissionRequest'?120:10)*(agent==='muse'?1000:1)});
  if(def.copilot){
    if(root.hooks!==undefined&&!object(root.hooks))throw Error('Unexpected hooks format.');root.hooks=root.hooks||{};
    for(const event of new Set([...Object.keys(root.hooks),...def.events])){
      const entries=root.hooks[event];if(entries!==undefined&&!Array.isArray(entries))throw Error('Unexpected event format.');
      const kept=(entries||[]).filter(entry=>!ours(entry));
      if(install&&def.events.includes(event))kept.push({type:'command',bash:command(event,'bash'),powershell:command(event,'powershell'),timeoutSec:event==='permissionRequest'?120:10});
      if(kept.length)root.hooks[event]=kept;else delete root.hooks[event];
    }
    root.version=root.version||1;return root;
  }
  if(def.group){
    if(root.mohivx&&!ours(root.mohivx))throw Error('A group named mohivx already belongs to another tool.');
    if(!install){if(ours(root.mohivx))delete root.mohivx;return root;}
    root.mohivx={};for(const event of def.events)root.mohivx[event]=event.includes('Tool')?[{matcher:'*',hooks:[handler(event)]}]:[handler(event)];return root;
  }
  if(root.hooks!==undefined&&!object(root.hooks))throw Error('Unexpected hooks format.');root.hooks=root.hooks||{};
  for(const event of new Set([...Object.keys(root.hooks),...def.events])){
    if(root.hooks[event]!==undefined&&!Array.isArray(root.hooks[event]))throw Error('Unexpected event format.');
    const groups=(root.hooks[event]||[]).flatMap(group=>{
      if(def.flat)return ours(group)?[]:[group];
      if(!object(group)||!Array.isArray(group.hooks))return [group];
      const hooks=group.hooks.filter(h=>!ours(h));return hooks.length?[{...group,hooks}]:[];
    });
    if(install&&def.events.includes(event)){
      const h=handler(agent==='codex'?'':event);
      if(agent==='codex'&&event==='PermissionRequest')h.statusMessage='Waiting for your answer in MOHIVX';
      groups.push(def.flat?{command:command(event)}:{...(def.matcher?{matcher:'*'}:{}),hooks:[h]});
    }
    if(groups.length)root.hooks[event]=groups;else delete root.hooks[event];
  }
  if(def.flat)root.version=root.version||1;
  if(agent==='muse')root.schema_version=root.schema_version||1;
  return root;
}

function mergeMcpJson(value,agent,runtimeExe,mcpScript,install=true){
  if(!object(value))throw Error('Unexpected settings format.');
  const root=JSON.parse(JSON.stringify(value));
  if(root.mcpServers!==undefined&&!object(root.mcpServers))throw Error('Unexpected mcpServers format.');
  const existing=root.mcpServers?.mohivx_island;
  if(existing!==undefined&&!oursMcp(existing))throw Error('An MCP server named mohivx_island already belongs to another tool.');
  if(!install){
    if(root.mcpServers){
      delete root.mcpServers.mohivx_island;
      if(Object.keys(root.mcpServers).length===0)delete root.mcpServers;
    }
    return root;
  }
  root.mcpServers=root.mcpServers||{};
  root.mcpServers.mohivx_island={
    command:runtimeExe,
    args:[mcpScript,'--agent',agent],
    env:{ELECTRON_RUN_AS_NODE:'1',MOHIVX_QUESTION_AGENT:agent},
    ...(agent==='gemini'?{timeout:120000}:{})
  };
  return root;
}

const {validateToml,stripOwnedCodexToml,mergeCodexToml,mergeInstructionsMarkdown}=managed;

class AgentHookConfig{
  constructor(home,exe,options={}){
    this.home=home;
    this.exe=exe;
    this.options=options;
    this.binDir=options.binDir||path.dirname(exe);
    this.runtimeExe=options.runtimeExe||process.execPath;
    this.mcpScript=options.mcpScript||path.join(this.binDir,'island-mcp.cjs');
    this.askScript=options.askScript||path.join(this.binDir,'ask-island.cjs');
    this.plans=new Map();
  }
  file(agent){if(!definitions[agent])throw Error('Unsupported agent.');return path.join(this.home,...definitions[agent].file);}
  read(file){
    try{
      const bytes=fs.readFileSync(file);
      if(bytes.length>2*1024*1024)throw Error('Settings file too large.');
      const raw=bytes.toString('utf8').replace(/^\uFEFF/,'');
      if(!raw.trim())return {bytes,value:{}};
      const value=JSON.parse(raw);
      if(!object(value))throw Error('Unexpected settings format.');
      return {bytes,value};
    }catch(e){
      if(e.code==='ENOENT')return {bytes:null,value:{}};
      throw Error('Cannot read the existing settings safely.');
    }
  }
  readText(file){return managed.readText(file);}
  resolveCodexInstructions(install=true){
    const def=definitions.codex;
    const overrideFile=path.join(this.home,...def.overrideInstructions);
    const defaultFile=path.join(this.home,...def.instructions);
    const overrideText=this.readText(overrideFile).text;
    const defaultText=this.readText(defaultFile).text;
    const overrideStripped=overrideText.replace(new RegExp(`${MD_START.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[\\s\\S]*?${MD_END.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'g'),'').trim();
    if(install){
      const primary=overrideStripped.length>0?overrideFile:defaultFile;
      const secondary=primary===overrideFile?defaultFile:overrideFile;
      const secondaryText=primary===overrideFile?defaultText:overrideText;
      const targets=[{file:primary,install:true}];
      if(secondaryText.includes(MD_START))targets.push({file:secondary,install:false});
      return targets;
    }
    const targets=[];
    if(overrideText.includes(MD_START))targets.push({file:overrideFile,install:false});
    if(defaultText.includes(MD_START)||!targets.length)targets.push({file:defaultFile,install:false});
    return targets;
  }
  buildTargets(agent,install=true){
    const def=definitions[agent];if(!def)throw Error('Unsupported agent.');
    const targets=[];
    const hookFile=this.file(agent);
    const {bytes:hookBytes,value:hookValue}=this.read(hookFile);
    let nextHook=merge(hookValue,agent,this.exe,install);
    if(def.mcpInSettings){
      nextHook=mergeMcpJson(nextHook,agent,this.runtimeExe,this.mcpScript,install);
    }
    const hookAfter=Buffer.from(JSON.stringify(hookNextOrEmpty(nextHook),null,2)+'\n');
    targets.push({
      file:hookFile,
      real:fs.existsSync(hookFile)?fs.realpathSync(hookFile):path.resolve(hookFile),
      beforeBytes:hookBytes,
      beforeHash:hash(hookBytes),
      after:hookAfter,
      changed:!hookBytes||!hookAfter.equals(hookBytes),
      summary:`${install?'+':'-'} ${hookFile} (${def.mcpInSettings?'hooks + MCP ask_user':'hooks'})`
    });
    if(def.mcpFile){
      const mcpFile=path.join(this.home,...def.mcpFile);
      const {bytes:mcpBytes,value:mcpValue}=this.read(mcpFile);
      const nextMcp=mergeMcpJson(mcpValue,agent,this.runtimeExe,this.mcpScript,install);
      const mcpAfter=Buffer.from(JSON.stringify(nextMcp,null,2)+'\n');
      targets.push({
        file:mcpFile,
        real:fs.existsSync(mcpFile)?fs.realpathSync(mcpFile):path.resolve(mcpFile),
        beforeBytes:mcpBytes,
        beforeHash:hash(mcpBytes),
        after:mcpAfter,
        changed:!mcpBytes||!mcpAfter.equals(mcpBytes),
        summary:`${install?'+':'-'} ${mcpFile} (MCP server mohivx_island -> ask_user)`
      });
    }
    if(def.toml){
      const tomlFile=path.join(this.home,...def.toml);
      const {bytes:tomlBytes,text:tomlText}=this.readText(tomlFile);
      const nextToml=mergeCodexToml(tomlText,this.runtimeExe,this.mcpScript,install);
      const tomlAfter=Buffer.from(nextToml,'utf8');
      targets.push({
        file:tomlFile,
        real:fs.existsSync(tomlFile)?fs.realpathSync(tomlFile):path.resolve(tomlFile),
        beforeBytes:tomlBytes,
        beforeHash:hash(tomlBytes),
        after:tomlAfter,
        changed:tomlBytes?!tomlAfter.equals(tomlBytes):tomlAfter.length>0,
        summary:`${install?'+':'-'} ${tomlFile} ([mcp_servers.mohivx_island] ask_user, timeout 120s)`
      });
    }
    if(agent==='codex'){
      for(const item of this.resolveCodexInstructions(install)){
        const {bytes:mdBytes,text:mdText}=this.readText(item.file);
        const nextMd=mergeInstructionsMarkdown(mdText,agent,this.runtimeExe,this.askScript,item.install);
        const mdAfter=Buffer.from(nextMd,'utf8');
        targets.push({
          file:item.file,
          real:fs.existsSync(item.file)?fs.realpathSync(item.file):path.resolve(item.file),
          beforeBytes:mdBytes,
          beforeHash:hash(mdBytes),
          after:mdAfter,
          changed:mdBytes?!mdAfter.equals(mdBytes):mdAfter.length>0,
          summary:`${item.install?'+':'-'} ${item.file} (MOHIVX Island question instructions)`
        });
      }
    }else if(def.instructions){
      const mdFile=path.join(this.home,...def.instructions);
      const {bytes:mdBytes,text:mdText}=this.readText(mdFile);
      const nextMd=mergeInstructionsMarkdown(mdText,agent,this.runtimeExe,this.askScript,install);
      const mdAfter=Buffer.from(nextMd,'utf8');
      targets.push({
        file:mdFile,
        real:fs.existsSync(mdFile)?fs.realpathSync(mdFile):path.resolve(mdFile),
        beforeBytes:mdBytes,
        beforeHash:hash(mdBytes),
        after:mdAfter,
        changed:mdBytes?!mdAfter.equals(mdBytes):mdAfter.length>0,
        summary:`${install?'+':'-'} ${mdFile} (MOHIVX Island question instructions)`
      });
    }
    return targets;
  }
  status(){
    return Object.entries(definitions).map(([agent,def])=>{
      const file=this.file(agent);
      let installed=false,error='',paths=[file];
      try{
        const {value}=this.read(file);
        const hooksInstalled=JSON.stringify(value).includes('mohivx-hook');
        let extrasInstalled=true;
        if(def.mcpInSettings){
          extrasInstalled=extrasInstalled&&oursMcp(value.mcpServers?.mohivx_island);
        }
        if(def.mcpFile){
          const mcpPath=path.join(this.home,...def.mcpFile);
          paths.push(mcpPath);
          const {value:mcpVal}=this.read(mcpPath);
          extrasInstalled=extrasInstalled&&oursMcp(mcpVal.mcpServers?.mohivx_island);
        }
        if(def.toml){
          const tomlPath=path.join(this.home,...def.toml);
          paths.push(tomlPath);
          const {text:tomlText}=this.readText(tomlPath);
          validateToml(tomlText);
          extrasInstalled=extrasInstalled&&tomlText.includes('[mcp_servers.mohivx_island]')&&tomlText.includes('island-mcp.cjs');
        }
        if(agent==='codex'){
          const overridePath=path.join(this.home,...def.overrideInstructions);
          const defaultPath=path.join(this.home,...def.instructions);
          const {text:overrideText}=this.readText(overridePath);
          const {text:defaultText}=this.readText(defaultPath);
          const activePath=overrideText.trim().length>0?overridePath:defaultPath;
          paths.push(activePath);
          extrasInstalled=extrasInstalled&&(activePath===overridePath?overrideText:defaultText).includes(MD_START);
        }else if(def.instructions){
          const mdPath=path.join(this.home,...def.instructions);
          paths.push(mdPath);
          const {text:mdText}=this.readText(mdPath);
          extrasInstalled=extrasInstalled&&mdText.includes(MD_START);
        }
        installed=hooksInstalled&&extrasInstalled;
      }catch(e){
        error=e.message;
      }
      return {
        agent,
        path:file,
        paths,
        installed,
        ready:fs.existsSync(this.exe),
        approval:['claude','codex','copilot','muse'].includes(agent),
        questions:['codex','gemini','antigravity','claude'].includes(agent),
        questionSupport:def.questionSupport,
        events:def.events,
        error
      };
    });
  }
  preview(agent,install=true){
    const targets=this.buildTargets(agent,install);
    const file=targets[0].file;
    const id=crypto.randomUUID();
    const paths=targets.map(t=>t.file);
    const changedPaths=targets.filter(t=>t.changed).map(t=>t.file);
    const plan={id,agent,file,paths,changedPaths,targets,install,expires:Date.now()+120000};
    this.plans.set(id,plan);
    for(const [key,p] of this.plans)if(p.expires<Date.now())this.plans.delete(key);
    const diffLines=[
      `${install?'+':'-'} ${this.exe}`,
      ...targets.map(t=>t.summary),
      ...definitions[agent].events.map(e=>`${install?'+':'-'} ${e}`)
    ];
    return {
      id,
      agent,
      path:file,
      paths,
      changedPaths,
      install,
      changed:targets.some(t=>t.changed),
      questionSupport:definitions[agent].questionSupport,
      reloadHint:'Existing chats may need a reload or new session to pick up global tools and instructions.',
      events:definitions[agent].events,
      diff:diffLines.join('\n')
    };
  }
  ensureBridgeScripts(){
    try{
      fs.mkdirSync(this.binDir,{recursive:true});
      const scriptsDir=path.resolve(__dirname,'..','..','scripts');
      for(const [name,dst] of [['ask-island.cjs',this.askScript],['island-mcp.cjs',this.mcpScript]]){
        const src=path.join(scriptsDir,name);
        if(src!==dst&&fs.existsSync(src)){
          const bytes=fs.readFileSync(src);
          if(!fs.existsSync(dst)||!bytes.equals(fs.readFileSync(dst)))fs.writeFileSync(dst,bytes);
        }
      }
      const launcher=path.join(this.binDir,'mohivx-ask.cmd'),bytes=Buffer.from(managed.questionLauncher(this.runtimeExe,this.askScript),'utf8');
      if(!fs.existsSync(launcher)||!bytes.equals(fs.readFileSync(launcher)))fs.writeFileSync(launcher,bytes);
    }catch{throw Error('Cannot prepare the terminal question command.');}
  }
  refreshMissingRuntimes(){
    const refreshed=[],failed=[];
    for(const status of this.status()){
      if(!status.installed||status.questionSupport!=='global-mcp')continue;
      try{
        const def=definitions[status.agent];let command='';
        if(def.toml){
          const text=this.readText(path.join(this.home,...def.toml)).text;
          const block=text.split(TOML_START)[1]?.split(TOML_END)[0];
          const match=block&&/^command\s*=\s*("(?:\\.|[^"\\])*")\s*$/m.exec(block);
          if(match)command=JSON.parse(match[1]);
        }else{
          const {value}=this.read(def.mcpFile?path.join(this.home,...def.mcpFile):this.file(status.agent));
          const server=value.mcpServers?.mohivx_island;if(oursMcp(server))command=server.command;
        }
        // Portable extraction directories can disappear after closing the app.
        // Repair only our missing app runtime after a user-confirmed connection.
        if(typeof command!=='string'||!path.isAbsolute(command)||path.basename(command).toLowerCase()!=='mohivx island.exe'||fs.existsSync(command))continue;
        const plan=this.preview(status.agent,true);this.apply(plan.id);refreshed.push(status.agent);
      }catch{failed.push(status.agent);}
    }
    return {refreshed,failed};
  }
  apply(id){return managed.applyPlan(this,id);}
}

function hookNextOrEmpty(v){return v;}

module.exports={validateToml,stripOwnedCodexToml,AgentHookConfig,merge,mergeMcpJson,mergeCodexToml,mergeInstructionsMarkdown,definitions,TOML_START,TOML_END,MD_START,MD_END};
