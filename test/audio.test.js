const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code=fs.readFileSync(require.resolve('../src/audio-clap.js'),'utf8');
test('audio analysis respects Meet mute and stops its clone when the source ends', () => {
  let poll,contextClosed=0,cloneStopped=0,hits=0,cleared=0;
  const clone={enabled:true,stop(){cloneStopped++;}};
  const source={enabled:false,muted:false,readyState:'live',clone:()=>clone,addEventListener(){},removeEventListener(){}};
  const context={performance:{now:()=>1000},MediaStream:class{},setInterval:fn=>{poll=fn;return 1;},clearInterval:()=>cleared++,
    AudioContext:class { constructor(){this.state='running';} createMediaStreamSource(){return {connect(){},disconnect(){}};}
      createAnalyser(){return {fftSize:1024,getFloatTimeDomainData:buffer=>buffer.fill(.8),disconnect(){}};}
      close(){contextClosed++;return Promise.resolve();} } };
  vm.runInNewContext(code,context);
  const stop=context.__lumaweaveFx.listenForTransients(source,()=>hits++);
  poll(); assert.equal(clone.enabled,false);assert.equal(hits,0);
  source.enabled=true;poll();assert.equal(hits,1);
  source.readyState='ended';poll();stop();
  assert.equal(cloneStopped,1);assert.equal(contextClosed,1);assert.equal(cleared,1);
});
test('failed audio setup releases the clone and AudioContext', () => {
  let stopped=0,closed=0;
  const context={MediaStream:class{},AudioContext:class {createMediaStreamSource(){throw new Error('Cannot attach');}close(){closed++;return Promise.resolve();}}};
  vm.runInNewContext(code,context);
  assert.throws(()=>context.__lumaweaveFx.listenForTransients({clone:()=>({stop(){stopped++;}})},()=>{}),/Cannot attach/);
  assert.equal(stopped,1);assert.equal(closed,1);
});
