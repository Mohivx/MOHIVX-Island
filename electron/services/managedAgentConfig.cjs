const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const TOML_START='# BEGIN MOHIVX ISLAND MCP',TOML_END='# END MOHIVX ISLAND MCP';
const MD_START='<!-- BEGIN MOHIVX ISLAND QUESTIONS -->',MD_END='<!-- END MOHIVX ISLAND QUESTIONS -->';
const hash=value=>crypto.createHash('sha256').update(value??Buffer.from('missing')).digest('hex');
const eol=text=>text.includes('\r\n')?'\r\n':'\n';
function validateToml(text){
 if(typeof text!=='string'||text.includes('\0'))throw Error('Cannot read the existing settings safely.');
 // Unrelated TOML belongs to its client. Never parse/reformat it with a partial parser.
}
function stripBlock(text,start,end){
 validateToml(text);
 const lines=[...text.matchAll(/[^\r\n]*(?:\r\n|\n|$)/g)].filter(m=>m[0]);
 const begins=lines.filter(m=>m[0].replace(/\r?\n$/,'')===start);
 const ends=lines.filter(m=>m[0].replace(/\r?\n$/,'')===end);
 if(!begins.length&&!ends.length)return text;
 if(begins.length!==1||ends.length!==1||begins[0].index>=ends[0].index)throw Error('Incomplete MOHIVX settings block. Review the settings first.');
 let first=begins[0].index,last=ends[0].index+ends[0][0].length;
 // The appended block owns exactly one preceding EOL and its ending EOL.
 if(text.slice(Math.max(0,first-2),first)==='\r\n')first-=2;
 else if(text[first-1]==='\n')first--;
 return text.slice(0,first)+text.slice(last);
}
function tablePaths(text){
 const result=[];let triple=null;
 for(const raw of text.split(/\r?\n/)){
  let visible='',quote=null,escape=false;
  for(let i=0;i<raw.length;i++){
   if(triple){if(raw.startsWith(triple,i)){i+=2;triple=null;}continue;}
   const c=raw[i];
   if(quote){visible+=c;if(escape)escape=false;else if(c==='\\'&&quote==='"')escape=true;else if(c===quote)quote=null;continue;}
   if(c==='#')break;
   if(raw.startsWith('"""',i)||raw.startsWith("'''",i)){triple=raw.slice(i,i+3);i+=2;continue;}
   if(c==='"'||c==="'")quote=c;
   visible+=c;
  }
  // Dotted target definitions conflict too; inline root tables cannot be extended.
  if(/^\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*=/.test(visible)||/^\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\.\s*(?:mohivx_island|"mohivx_island"|'mohivx_island')\s*(?:\.|=)/.test(visible))result.push(['mcp_servers','mohivx_island']);
  const header=/^\s*\[\[?\s*(.*?)\s*\]\]?\s*$/.exec(visible);
  if(!header)continue;
  const tokens=header[1].match(/"(?:\\.|[^"\\])*"|'[^']*'|[A-Za-z0-9_-]+|\./g);
  if(!tokens)continue;
  const parts=[];let expectedKey=true,valid=true;
  for(const token of tokens){
   if(!expectedKey){if(token!=='.'){valid=false;break;}expectedKey=true;continue;}
   if(token==='.'){valid=false;break;}
   try{parts.push(token[0]==='"'?JSON.parse(token):token[0]==="'"?token.slice(1,-1):token);}catch{valid=false;break;}
   expectedKey=false;
  }
  if(valid&&!expectedKey)result.push(parts);
 }
 return result;
}
function stripOwnedCodexToml(text){
 const base=stripBlock(text,TOML_START,TOML_END);
 if(tablePaths(base).some(parts=>parts[0]==='mcp_servers'&&parts[1]==='mohivx_island'))throw Error('An MCP server named mohivx_island already belongs to another tool.');
 return base;
}
function mergeCodexToml(text='',runtimeExe,mcpScript,install=true){
 const base=stripOwnedCodexToml(text);if(!install)return base;
 const nl=eol(base),block=[TOML_START,'[mcp_servers.mohivx_island]',`command = ${JSON.stringify(runtimeExe)}`,`args = [${JSON.stringify(mcpScript)}, "--agent", "codex"]`,'tool_timeout_sec = 120','','[mcp_servers.mohivx_island.env]','ELECTRON_RUN_AS_NODE = "1"','MOHIVX_QUESTION_AGENT = "codex"',TOML_END].join(nl);
 return base+nl+block+nl;
}
function mergeInstructionsMarkdown(text='',agent,runtimeExe,askScript,install=true){
 const base=stripBlock(text,MD_START,MD_END);if(!install)return base;
 const launcher=path.join(path.dirname(askScript),'mohivx-ask.cmd');
 const block=[MD_START,'## MOHIVX Island Questions',
 '- This is a persistent user preference for every local chat and project. Whenever a real question, clarification, or choice is needed, send it to MOHIVX Island through the terminal and wait for the actual answer.',
 `- Run ${JSON.stringify(launcher)} --agent ${agent} --question "Your question" --option "Choice A" --option "Choice B". In PowerShell, invoke the quoted path with &. Omit --option for a free-text question. The command waits and returns JSON {"answers":{"Your question":"actual user answer"}}.`,
 '- Do not duplicate a pending island question as a native chat question card. Do not infer consent from silence or choose on the user\'s behalf. Do not send unnecessary test questions.',
 '- If terminal tools are unavailable, use the `ask_user` MCP tool (`mohivx_island`) and wait for its actual answer.',
 `- For multiple questions, run ${JSON.stringify(runtimeExe)} with ELECTRON_RUN_AS_NODE=1 and ${JSON.stringify(askScript)}, sending JSON on stdin: {"questions":[{"question":"Your question","options":[{"label":"Choice A"},{"label":"Choice B"}],"multiSelect":false}]}. Up to four questions, 2000 bytes total.`,
 '- If the bridge is unavailable, dismissed, or timed out, explain and ask in chat as fallback. Host security approvals and higher-priority tool requirements still apply; never bypass them or replace them with an island answer.',MD_END].join(eol(base));
 return base+eol(base)+block+eol(base);
}
function questionLauncher(runtimeExe,askScript){
 const quote=value=>{if(typeof value!=='string'||/[\r\n"]/.test(value))throw Error('Invalid question launcher path.');return '"'+value.replace(/%/g,'%%')+'"';};
 return ['@echo off','setlocal','set "ELECTRON_RUN_AS_NODE=1"',`${quote(runtimeExe)} ${quote(askScript)} %*`,'exit /b %errorlevel%',''].join('\r\n');
}
function readText(file){
 try{const bytes=fs.readFileSync(file);if(bytes.length>2*1024*1024)throw Error('Too large');const text=bytes.toString('utf8');validateToml(text);return {bytes,text};}
 catch(error){if(error.code==='ENOENT')return {bytes:null,text:''};throw Error('Cannot read the existing settings safely.');}
}
function currentFile(file){try{return {bytes:fs.readFileSync(file),real:fs.realpathSync(file)};}catch(error){if(error.code==='ENOENT')return {bytes:null,real:path.resolve(file)};throw error;}}
function checkTarget(target){const current=currentFile(target.file);if(hash(current.bytes)!==target.beforeHash||current.real!==target.real)throw Error('Settings changed. Review the new changes first.');}
function applyPlan(context,id){
 const plan=context.plans.get(id);context.plans.delete(id);
 if(!plan||plan.expires<Date.now())throw Error('Preview expired. Review again.');
 if(plan.install&&!fs.existsSync(context.exe))throw Error('Agent relay is unavailable.');
 for(const target of plan.targets)checkTarget(target);
 if(plan.install)context.ensureBridgeScripts();
 const backups=[],committed=[],temps=[];
 try{
  for(let i=0;i<plan.targets.length;i++){
   const target=plan.targets[i];if(!target.changed)continue;
   checkTarget(target);
   fs.mkdirSync(path.dirname(target.real),{recursive:true});
   const mode=target.beforeBytes?fs.statSync(target.real).mode:0o600;
   if(target.beforeBytes){const backup=target.real+'.mohivx-backup-'+crypto.randomUUID();fs.writeFileSync(backup,target.beforeBytes,{flag:'wx',mode});backups.push(backup);}
   const tmp=target.real+'.mohivx-'+crypto.randomUUID();temps.push(tmp);
   fs.writeFileSync(tmp,target.after,{flag:'wx',mode});
   checkTarget(target);
   fs.renameSync(tmp,target.real);
   committed.push({...target,mode,afterHash:hash(target.after)});
   context.options.onAfterTargetWrite?.(target,i);
  }
 }catch(error){
  for(const target of committed.reverse()){
   try{
    const current=currentFile(target.file);
    if(current.real!==target.real||hash(current.bytes)!==target.afterHash)continue;
    if(target.beforeBytes===null)fs.unlinkSync(target.real);
    else{const tmp=target.real+'.mohivx-restore-'+crypto.randomUUID();temps.push(tmp);fs.writeFileSync(tmp,target.beforeBytes,{flag:'wx',mode:target.mode});if(hash(currentFile(target.file).bytes)===target.afterHash)fs.renameSync(tmp,target.real);}
   }catch{}
  }
  throw error;
 }finally{for(const tmp of temps){try{fs.unlinkSync(tmp);}catch{}}}
 return {success:true,backup:backups[0]||null,backups,paths:plan.paths,agent:plan.agent,installed:plan.install};
}
module.exports={readText,validateToml,stripOwnedCodexToml,mergeCodexToml,mergeInstructionsMarkdown,questionLauncher,applyPlan};
