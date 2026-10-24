// SRP-6a (RFC 5054 group 3072, SHA-256). Proofs also bind the TLS certificate.
const crypto = require('node:crypto');
const N = BigInt('0x' + crypto.getDiffieHellman('modp15').getPrime('hex'));
const g = 5n, bytes = 384;
const pad = n => Buffer.from(n.toString(16).padStart(bytes * 2, '0'), 'hex');
const H = (...data) => crypto.createHash('sha256').update(Buffer.concat(data)).digest();
const integer = b => BigInt('0x' + b.toString('hex'));
const k = integer(H(pad(N), pad(g)));
function power(base, exponent) { let result = 1n; base = ((base % N) + N) % N; while (exponent > 0n) { if (exponent & 1n) result = result * base % N; base = base * base % N; exponent >>= 1n; } return result; }
function publicValue(hex) { if (typeof hex !== 'string' || !/^[a-f0-9]{1,768}$/i.test(hex)) throw Error('Invalid pairing value.'); const n = BigInt('0x' + hex); if (n <= 0n || n >= N) throw Error('Invalid pairing value.'); return n; }
function proofs(A, B, salt, secret, fingerprint) {
  const K = H(pad(secret)), context = Buffer.from(fingerprint, 'hex');
  if (context.length !== 32) throw Error('Invalid PC identity.');
  const hn = H(pad(N)), hg = H(pad(g));
  const xor = Buffer.from(hn.map((b, i) => b ^ hg[i]));
  const client = H(xor, H(Buffer.from('MOHIVX')), salt, pad(A), pad(B), K, context);
  return { client: client.toString('hex'), server: H(pad(A), client, K, context).toString('hex'), key:H(Buffer.from('MOHIVX secure transport v1'),K,context).toString('hex') };
}
function equalHex(a, b) { return typeof a === 'string' && /^[a-f0-9]{64}$/i.test(a) && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); }
function begin(pin, Ahex, fingerprint) {
  const A = publicValue(Ahex), salt = crypto.randomBytes(32), b = integer(crypto.randomBytes(32));
  const x = integer(H(salt, H(Buffer.from('MOHIVX:' + pin))));
  const v = power(g, x), B = (k * v + power(g, b)) % N;
  const u = integer(H(pad(A), pad(B))); if (u === 0n || B === 0n) throw Error('Invalid pairing value.');
  const secret = power(A * power(v, u) % N, b);
  return { salt: salt.toString('hex'), B: B.toString(16), ...proofs(A, B, salt, secret, fingerprint) };
}
module.exports = { begin, equalHex, group: { N: N.toString(16), g: '5' } };
