'use strict';
// HeavenzFire local-first handshake + braided DAG pipeline. Node.js built-ins only.
// "Quantum-threaded" is the project metaphor for concurrent classical branches;
// this module does not claim quantum hardware or quantum speedup.
const crypto = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function hmac(secret, value) { return crypto.createHmac('sha256', secret).update(value).digest('hex'); }
function safeEqualHex(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function createHandshake({peerId, secret, capabilities=[], now=Date.now(), nonce=crypto.randomBytes(24).toString('hex')}) {
  if (!peerId || typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('peerId and a 32-byte-or-longer shared secret are required');
  const body = {protocol:'hf-handshake/1', peerId, timestamp:now, nonce, capabilities:[...new Set(capabilities)].sort()};
  return {...body, proof:hmac(secret,canonical(body))};
}
function createHandshakeVerifier({secret, allowedPeerIds, supportedCapabilities=[], clockSkewMs=30000, nonceTtlMs=120000, now=()=>Date.now()}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret)<32) throw new Error('A 32-byte-or-longer shared secret is required');
  const seen = new Map();
  return function verify(handshake) {
    const t=now();
    for (const [key,expiry] of seen) if (expiry < t) seen.delete(key);
    if (!handshake || handshake.protocol!=='hf-handshake/1' || typeof handshake.peerId!=='string' ||
        !Array.isArray(handshake.capabilities) || typeof handshake.nonce!=='string' ||
        Math.abs(t-handshake.timestamp)>clockSkewMs) return {ok:false,reason:'invalid_or_stale_handshake'};
    if (allowedPeerIds && !allowedPeerIds.includes(handshake.peerId)) return {ok:false,reason:'peer_not_allowed'};
    const key=handshake.peerId+':'+handshake.nonce;
    if (seen.has(key)) return {ok:false,reason:'replay_detected'};
    const {proof,...body}=handshake;
    if (!safeEqualHex(proof,hmac(secret,canonical(body)))) return {ok:false,reason:'invalid_proof'};
    seen.set(key,t+nonceTtlMs);
    const granted=handshake.capabilities.filter(c=>supportedCapabilities.includes(c)).sort();
    return {ok:true,peerId:handshake.peerId,grantedCapabilities:granted,protocol:'hf-handshake/1'};
  };
}
function validateGraph(stages) {
  if (!Array.isArray(stages) || !stages.length) throw new Error('stages must be a non-empty array');
  const ids=new Set();
  for (const s of stages) {
    if (!s || !/^[a-zA-Z0-9_-]{1,64}$/.test(s.id||'') || ids.has(s.id)) throw new Error('stage IDs must be unique simple identifiers');
    if (!Array.isArray(s.after||[])) throw new Error('stage after must be an array');
    ids.add(s.id);
  }
  for (const s of stages) for (const dep of (s.after||[])) if (!ids.has(dep)) throw new Error('unknown dependency '+dep+' for '+s.id);
  const done=new Set(); let remaining=stages.slice();
  while (remaining.length) {
    const ready=remaining.filter(s=>(s.after||[]).every(d=>done.has(d)));
    if (!ready.length) throw new Error('pipeline graph contains a cycle');
    ready.forEach(s=>done.add(s.id)); remaining=remaining.filter(s=>!done.has(s.id));
  }
  return true;
}
async function runBraidedPipeline({stages, handlers, input, maxParallel=4, runId=crypto.randomUUID()}) {
  validateGraph(stages);
  if (!Number.isInteger(maxParallel)||maxParallel<1||maxParallel>32) throw new Error('maxParallel must be 1..32');
  const start=Date.now(), results={}, events=[]; let previousHash='0'.repeat(64);
  const emit=(type,stageId,detail={})=>{
    const base={seq:events.length+1,at:new Date().toISOString(),runId,type,stageId,previousHash,detail};
    const hash=sha256(canonical(base)); events.push({...base,hash}); previousHash=hash;
  };
  emit('pipeline.started',null,{stageCount:stages.length,maxParallel});
  const pending=stages.slice(), completed=new Set();
  try {
    while(pending.length) {
      const ready=pending.filter(s=>(s.after||[]).every(d=>completed.has(d)));
      if(!ready.length) throw new Error('No runnable stages; graph invalid');
      for(let i=0;i<ready.length;i+=maxParallel) {
        const batch=ready.slice(i,i+maxParallel);
        const settled=await Promise.all(batch.map(async s=>{
          const handler=handlers[s.handler||s.id];
          if(typeof handler!=='function') throw new Error('No handler registered for stage '+s.id);
          emit('stage.started',s.id,{after:s.after||[]});
          const value=await handler({input,dependencies:Object.fromEntries((s.after||[]).map(d=>[d,results[d]])),runId,stageId:s.id});
          return {stage:s,value};
        }));
        for(const item of settled) {
          results[item.stage.id]=item.value; completed.add(item.stage.id);
          emit('stage.completed',item.stage.id,{resultHash:sha256(canonical(item.value))});
          pending.splice(pending.findIndex(s=>s.id===item.stage.id),1);
        }
      }
    }
    emit('pipeline.completed',null,{durationMs:Date.now()-start});
    return {ok:true,runId,results,trace:events,traceHead:previousHash,durationMs:Date.now()-start,executionModel:'classical-concurrent-dag'};
  } catch(e) {
    emit('pipeline.failed',null,{error:String(e.message||e)});
    return {ok:false,runId,results,trace:events,traceHead:previousHash,durationMs:Date.now()-start,error:String(e.message||e)};
  }
}
module.exports={createHandshake,createHandshakeVerifier,runBraidedPipeline,validateGraph,canonical,sha256};
