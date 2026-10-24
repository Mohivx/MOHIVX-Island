const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {parseCli}=require('../scripts/ask-island.cjs');
const {setupAgentRouting}=require('../scripts/setup-agent-routing.cjs');
const {questionLauncher}=require('../electron/services/managedAgentConfig.cjs');
function temporary(t){const home=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-routing-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));return home;}
test('terminal question arguments keep Arabic choices, actual source and free text without inventing a response',()=>{
 assert.deepEqual(parseCli(['--agent','antigravity','--question','أي لون تريد؟','--option','الأزرق','--option','البنفسجي','--session','chat-2']),{agent:'antigravity',session:'chat-2',questions:[{question:'أي لون تريد؟',options:[{label:'الأزرق'},{label:'البنفسجي'}],multiSelect:false}]});
 assert.deepEqual(parseCli(['--question','ما التفاصيل؟']).questions[0].options,[]);
 assert.equal(parseCli(['--question','اختر','--multi-select']).questions[0].multiSelect,true);
 for(const args of [['--question'],['--agent','unknown','--question','Q'],['--question','Q','--question','R'],['--question','Q','--unknown','value']])assert.throws(()=>parseCli(args));
});
test('the terminal launcher scopes its environment and safely quotes spaces and literal percent paths',()=>{
 const cmd=questionLauncher('C:\\MOHIVX 100%\\Island.exe','C:\\Users\\اسم المستخدم\\ask-island.cjs');
 assert.ok(cmd.includes('setlocal\r\n'));assert.ok(cmd.includes('100%%'));assert.ok(cmd.includes('"C:\\Users\\اسم المستخدم\\ask-island.cjs" %*'));assert.ok(!cmd.includes('setx'));assert.throws(()=>questionLauncher('bad\r\ncommand','ask.cjs'));
});
test('installer routing connects detected clients, preserves unrelated settings, and repeats without duplicate rules or backups',t=>{
 const home=temporary(t),dir=path.join(home,'.codex');fs.mkdirSync(dir);
 const toml='model = "my-model"\r\n[mcp_servers.other]\r\ncommand = "keep.exe"';fs.writeFileSync(path.join(dir,'config.toml'),toml);fs.writeFileSync(path.join(dir,'AGENTS.md'),'# Keep my rules\r\n');
 fs.mkdirSync(path.join(home,'.gemini/config'),{recursive:true});const invalid='{this is not JSON}';fs.writeFileSync(path.join(home,'.gemini/config/mcp_config.json'),invalid);
 const options={home,sourceRoot:path.resolve(__dirname,'..'),runtimeExe:process.execPath};
 const first=setupAgentRouting(options);assert.equal(first.success,false);assert.deepEqual(first.connected,['codex']);assert.equal(first.failed[0].agent,'antigravity');assert.ok(first.backups.length>=2);
 const instructions=fs.readFileSync(path.join(dir,'AGENTS.md'),'utf8');assert.ok(instructions.startsWith('# Keep my rules\r\n'));assert.ok(instructions.includes('persistent user preference for every local chat'));assert.ok(instructions.includes('mohivx-ask.cmd'));assert.ok(instructions.includes('--agent codex'));assert.ok(instructions.includes('Host security approvals'));
 assert.ok(fs.readFileSync(path.join(dir,'config.toml'),'utf8').startsWith(toml));assert.equal(fs.readFileSync(path.join(home,'.gemini/config/mcp_config.json'),'utf8'),invalid);
 assert.equal(fs.existsSync(path.join(home,'.claude')),false);assert.equal(fs.existsSync(path.join(home,'.gemini/settings.json')),false);assert.equal(fs.existsSync(path.join(home,'.mohivx-island/bin/hook-link.json')),false);
 assert.ok(fs.existsSync(path.join(home,'.mohivx-island/bin/mohivx-ask.cmd')));
 const second=setupAgentRouting(options);assert.deepEqual(second.backups,[]);assert.equal(fs.readFileSync(path.join(dir,'AGENTS.md'),'utf8'),instructions);assert.equal(instructions.split('<!-- BEGIN MOHIVX ISLAND QUESTIONS -->').length,2);
 const backup=first.backups.find(p=>p.includes('config.toml'));assert.equal(fs.readFileSync(backup,'utf8'),toml);
});
test('setup never creates missing client configs and requires an explicit install invocation',t=>{
 const home=temporary(t),emptyHome=path.join(home,'no-user-configs');
 const result=setupAgentRouting({home:emptyHome,sourceRoot:path.resolve(__dirname,'..'),runtimeExe:process.execPath});assert.equal(result.success,true);assert.deepEqual(result.connected,[]);assert.equal(fs.existsSync(path.join(emptyHome,'.codex')),false);
 const untouched=path.join(home,'must-not-exist');const child=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/setup-agent-routing.cjs'),'--home',untouched],{windowsHide:true,encoding:'utf8'});assert.equal(child.status,1);assert.equal(JSON.parse(child.stdout).success,false);assert.equal(fs.existsSync(untouched),false);
 assert.throws(()=>setupAgentRouting({home,agents:['unknown']}));
});
