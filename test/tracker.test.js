const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require.resolve('../src/tracker.js'), 'utf8');
function setup(createBitmap = async () => ({ close() {} })) {
  const listeners = new Map(), sent = [], results = [];
  const frame = { style:{}, setAttribute(){}, remove(){this.removed=true;}, contentWindow:{postMessage:(...args)=>sent.push(args)} };
  const context = {URL,URLSearchParams,ArrayBuffer,crypto:{randomUUID:()=> 'test-channel'},location:{origin:'https://meet.google.com'},performance:{now:()=>0},
    setTimeout:()=>1,clearTimeout(){},createImageBitmap:createBitmap,
    document:{createElement:()=>frame,documentElement:{appendChild(){}}},
    window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)} };
  vm.runInNewContext(code,context);
  const tracker = context.__lumaweaveFx.createTracker('chrome-extension://testid/',(...args)=>results.push(args));
  const message = (data, origin='chrome-extension://testid') => listeners.get('message')?.({origin,source:frame.contentWindow,data});
  const ready = () => message({channel:'test-channel',type:'lumaweave:ready',delegate:'CPU'});
  return {tracker,frame,sent,results,message,ready};
}
test('tracker handles extension origins explicitly and rejects wrong channels/origins', async () => {
  const s=setup();
  s.message({type:'lumaweave:ready',channel:'test-channel'},'https://attacker.invalid');
  assert.equal(s.tracker.status().ready,false);
  s.message({type:'lumaweave:ready',channel:'other'});
  assert.equal(s.tracker.status().ready,false);
  s.ready();
  await s.tracker.submit({displayWidth:1280,displayHeight:720});
  assert.equal(s.sent[0][1],'chrome-extension://testid');
  assert.equal(s.sent[0][0].requestId,1);
});
test('destroying a tracker while a bitmap is being created closes it without sending', async () => {
  let finish,closed=false;
  const s=setup(()=>new Promise(resolve=>{finish=resolve;}));
  s.ready();
  const pending=s.tracker.submit({displayWidth:640,displayHeight:360});
  s.tracker.destroy();
  finish({close(){closed=true;}});
  await pending;
  assert.equal(closed,true);
  assert.equal(s.sent.length,0);
  assert.equal(s.frame.removed,true);
});
test('out-of-order replies cannot unlock a newer frame or inject malformed landmarks', async () => {
  const s=setup();s.ready();
  await s.tracker.submit({displayWidth:640,displayHeight:360});
  s.message({channel:'test-channel',type:'lumaweave:hands',requestId:0,hands:[]});
  assert.notEqual(s.tracker.status().inflightSince,null);
  s.message({channel:'test-channel',type:'lumaweave:hands',requestId:1,hands:[{landmarks:[]}],mask:{width:99999,height:1,data:new ArrayBuffer(4)}});
  assert.equal(s.results[0][0].length,0);
  assert.equal(s.results[0][2],null);
  assert.equal(s.tracker.status().inflightSince,null);
});
