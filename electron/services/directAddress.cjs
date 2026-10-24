const net=require('node:net');
function directAddress(value){
 if(typeof value!=='string'||value.length>300||/[\s%\\]/.test(value))throw Error('Enter an HTTPS address with a numeric IP.');
 const raw=/^https:\/\/(\[[0-9a-fA-F:.]+\]|[0-9.]+)(?::([0-9]{1,5}))?\/?$/.exec(value);
 if(!raw)throw Error('Use a numeric IPv4 or IPv6 address. External services and host names are disabled.');
 const host=raw[1].replace(/^\[|\]$/g,''),port=raw[2]?Number(raw[2]):9120;
 if(!net.isIP(host)||port<1||port>65535)throw Error('Invalid direct device address.');
 const parsed=new URL('https://'+raw[1]+':'+port),normalized=parsed.hostname.replace(/^\[|\]$/g,'');
 if(normalized==='0.0.0.0'||normalized==='::'||normalized.startsWith('ff')||normalized==='255.255.255.255'||net.isIP(normalized)===4&&Number(normalized.split('.')[0])>=224)throw Error('Invalid direct device address.');
 return {host:normalized,port,url:`https://${parsed.hostname}:${port}`};
}
function localAddress(value=''){
 let host=value.split('%')[0].toLowerCase();if(host.startsWith('::ffff:')&&net.isIP(host.slice(7))===4)host=host.slice(7);
 if(net.isIP(host)===4){const p=host.split('.').map(Number);return p[0]===127||p[0]===10||p[0]===192&&p[1]===168||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===169&&p[1]===254;}
 return host==='::1'||/^f[cd][0-9a-f]{2}:/.test(host)||/^fe[89ab][0-9a-f]:/.test(host);
}
function directAddresses(interfaces,port){const result=[];for(const item of Object.values(interfaces).flat()){if(!item||item.internal||item.address.includes('%')||/^fe[89ab]/i.test(item.address))continue;try{const address=directAddress(`https://${net.isIP(item.address)===6?'['+item.address+']':item.address}:${port}`);result.push({...address,local:localAddress(address.host)});}catch{}}return result;}
module.exports={directAddress,localAddress,directAddresses};
