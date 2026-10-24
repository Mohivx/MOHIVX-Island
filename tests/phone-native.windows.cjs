// Only invalid inputs are sent. Every case must fail before Windows input/audio APIs.
const {spawn}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const requests=[
 {action:'input',input:{type:'move',dx:2001,dy:0}},
 {action:'input',input:{type:'click',button:'middle'}},
 {action:'input',input:{type:'text',text:'x'.repeat(2001)}},
 {action:'input',input:{type:'key',key:'shell'}},
 {action:'audio',device:-1,rate:16000,data:'AAAA'},
];
const child=spawn(process.argv[2]||path.resolve(__dirname,'../bin/mohivx-phone.exe'),[],{windowsHide:true,stdio:['pipe','pipe','pipe']});let text='',error='';
child.stdout.on('data',part=>text+=part);child.stderr.on('data',part=>error+=part);child.on('error',error=>{console.error(error.message);process.exitCode=1;});
const timeout=setTimeout(()=>{child.kill();process.exitCode=1;},10000);
child.on('close',code=>{clearTimeout(timeout);try{assert.equal(code,0);assert.equal(error,'');const replies=text.trim().split(/\r?\n/).map(line=>JSON.parse(line));assert.equal(replies.length,requests.length);replies.forEach((reply,i)=>{assert.equal(reply.id,i);assert.equal(reply.success,false);assert.match(reply.error,/Invalid|Unsupported|too long/i);});console.log('Native validation passed: '+replies.length+' invalid actions rejected before Windows input/audio.');}catch(error){console.error(error.message);process.exitCode=1;}});
child.stdin.end(requests.map((request,id)=>JSON.stringify({id,...request})).join('\n')+'\n');
