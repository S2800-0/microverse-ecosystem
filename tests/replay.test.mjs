import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,SCENE_PARAMS,rng} from '../src/sim/engine.ts';
import {createForestController} from '../src/scene/controller.ts';
import {createExperiment,experimentFromReplay,runContinuation} from '../src/scene/experiment.ts';
import {validateCreatureImage} from '../src/scene/snapshot.ts';
const json=x=>JSON.parse(JSON.stringify(x));

test('random state restoration preserves the next draw without changing mulberry32',()=>{
  const r=rng(7);assert.equal(r(),.011704753153026104);r();const state=r.getState(),next=r();
  r.setState(state);assert.equal(r(),next);
});
test('a mid-run JSON snapshot resumes the exact food, agents, events and random stream',()=>{
  const a=createForestController();a.add({species:'dog',name:'Maple'});a.step(27);
  a.schedule('drought');a.step(11);a.schedule('remove-wolves');a.step(4);
  const b=createForestController({populated:false});b.restore(json(a.toSnapshot()));
  assert.deepEqual(b.toSnapshot(),a.toSnapshot());
  a.step(120);b.step(120);a.add({species:'cat',name:'Pip'});b.add({species:'cat',name:'Pip'});
  assert.deepEqual(b.toSnapshot(),a.toSnapshot());
  assert.equal(b.getState().counts.wolf,0);
});
test('snapshot and restored worlds own their arrays and nested parameters',()=>{
  const a=createForestController(),snapshot=a.toSnapshot(),b=createForestController();b.restore(snapshot);
  snapshot.world.animals[0].energy=999;snapshot.world.params.rain=0;
  b.getState().world.params.species.rabbit.speed=0;b.getState().world.grass[0]=.2;
  assert.notEqual(a.getState().world.params.species.rabbit.speed,0);
  assert.equal(b.getState().world.params.rain,1);
  assert.notEqual(a.getState().world.animals[0].energy,999);
});
test('both branches include the imported identity and exact same starting model',()=>{
  const a=createForestController();const pet=a.add({species:'dog',name:'Maple'});a.step(9);
  const initial=a.toSnapshot(),e=createExperiment(initial,'drought','I predict less grass.');
  const s=e.getState();
  assert.deepEqual(s.baseline.world.toSnapshot(),initial.world);
  const changed=s.changed.world.toSnapshot();changed.interventions.pop();assert.deepEqual(changed,initial.world);
  assert.equal(s.baseline.appearances.get(pet.id).name,'Maple');
  assert.equal(s.changed.appearances.get(pet.id).name,'Maple');
  e.seek(52);assert.deepEqual(a.toSnapshot(),initial);
  assert(s.changed.world.grassCover()<s.baseline.world.grassCover());
});
test('rewinding, replaying and exporting reproduce the same final state',()=>{
  const c=createForestController();c.step(6);const e=createExperiment(c.toSnapshot(),'remove-wolves','Deer may increase.');
  e.seek(104);const expected=e.getState().changed.world.toSnapshot();
  e.seek(0);assert.equal(e.getState().baseline.week,6);e.seek(104);
  assert.deepEqual(e.getState().changed.world.toSnapshot(),expected);
  const file=json(e.toReplay('The log shows wolf removals.')),restored=experimentFromReplay(file);
  assert.deepEqual(restored.getState().changed.world.toSnapshot(),expected);
  assert.equal(restored.getState().baseline.counts.wolf>0,true);
  assert.equal(restored.getState().changed.counts.wolf,0);
  assert.equal(file.reflection,'The log shows wolf removals.');
});
test('replay rejects invalid versions, durations, intervention kinds and notes',()=>{
  const file=createExperiment(createForestController().toSnapshot(),'drought').toReplay();
  for(const mutate of [r=>r.version=3,r=>r.elapsed=157,r=>r.scenario='poison',r=>r.prediction='x'.repeat(1001),r=>r.initial.terrain='other']){
    const r=json(file);mutate(r);assert.throws(()=>experimentFromReplay(r));
  }
});
test('malformed worlds fail before replacing the current forest',()=>{
  const c=createForestController(),original=c.toSnapshot();
  for(const mutate of [s=>s.world.randomState=-1,s=>s.world.params.width=1e9,s=>s.world.grass.pop(),
    s=>s.world.params.species.rabbit.diet=['dragon'],s=>s.world.params.species.rabbit.birthCost=0,s=>s.world.animals[0].energy=NaN,
    s=>s.world.animals[1].id=s.world.animals[0].id,s=>s.world.nextId=1,
    s=>s.world.interventions.push({atWeek:-1,kind:'drought'}),s=>s.world.events.push({t:0,type:'kill',id:1,prey:999999,preySpecies:'rabbit'})]){
    const s=structuredClone(original);mutate(s);assert.throws(()=>c.restore(s));assert.deepEqual(c.toSnapshot(),original);
  }
});
test('terrain callbacks are required and must match the saved mask',()=>{
  const s=createForestController().toSnapshot().world;
  assert.throws(()=>World.fromSnapshot(s),/callbacks/);
  assert.throws(()=>World.fromSnapshot(s,()=>true,()=>true),/terrain/);
  const p=structuredClone(SCENE_PARAMS);p.width=p.height=10;p.initial={};
  const open=new World(p,3);open.run(4);const restored=World.fromSnapshot(json(open.toSnapshot()));
  restored.run(8);open.run(8);assert.deepEqual(restored.toSnapshot(),open.toSnapshot());
});
test('local replay images reject links, SVG, malformed PNG and oversized dimensions',()=>{
  for(const src of ['https://example.com/pet.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,AAAA'])assert.throws(()=>validateCreatureImage(src));
  const header=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]).copy(header);
  header.writeUInt32BE(640,16);header.writeUInt32BE(640,20);validateCreatureImage(`data:image/png;base64,${header.toString('base64')}`);
  header.writeUInt32BE(641,16);assert.throws(()=>validateCreatureImage(`data:image/png;base64,${header.toString('base64')}`));
});
test('reviewed fitter config and image bytes survive a replay without serializing canvases',()=>{
  const header=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]).copy(header);
  header.writeUInt32BE(640,16);header.writeUInt32BE(640,20);
  const image=`data:image/png;base64,${header.toString('base64')}`;
  const config={knee:.7,hindMaxX:.52,minX:0,splitX:[],gait:'walk',groundOnly:true};
  const source={provider:'Meta',imageModel:'muse-image-1.0',maskModel:'sam-3.1',promptVersion:'watercolor-side-profile-1'};
  const c=createForestController();c.add({species:'dog',name:'Maple',image,rigConfig:config,source,rig:{canvas:'not portable'}});
  const e=createExperiment(json(c.toSnapshot()),'drought');const file=e.toReplay();
  assert.deepEqual(file.initial.appearances[0],{id:55,name:'Maple',image,rigConfig:config,source});
  const restored=experimentFromReplay(json(file));
  assert.deepEqual(restored.getState().changed.appearances.get(55),{name:'Maple',image,rigConfig:config,source});
});
test('future-randomness replicates are reproducible without replacing the initial creatures or food',()=>{
  const c=createForestController();c.add({species:'dog',name:'Maple'});c.step(8);const initial=c.toSnapshot();
  const a=[1,2,3].map(state=>runContinuation(initial,'drought',state,52));
  const b=[1,2,3].map(state=>runContinuation(initial,'drought',state,52));
  assert.deepEqual(a,b);assert.deepEqual(c.toSnapshot(),initial);
  for(const r of a)assert(r.changed.grass<r.baseline.grass);
  assert.notDeepEqual(a[0].baseline,a[1].baseline);
  assert.throws(()=>runContinuation(initial,'drought',NaN),/random state/);
});
