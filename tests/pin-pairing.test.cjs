const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pinClient}=require('./helpers/pinClient.cjs');
const {begin,equalHex}=require('../electron/services/pinPairing.cjs');
test('actual Android Java client and production Node server agree on a six-digit PIN and certificate-bound mutual proof',async t=>{
  const client=await pinClient('012345');t.after(()=>client.close());const fingerprint=crypto.randomBytes(32).toString('hex');
  const exchange=begin('012345',client.A,fingerprint);
  assert.equal(equalHex(await client.proof(exchange,fingerprint),exchange.client),true);
  assert.equal(await client.verify(exchange.server),true);
});
test('a wrong PIN cannot authenticate and a substituted TLS certificate cannot relay the proof',async t=>{
  const fingerprint=crypto.randomBytes(32).toString('hex');
  const wrong=await pinClient('654321');t.after(()=>wrong.close());const exchange=begin('123456',wrong.A,fingerprint);
  assert.equal(equalHex(await wrong.proof(exchange,fingerprint),exchange.client),false);assert.equal(await wrong.verify(exchange.server),false);
  const relay=await pinClient('123456');t.after(()=>relay.close());const other=begin('123456',relay.A,fingerprint);
  assert.equal(equalHex(await relay.proof(other,'ab'.repeat(32)),other.client),false);
  assert.equal(await relay.verify(other.server),false);
  assert.throws(()=>begin('123456','0',fingerprint),/Invalid/);
});
