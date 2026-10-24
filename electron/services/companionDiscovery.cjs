const dgram = require('node:dgram');
const isLocal = address => /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
function startDiscovery(gateway, { port = 9121, host = '0.0.0.0' } = {}) {
  const socket = dgram.createSocket({type:'udp4',reuseAddr:true});
  let lastReply = new Map();
  socket.on('error', error => { gateway.discoveryError=error.code || 'Discovery unavailable'; });
  socket.on('message', (packet, remote) => {
    if(packet.length>160 || !isLocal(remote.address)) return;
    const match=/^MOHIVX_DISCOVER_V1 ([a-f0-9]{32})(?: ([a-f0-9]{64}))?$/.exec(packet.toString()); if(!match)return;
    if(match[2]?match[2]!==gateway.fingerprint:(!gateway.pairing||gateway.pairing.expires<=Date.now()||gateway.pairing.attempts>=5))return;
    const now=Date.now();if(now-(lastReply.get(remote.address)||0)<250)return;
    if(lastReply.size>256)lastReply=new Map();lastReply.set(remote.address,now);
    const response=Buffer.from(JSON.stringify({service:'mohivx',protocol:2,nonce:match[1],port:gateway.port,name:'MOHIVX Island'}));
    socket.send(response,remote.port,remote.address,()=>{});
  });
  socket.bind(port,host);return socket;
}
module.exports = { startDiscovery };
