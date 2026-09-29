import test from 'node:test';
import assert from 'node:assert/strict';
import { frameIndex, frameSequence } from '../web/frame-sequence.mjs';

test('pointer mapping is relative to the scene, bounded, and reversible', () => {
  assert.equal(frameIndex(100, 100, 400, 81), 0);
  assert.equal(frameIndex(300, 100, 400, 81), 40);
  assert.equal(frameIndex(500, 100, 400, 81), 80);
  assert.equal(frameIndex(-30, 100, 400, 81), 0);
  assert.equal(frameIndex(900, 100, 400, 81), 80);
  assert.equal(frameIndex(100, 100, 400, 81, true), 80);
  assert.equal(frameIndex(500, 100, 400, 81, true), 0);
  assert.equal(frameIndex(500, 100, 400, 1), 0);
  for (const args of [[0,0,0,10], [NaN,0,100,10], [0,0,100,0], [0,0,100,2.5]]) assert.throws(() => frameIndex(...args), TypeError);
});

const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(t, initiallyAllowed = true, count = 10) {
  const originals = new Map(); let sequence;
  function mock(name, value) { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, {value, configurable:true, writable:true}); }
  t.after(() => { sequence?.dispose(); for (const [name, desc] of originals) desc ? Object.defineProperty(globalThis, name, desc) : delete globalThis[name]; });
  const doc = new EventTarget(); doc.hidden = false;
  const note = {textContent:''}; doc.getElementById = () => note;
  const poster = {style:{}};
  const draws = []; const canvas = {width:900,height:900,hidden:true,getContext:() => ({clearRect(){},drawImage(image){draws.push(image.src);}})};
  const scene = new EventTarget(); scene.dataset = {}; scene.querySelector = selector => selector.includes('poster') ? poster : canvas;
  scene.getBoundingClientRect = () => ({left:100,width:400});
  const requests = []; const raf = new Map(); let nextId=0, allowed=initiallyAllowed, observer;
  const files = Array.from({length:count}, (_,i)=>`frame-${i}.webp`);
  mock('document',doc); mock('location',{href:'http://localhost/portada-modelo.html'});
  mock('fetch',t.mock.fn(async () => ({ok:true,json:async()=>({count,width:900,height:900,files,reverseMapping:false,posterIndex:0})})));
  mock('Image',class {decode(){ return new Promise((resolve,reject)=>requests.push({image:this,resolve,reject})); }});
  mock('requestAnimationFrame',fn=>{raf.set(++nextId,fn);return nextId;}); mock('cancelAnimationFrame',id=>raf.delete(id));
  mock('IntersectionObserver',class {constructor(fn){observer=this;this.fn=fn;}observe(){} disconnect(){this.disconnected=true;}});
  sequence = frameSequence(scene,'/assets/sequence/manifest.json',()=>allowed);
  return {sequence,doc,canvas,poster,draws,requests,scene,raf,
    fetched:()=>fetch.mock.callCount(),
    async start(){observer.fn([{isIntersecting:true}]);sequence.update();await tick();},
    async frame(){const callbacks=[...raf.values()];raf.clear();callbacks.forEach(fn=>fn());await tick();},
    move(index){const e=new Event('pointermove');Object.assign(e,{clientX:100+index/9*400,pointerType:'mouse'});scene.dispatchEvent(e);},
    async finish(index,fail=false){const request=requests.find(item=>item.image.src.endsWith(`/frame-${index}.webp`));assert.ok(request);fail?request.reject(new Error('missing')):request.resolve();await tick();},
    allow(value){allowed=value;sequence.update();},
    visible(value){observer.fn([{isIntersecting:value}]);}
  };
}

test('fast moves keep at most two loads pending and display the latest requested pose', async t=>{
  const h=harness(t);await h.start();await h.frame();
  h.move(9);await h.frame();h.move(5);await h.frame();
  assert.equal(h.requests.length,2);assert.equal(h.draws.length,0);assert.equal(h.canvas.hidden,true);
  await h.finish(0);assert.equal(h.requests.length,3);assert.equal(h.draws.length,0);
  await h.finish(9);assert.equal(h.draws.length,0);
  await h.finish(5);assert.equal(h.canvas.hidden,false);assert.equal(h.scene.dataset.frame,'5');assert.equal(h.draws.length,1);
  await h.frame();assert.equal(h.raf.size,0);
});

test('failed frames preserve the last visible image, pause restores poster, disposal prevents drawing', async t=>{
  const h=harness(t);await h.start();await h.frame();await h.finish(0);
  h.move(9);await h.frame();await h.finish(9,true);assert.equal(h.draws.length,1);assert.equal(h.canvas.hidden,false);
  h.allow(false);assert.equal(h.canvas.hidden,true);assert.equal(h.poster.style.visibility,'');
  h.allow(true);h.move(5);await h.frame();h.sequence.dispose();await h.finish(5);
  assert.equal(h.draws.length,1);assert.equal(h.raf.size,0);
});

test('static touch/reduced-motion mode loads no sequence, and a one-frame manifest stays static', async t=>{
  const h=harness(t,false,1);await h.start();await h.frame();assert.equal(h.fetched(),0);assert.equal(h.requests.length,0);
  h.allow(true);await tick();await h.frame();assert.equal(h.fetched(),1);assert.equal(h.requests.length,0);assert.equal(h.canvas.hidden,true);
});

test('hidden scenes stop drawing and resume without an idle animation loop', async t=>{
  const h=harness(t);await h.start();await h.frame();await h.finish(0);
  h.visible(false);assert.equal(h.canvas.hidden,true);h.move(9);await h.frame();assert.equal(h.requests.length,1);
  h.visible(true);await h.frame();assert.equal(h.canvas.hidden,false);assert.equal(h.raf.size,0);
  h.doc.hidden=true;h.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(h.canvas.hidden,true);
});
