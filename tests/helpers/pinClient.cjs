const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),readline=require('node:readline');
let compiled,java;
function prepare(){
  if(compiled)return;
  const roots=[process.env.JAVA_HOME];
  const ms='C:/Program Files/Microsoft';if(fs.existsSync(ms))for(const name of fs.readdirSync(ms).filter(n=>n.startsWith('jdk-17')))roots.push(path.join(ms,name));
  const jdk=roots.find(root=>root&&fs.existsSync(path.join(root,'bin',process.platform==='win32'?'javac.exe':'javac')));
  java=jdk?path.join(jdk,'bin',process.platform==='win32'?'java.exe':'java'):'java';
  const javac=jdk?path.join(jdk,'bin',process.platform==='win32'?'javac.exe':'javac'):'javac';
  compiled=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-pin-'));
  execFileSync(javac,['-encoding','UTF-8','-d',compiled,path.join(__dirname,'../../android/app/src/main/java/com/mohivx/island/companion/PinPairing.java'),path.join(__dirname,'../fixtures/PinPairingHarness.java')],{windowsHide:true,timeout:20000});
  process.on('exit',()=>{if(path.dirname(compiled)===path.resolve(os.tmpdir())&&path.basename(compiled).startsWith('mohivx-pin-'))fs.rmSync(compiled,{recursive:true,force:true});});
}
async function pinClient(pin){
  prepare();const proc=spawn(java,['-cp',compiled,'PinPairingHarness'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const lines=readline.createInterface({input:proc.stdout})[Symbol.asyncIterator]();let error='';proc.stderr.on('data',b=>error+=b);
  const next=async()=>{const r=await lines.next();if(r.done)throw Error(error||'Pairing client exited');return r.value;};
  proc.stdin.write(pin+'\n');const A=await next();
  let key;
  return {A,get key(){return key;},proof:async(start,fingerprint)=>{proc.stdin.write(start.salt+'\n'+start.B+'\n'+fingerprint+'\n');return next();},verify:async(proof)=>{proc.stdin.end(proof+'\n');const valid=(await next())==='true';key=await next();return valid;},close:()=>proc.kill()};
}
module.exports={pinClient};
