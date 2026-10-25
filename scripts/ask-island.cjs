// Explicit local question bridge. Native code verifies the pipe owner's Windows SID.
const path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
let sequence=0;
async function ask(input,{dir=process.env.MOHIVX_DATA_DIR||path.join(os.homedir(),'.mohivx-island'),timeout=Number(process.env.MOHIVX_QUESTION_TIMEOUT_MS)||21600000,endpoint=process.env.MOHIVX_HOOK_PIPE}={}){
 const questions=input?.questions;if(!Array.isArray(questions)||!questions.length||questions.length>4)throw Error('Provide one to four questions.');
 for(const q of questions)if(typeof q.question!=='string'||!q.question.trim()||q.question.length>1000||!Array.isArray(q.options)||q.options.length>8||q.options.some(o=>typeof o.label!=='string'||!o.label.trim()||o.label.length>200||o.description&&typeof o.description!=='string'))throw Error('Invalid question or options.');
 if(new Set(questions.map(q=>q.question)).size!==questions.length)throw Error('Question text must be unique.');
 if(Buffer.byteLength(JSON.stringify({questions}))>2000)throw Error('Keep the questions shorter than 2000 bytes.');
 const candidates=[path.join(dir,'bin','mohivx-hook.exe'),path.join(__dirname,'mohivx-hook.exe'),path.join(__dirname,'..','bin','mohivx-hook.exe')];
 const executable=candidates.find(file=>{try{return execFileSync(file,['--supports-island-questions'],{windowsHide:true,input:'',timeout:5000,encoding:'utf8'}).trim()==='1';}catch{return false;}});
 if(!executable)throw Error('Update or open MOHIVX on Windows to enable island questions.');
 const sessionKey=String(input.session||process.env.CODEX_THREAD_ID||process.env.MOHIVX_SESSION_ID||('desktop-'+process.pid+'-'+(++sequence))).trim();
 const suppliedAgent=input.agent||process.env.MOHIVX_QUESTION_AGENT;
 const origin=['codex','gemini','antigravity','claude'].includes(suppliedAgent)?suppliedAgent:'codex';
 const payload={coucou_agent:'codex',mohivx_source:'desktop-question-bridge',mohivx_question_agent:origin,session_id:'island-question:'+crypto.createHash('sha256').update(sessionKey).digest('hex'),cwd:process.cwd(),hook_event_name:'PermissionRequest',tool_name:'AskUserQuestion',tool_input:{questions}};
 const env={...process.env,MOHIVX_HOOK_LINK_FILE:path.join(dir,'bin','hook-link.json'),...(endpoint?{MOHIVX_HOOK_PIPE:endpoint}:{})};
 return new Promise((resolve,reject)=>{const child=spawn(executable,['--ask-island'],{windowsHide:true,env,stdio:['pipe','pipe','pipe']});let output='',error='',settled=false,pendingError=null;const finish=(failure,value)=>{if(settled)return;settled=true;clearTimeout(timer);child.kill();failure?reject(failure):resolve(value);};const timer=setTimeout(()=>{pendingError=Error('No answer received in the island. Ask in chat as fallback.');child.kill();},timeout);
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdin.on('error',()=>{});child.on('error',()=>finish(Error('Open MOHIVX and enable the agent bridge.')));child.stdout.on('data',s=>{output+=s;if(output.length>20000)finish(Error('Invalid island answer.'));});child.stderr.on('data',s=>error=(error+s).slice(-8000));child.on('close',code=>{if(settled)return;if(pendingError)return finish(pendingError);try{if(code!==0)throw Error();const reply=JSON.parse(output);if(!reply.answers||Object.keys(reply.answers).length!==questions.length||questions.some(q=>typeof reply.answers[q.question]!=='string'||!reply.answers[q.question].trim()))throw Error();finish(null,reply);}catch{finish(Error(error.trim()||'Question expired or was dismissed.'));}});child.stdin.end(JSON.stringify(payload));
 });
}
function parseCli(args){
 const input={questions:[{question:'',options:[],multiSelect:false}]};
 for(let i=0;i<args.length;i++){
  const key=args[i];
  if(key==='--multi-select'){input.questions[0].multiSelect=true;continue;}
  if(!['--question','--option','--session','--agent'].includes(key)||typeof args[i+1]!=='string'||args[i+1].startsWith('--'))throw Error('Use --question "Question" --option "Choice A" --option "Choice B", or JSON on stdin.');
  const value=args[++i];
  if(key==='--question'){if(input.questions[0].question)throw Error('Use JSON on stdin for multiple questions.');input.questions[0].question=value;}
  else if(key==='--session')input.session=value;
  else if(key==='--agent'){if(!['codex','gemini','antigravity','claude'].includes(value))throw Error('Unsupported question agent.');input.agent=value;}
  else input.questions[0].options.push({label:value});
 }
 if(!input.questions[0].question.trim())throw Error('Provide a question.');
 return input;
}
module.exports={ask,parseCli};
if(require.main===module){
 const run=async input=>{try{console.log(JSON.stringify(await ask(input)));}catch(error){console.error(error.message);process.exitCode=1;}};
 if(process.argv.length>2){try{void run(parseCli(process.argv.slice(2)));}catch(error){console.error(error.message);process.exitCode=1;}}
 else {let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{try{void run(JSON.parse(input));}catch(error){console.error(error.message);process.exitCode=1;}});}
}
