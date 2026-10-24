const http=require('node:http'),https=require('node:https'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
class RemoteLink{
 constructor(gateway,exe,dir,options={}){this.gateway=gateway;this.exe=exe;this.dir=dir;this.spawn=options.spawn||spawn;this.qr=options.qr;this.server=null;this.child=null;this.url='';this.qrImage='';this.error='';this.starting=null;this.generation=0;}
 status(){return {enabled:Boolean(this.child&&this.url),starting:Boolean(this.starting),url:this.url,qr:this.qrImage,error:this.error,experimental:true};}
 async proxy(req,res){
  const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   const route=new URL(req.url,'http://localhost').pathname;
   if(route==='/connect'&&req.method==='GET'&&this.url){const deep='mohivx://connect?endpoint='+encodeURIComponent(this.url);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'Cache-Control':'no-store'});return res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>MOHIVX</title><body style="background:#0e0f12;color:#f3f4f6;font:18px system-ui;text-align:center;padding:15vh 25px"><h1>MOHIVX</h1><p>افتح التطبيق ثم أدخل الأرقام الستة الظاهرة على الكمبيوتر.</p><a style="display:inline-block;background:#8ab4ff;color:#0e0f12;padding:15px 24px;border-radius:30px" href="'+deep+'">فتح MOHIVX</a><p style="font-size:13px;color:#9398a1">Open the app, then enter the six-digit code from your PC.</p>');}
   if(req.headers.origin||req.method!=='POST'||!['/api/secure','/api/pair/start','/api/pair/finish'].includes(route))return send(403,{success:false,error:'Encrypted app connections only.'});
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4000000)throw Error('Request too large.');chunks.push(chunk);}const bytes=Buffer.concat(chunks),data=JSON.parse(bytes);
   if(route==='/api/pair/start'&&data.secure!==true||route==='/api/pair/finish'&&this.gateway.challenges.get(data.session)?.secure!==true)return send(403,{success:false,error:'Update the phone app for encrypted pairing.'});
   const cert=JSON.parse(fs.readFileSync(path.join(this.gateway.dir,'companion-tls.json'),'utf8')).cert;
   const forward=https.request({hostname:'127.0.0.1',port:this.gateway.port,path:route,method:'POST',ca:cert,checkServerIdentity:(_host,peer)=>crypto.createHash('sha256').update(peer.raw).digest('hex')===this.gateway.fingerprint?undefined:Error('PC identity mismatch'),headers:{'Content-Type':'application/json','Content-Length':bytes.length}},upstream=>{res.writeHead(upstream.statusCode,{'Content-Type':'application/json','Cache-Control':'no-store'});upstream.pipe(res);});
   forward.setTimeout(70000,()=>forward.destroy());forward.on('error',()=>{if(!res.headersSent)send(502,{success:false,error:'PC service unavailable.'});else res.destroy();});req.on('aborted',()=>forward.destroy());forward.end(bytes);
  }catch{if(!res.headersSent)send(400,{success:false,error:'Invalid app request.'});else res.destroy();}
 }
 async start(){if(this.child&&this.url)return this.status();if(this.starting)return this.starting;this.starting=this.open().finally(()=>this.starting=null);return this.starting;}
 async open(){
  const generation=this.generation;
  if(!fs.existsSync(this.exe))throw Error('Remote helper is unavailable.');await this.gateway.start();if(generation!==this.generation)throw Error('Connection cancelled.');this.error='';
  const server=http.createServer((req,res)=>void this.proxy(req,res));await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});if(generation!==this.generation){server.close();throw Error('Connection cancelled.');}this.server=server;server.requestTimeout=20000;server.headersTimeout=10000;
  fs.mkdirSync(this.dir,{recursive:true});const config=path.join(this.dir,'remote-config.yml');fs.writeFileSync(config,'loglevel: info\n');
  const child=this.spawn(this.exe,['tunnel','--config',config,'--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:'+server.address().port],{windowsHide:true,stdio:['ignore','pipe','pipe']});this.child=child;
  try{
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Remote connection did not start.')),35000);let log='';
    const read=bytes=>{log=(log+bytes.toString()).slice(-12000);const match=log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);if(match&&!this.url){this.url=match[0];clearTimeout(timer);resolve();}};
    child.stdout.on('data',read);child.stderr.on('data',read);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);if(this.child===child){this.child=null;this.url='';this.qrImage='';this.server?.closeAllConnections();this.server?.close();this.server=null;}reject(Error('Remote connection stopped.'));});
   });
   const qr=this.qr?await this.qr(this.url+'/connect'):'';if(generation!==this.generation||this.child!==child)throw Error('Connection cancelled.');this.qrImage=qr;return this.status();
  }catch(error){const cancelled=generation!==this.generation;this.stop();if(!cancelled)this.error='Could not start the remote connection.';throw error;}
 }
 stop(){this.generation++;const child=this.child;this.child=null;child?.kill();this.server?.closeAllConnections();this.server?.close();this.server=null;this.url='';this.qrImage='';}
}
module.exports=RemoteLink;
