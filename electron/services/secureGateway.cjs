const {begin:beginPin,equalHex}=require('./pinPairing.cjs');
const {startDiscovery}=require('./companionDiscovery.cjs');
const https = require('node:https');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {seal,open}=require('./secureEnvelope.cjs');
const {validateInput}=require('./phoneBridge.cjs');
const {localAddress,directAddresses}=require('./directAddress.cjs');
const SECURE_REQUEST=Symbol('authenticated envelope');
const CAPS = ['telemetry', 'volume', 'wallpaper', 'apps', 'ai', 'agents', 'agentApprovals', 'power','remoteInput','desktopView','phoneScreen','phoneCamera','phoneMic','phoneAudio','phoneData','phoneFilesWrite','phoneMessages','phoneContacts','phoneCalls','phoneControl','phoneMedia','phoneClipboard'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
class AndroidGatewayService {
  constructor(port = 9120, appDataDir, log = () => {}, options = {}) {
    this.port = port; this.dir = appDataDir; this.log = log; this.options = options; this.providers = {}; this.devices = []; this.server = null; this.pairing = null; this.starting = null; this.inflight = new Set(); this.challenges=new Map(); this.discovery=null;
    this.file = path.join(appDataDir, 'paired-devices.json');
    try { const d = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (Array.isArray(d)) {this.devices=d;this.devices.forEach(item=>delete item.liveCounter);} } catch {}
  }
  setProviders(providers) { this.providers = providers; }
  persist() { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(this.file+'.tmp', JSON.stringify(this.devices.map(({liveCounter,liveMediaCounters,...device})=>device))); fs.renameSync(this.file+'.tmp', this.file); }
  async start() {
    if (this.server?.listening) return this.status();
    if (this.starting) return this.starting;
    this.starting = this.open().finally(() => { this.starting = null; }); return this.starting;
  }
  async open() {
    const identityFile = path.join(this.dir, 'companion-tls.json'); let identity;
    try { identity = JSON.parse(fs.readFileSync(identityFile, 'utf8')); identity.key = this.options.decode ? this.options.decode(identity.key) : identity.key; new crypto.X509Certificate(identity.cert); } catch { identity = null; }
    if (!identity) {
      const pems = await require('selfsigned').generate([{ name: 'commonName', value: 'MOHIVX Companion' }], { keyType: 'rsa', keySize: 2048, algorithm: 'sha256', notAfterDate: new Date(Date.now()+5*365*86400000) });
      identity = { key: pems.private, cert: pems.cert };
      fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(identityFile, JSON.stringify({ cert: identity.cert, key: this.options.encode ? this.options.encode(identity.key) : identity.key }), { mode: 0o600 });
    }
    this.fingerprint = hash(new crypto.X509Certificate(identity.cert).raw);
    const server = https.createServer({ key: identity.key, cert: identity.cert, minVersion: 'TLSv1.2' }, (req, res) => void this.handle(req, res));
    server.requestTimeout = 20000; server.headersTimeout = 10000;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen({port:this.port,host:this.options.host||'::',ipv6Only:false}, resolve); });
    this.server = server; this.port = server.address().port;
    server.on('error', error => this.log('Companion HTTPS: '+(error.code || 'server error')));
    if(this.options.discovery!==false)this.discovery=startDiscovery(this,{port:this.options.discoveryPort||9121,host:this.options.host||'0.0.0.0'});
    return this.status();
  }
  stop() { this.providers.phoneSync?.clear();this.providers.phoneMedia?.clearAll();this.pairing = null; this.challenges.clear();try{this.discovery?.close();}catch{}this.discovery=null; this.server?.closeAllConnections(); this.server?.close(); this.server = null; }
  status() {
    const hosts = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    return { enabled: Boolean(this.server?.listening), port: this.port, fingerprint: this.fingerprint || '', hosts, directAddresses:directAddresses(os.networkInterfaces(),this.port), connectionMode:'direct', discoveryError:this.discoveryError||null, pairing: this.pairing && this.pairing.expires > Date.now() && this.pairing.attempts<5 ? { pin: this.pairing.pin, expires: this.pairing.expires } : null, devices: this.devices.map(({ tokenHash,transportKey,counterReserved,liveCounter,mediaCounterReserved,liveMediaCounters, ...d }) => d) };
  }
  generateNewPin() { if (!this.server?.listening) throw new Error('Start the companion connection first.'); this.challenges.clear();this.pairing = { pin: crypto.randomInt(0,1000000).toString().padStart(6,'0'), expires: Date.now()+120000, attempts: 0 }; return this.status(); }
  revoke(id) { this.providers.phoneSync?.revoke(id);this.providers.phoneMedia?.clear(id);this.devices = this.devices.filter(d => d.id !== id); this.persist(); return this.status(); }
  setCapabilities(id, capabilities) {
    const d = this.devices.find(d => d.id === id); if (!d) throw new Error('Device not found.');
    if(!Array.isArray(capabilities))throw Error('Invalid permissions.');d.capabilities = CAPS.filter(c => capabilities.includes(c));for(const [kind,cap]of Object.entries({camera:'phoneCamera',screen:'phoneScreen',mic:'phoneMic',audio:'phoneAudio'}))if(!d.capabilities.includes(cap))this.providers.phoneMedia?.clear(id,kind);if(!d.capabilities.includes('phoneData')&&!d.capabilities.includes('phoneClipboard'))this.providers.phoneSync?.clearShares?.(id);if(!d.capabilities.includes('phoneClipboard'))this.providers.phoneSync?.clearClipboard?.(id);this.persist(); return this.status();
  }
  async body(req,limit=65536) {
    let size = 0, bytes = [];
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('Request too large.'); bytes.push(chunk); }
    return JSON.parse(Buffer.concat(bytes).toString('utf8') || '{}');
  }
  async handle(req, res) {
    const reply = (status, value) => { if (res.destroyed) return; res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    try {
      if (req.headers.origin) return reply(403, { success:false, error:'Browser access is disabled.' });
      const route = new URL(req.url, 'https://localhost').pathname;
      const external=Boolean(req.socket?.remoteAddress&&!localAddress(req.socket.remoteAddress));
      if(external&&!req[SECURE_REQUEST]&&!['/api/secure','/api/pair/start','/api/pair/finish'].includes(route))return reply(403,{success:false,error:'Encrypted app connections only.'});
      if(route==='/api/secure'&&req.method==='POST'){
        const envelope=await this.body(req,4000000),device=this.devices.find(d=>d.id===envelope.device);
        if(!device?.transportKey||!Number.isSafeInteger(envelope.counter)||envelope.counter<=0||envelope.counter>Number.MAX_SAFE_INTEGER-4096)return reply(401,{success:false,error:'Encrypted connection unavailable.'});
        const lane=envelope.lane || '';
        if(lane && !['camera','screen','mic'].includes(lane))return reply(400,{success:false,error:'Unsupported media lane.'});
        const key=this.options.decode?this.options.decode(device.transportKey):device.transportKey,counter=envelope.counter,scope=device.id+':'+(lane?lane+':':'')+counter;
        const request=open(key,'request:'+scope,envelope),respond=value=>reply(200,{success:true,...seal(key,'response:'+scope,value)});
        const last=lane?(device.liveMediaCounters?.[lane]??device.mediaCounterReserved?.[lane]??0):(device.liveCounter??device.counterReserved??0);
        if(counter<=last)return respond({success:false,code:'COUNTER',minimumCounter:last});
        if(!request||!['GET','POST'].includes(request.method)||typeof request.route!=='string'||!/^\/api\/[a-z-]+$/.test(request.route)||request.route.startsWith('/api/pair')||request.route==='/api/secure'||hash(String(request.token))!==device.tokenHash)return reply(401,{success:false,error:'Invalid encrypted request.'});
        if(lane && (request.method!=='POST' || (request.route!=='/api/phone-'+lane && !(request.route==='/api/phone-stop'&&request.body?.kind===lane))))return respond({success:false,error:'Only matching media packets are allowed in this lane.'});
        if(lane){
          device.mediaCounterReserved ||= {};device.liveMediaCounters ||= {};
          if(counter>(device.mediaCounterReserved[lane]||0)){device.mediaCounterReserved[lane]=counter+512;this.persist();}device.liveMediaCounters[lane]=counter;
        }else{
          if(counter>(device.counterReserved||0)){device.counterReserved=counter+512;this.persist();}device.liveCounter=counter;
        }
        const {Readable}=require('node:stream');const nested=Readable.from(request.body==null?[]:[Buffer.from(JSON.stringify(request.body))]);nested.method=request.method;nested.url=request.route;nested.headers={authorization:'Bearer '+request.token};nested[SECURE_REQUEST]=true;
        let status=500;const response={destroyed:false,writeHead:value=>{status=value;},end:body=>respond({...JSON.parse(body),httpStatus:status})};
        return await this.handle(nested,response);
      }
      if (route === '/api/pair/start' && req.method === 'POST') {
        const data=await this.body(req),pairing=this.pairing;
        if(external&&data.secure!==true)return reply(403,{success:false,error:'Encrypted pairing required.'});
        if(!pairing||pairing.expires<=Date.now()||pairing.attempts>=5)return reply(403,{success:false,error:'Pairing closed. Generate a new PIN on your PC.'});
        pairing.attempts++;
        const proof=beginPin(pairing.pin,data.A,this.fingerprint),session=crypto.randomBytes(16).toString('hex');
        for(const [id,item] of this.challenges)if(item.expires<=Date.now())this.challenges.delete(id);
        this.challenges.set(session,{...proof,secure:data.secure===true,pairing,expires:Math.min(pairing.expires,Date.now()+30000)});
        return reply(200,{success:true,session,salt:proof.salt,B:proof.B,fingerprint:this.fingerprint,protocol:data.secure===true?3:2});
      }
      if (route === '/api/pair/finish' && req.method === 'POST') {
        const data=await this.body(req),challenge=this.challenges.get(data.session);this.challenges.delete(data.session);
        if(external&&challenge?.secure!==true)return reply(403,{success:false,error:'Encrypted pairing required.'});
        if(!challenge||challenge.pairing!==this.pairing||challenge.pairing.expires<=Date.now()||challenge.expires<=Date.now()||!equalHex(data.proof,challenge.client))return reply(401,{success:false,error:'Incorrect or expired PIN.'});
        const token=crypto.randomBytes(32).toString('hex');
        const device={id:crypto.randomUUID(),name:String(data.name||'Android').slice(0,80),tokenHash:hash(token),pairedAt:Date.now(),capabilities:['telemetry']};
        if(challenge.secure){device.transportKey=this.options.encode?this.options.encode(challenge.key):challenge.key;device.counterReserved=0;}
        this.devices.push(device);this.pairing=null;this.challenges.clear();this.persist();
        const details={success:true,token,id:device.id,capabilities:device.capabilities};
        return reply(200,challenge.secure?{success:true,proof:challenge.server,sealed:seal(challenge.key,'pair:'+data.session,details)}:{...details,proof:challenge.server});
      }
      const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
      const device = token && this.devices.find(d => d.tokenHash === hash(token));
      if (!device) return reply(401, { success:false, error:'Pair this device again.' });
      device.lastSeen=Date.now();
      if(route==='/api/phone-sync'&&req.method==='POST'){
        const data=await this.body(req,1500000);
        if(!this.devices.includes(device))return reply(403,{success:false,error:'Device revoked.'});
        const value=this.providers.phoneSync.exchange(device,data);
        let requests=[];
        if(device.capabilities.includes('agents')&&device.capabilities.includes('agentApprovals')){
          const snapshot=await this.providers.agentCenter.getAllStatuses();
          requests=(snapshot.pendingApprovals||[]).filter(p=>p.source==='hook').slice(0,20).map(p=>({id:p.id,fingerprint:p.fingerprint,agent:p.agent||p.agentName||p.provider,title:String(p.title||'').slice(0,300),description:String(p.questions?.map(q=>q.question).join(' · ')||p.detail||p.description||p.summary||'').slice(0,1000)}));
        }
        if(!this.devices.includes(device))return reply(403,{success:false,error:'Device revoked.'});
        return reply(200,{...value,requests:device.capabilities.includes('agentApprovals')?requests:[]});
      }
      if(route==='/api/phone-clipboard'&&req.method==='POST'){
        if(!this.devices.includes(device)||!device.capabilities.includes('phoneClipboard'))return reply(403,{success:false,error:'Enable this device permission on the PC.'});
        const data=await this.body(req,131072);
        if(!this.devices.includes(device)||!device.capabilities.includes('phoneClipboard'))return reply(403,{success:false,error:'Permission revoked.'});
        return reply(200,{success:true,...this.providers.phoneSync.receiveClipboard(device,data,'phone')});
      }
      if(route==='/api/phone-share'&&req.method==='POST'){
        const data=await this.body(req,262144);
        const allowed=data?.kind==='text'?(device.capabilities.includes('phoneData')||device.capabilities.includes('phoneClipboard')):device.capabilities.includes('phoneData');
        if(!this.devices.includes(device)||!allowed)return reply(403,{success:false,error:'Enable this device permission on the PC.'});
        const value=this.providers.phoneSync.receiveShare(device,data);
        if(!this.devices.includes(device))return reply(403,{success:false,error:'Device revoked.'});
        return reply(200,{success:true,...value});
      }
      if(route==='/api/phone-stop'&&req.method==='POST'){const data=await this.body(req);return reply(200,this.providers.phoneMedia?.clear(device.id,['camera','screen','mic','audio'].includes(data.kind)?data.kind:undefined)||{success:true});}
      if(route==='/api/phone-start'&&req.method==='POST'){const data=await this.body(req),permission={camera:'phoneCamera',screen:'phoneScreen',mic:'phoneMic',audio:'phoneAudio'}[data.kind];if(!permission||!this.devices.includes(device)||!device.capabilities.includes(permission))return reply(403,{success:false,error:'Enable this device permission on the PC.'});return reply(200,{...this.providers.phoneMedia.begin(device.id,data.kind),mediaLanes:true});}
      if (route === '/api/status' && req.method === 'GET') return reply(200, { success:true, name:'MOHIVX Island', capabilities:device.capabilities,mediaLanes:true,remoteEndpoint:this.options.remoteEndpoint?.()||'' });
      const capability = { '/api/telemetry':'telemetry', '/api/volume':'volume', '/api/wallpapers':'wallpaper', '/api/wallpaper':'wallpaper', '/api/apps':'apps', '/api/launch':'apps', '/api/ask':'ai', '/api/agents':'agents', '/api/agent-decision':'agentApprovals', '/api/power':'power','/api/remote-input':'remoteInput','/api/pc-screen':'desktopView','/api/phone-screen':'phoneScreen','/api/phone-camera':'phoneCamera','/api/phone-mic':'phoneMic','/api/phone-audio':'phoneAudio' }[route];
      if (!capability) return reply(404, { success:false, error:'Unknown endpoint.' });
      if (!device.capabilities.includes(capability)) return reply(403, { success:false, error:'Enable this device permission on the PC.' });
      const inflightKey=device.id+':'+(['/api/phone-camera','/api/phone-screen','/api/phone-mic','/api/phone-audio'].includes(route)?route:'control');
      if (this.inflight.has(inflightKey)) return reply(429, { success:false, error:'Wait for the current action.' });
      this.inflight.add(inflightKey);
      try {
        let value;
        if (req.method === 'GET' && route === '/api/telemetry') value = { telemetry: await this.providers.telemetry() };
        else if(req.method==='GET'&&route==='/api/pc-screen')value=await this.providers.desktop.screen();
        else if (req.method === 'GET' && route === '/api/wallpapers') value = { wallpapers: (await this.providers.wallpaper.getList()).map(({ id,name }) => ({id,name})) };
        else if (req.method === 'GET' && route === '/api/apps') value = { apps: (await this.providers.apps.list()).map(({ id,name }) => ({id,name})) };
        else if (req.method === 'GET' && route === '/api/agents') {
          const snapshot=await this.providers.agentCenter.getAllStatuses();
          value={agents:{...snapshot,hookIntegrations:[],pendingApprovals:device.capabilities.includes('agentApprovals')?(snapshot.pendingApprovals||[]).filter(p=>p.source==='hook'):[],hermes:snapshot.hermes?{...snapshot.hermes,pendingApprovals:[]}:undefined}};
        }
        else if (req.method === 'POST') {
          const data = await this.body(req,route.startsWith('/api/phone-')?1500000:65536);
          if (!this.devices.includes(device) || !device.capabilities.includes(capability)) return reply(403, {success:false,error:'Permission revoked.'});
          if (route === '/api/volume') { if (!Number.isInteger(data.value) || data.value < 0 || data.value > 100) throw new Error('Volume must be 0–100.'); value = await this.providers.audio.setVolume(data.value); }
          else if(route==='/api/remote-input')value=await this.providers.input.send(validateInput(data));
          else if(['/api/phone-screen','/api/phone-camera','/api/phone-mic','/api/phone-audio'].includes(route))value=this.providers.phoneMedia.publish(device.id,route.slice('/api/phone-'.length),data);
          else if (route === '/api/wallpaper') { const item = (await this.providers.wallpaper.getList()).find(i => i.id === data.id); if (!item) throw new Error('Unknown wallpaper.'); value = await this.providers.wallpaper.set(item.filePath); }
          else if (route === '/api/launch') { const item = (await this.providers.apps.list()).find(i => i.id === data.id); if (!item) throw new Error('Unknown app.'); value = await this.providers.apps.launch(item); }
          else if (route === '/api/ask') { if (typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 4000) throw new Error('Enter a question under 4000 characters.'); value = await this.providers.ask(data.prompt); }
          else if (route === '/api/agent-decision') {
            if(!device.capabilities.includes('agents')||typeof data.id!=='string'||!data.id.startsWith('hook:')||!['allow_once','deny','answer'].includes(data.optionId)||!/^[a-f0-9]{64}$/.test(data.fingerprint||''))throw Error('Review a current agent request first.');
            value=await this.providers.agentCenter.approveAction(data.id,data.optionId,data.fingerprint,data.answers);
          }
          else if (route === '/api/power') { if (data.action !== 'lock' || data.confirmed !== true) throw new Error('Only a confirmed screen lock is supported.'); value = await this.providers.power.trigger('lock'); }
          else return reply(405, {success:false,error:'Method not allowed.'});
        } else return reply(405, {success:false,error:'Method not allowed.'});
        if(!this.devices.includes(device)||!device.capabilities.includes(capability))return reply(403,{success:false,error:'Permission revoked.'});
        reply(value?.success === false ? 422 : 200, { success:true, ...value });
      } finally { this.inflight.delete(inflightKey); }
    } catch (error) { reply(400, { success:false, error:error.message }); }
  }
}
module.exports = AndroidGatewayService;
