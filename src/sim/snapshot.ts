import type { Params, Animal, Event, Intervention, SpeciesId } from './engine.ts';

export const ENGINE_VERSION = 'microverse-1';
export interface WorldSnapshot {
  version: typeof ENGINE_VERSION;
  seed: number; week: number; randomState: number; nextId: number; rain: number;
  params: Params; animals: Animal[]; events: Event[]; interventions: Intervention[];
  grass: number[]; browse: number[]; open: number[]; excluded: SpeciesId[];
}
const species = ['rabbit','deer','fox','wolf','dog','cat','penguin'];
function fail() { throw new Error('Invalid or unsupported world snapshot.'); }
function object(x: any) { if (!x || typeof x !== 'object' || Array.isArray(x)) fail(); }
function num(x: any, lo = 0, hi = 1e6, integer = false) {
  if (!Number.isFinite(x) || x < lo || x > hi || (integer && !Number.isSafeInteger(x))) fail();
}
function array(x: any, max: number) { if (!Array.isArray(x) || x.length > max) fail(); }
function text(x: any, max: number) { if (typeof x !== 'string' || x.length > max) fail(); }
function pair(x: any, lo: number, hi: number, integer = false) {
  array(x,2); if(x.length!==2)fail(); x.forEach((n: any)=>num(n,lo,hi,integer)); if(x[0]>x[1])fail();
}

// Validate before allocating a world or trusting any imported JSON. Extra fields
// are ignored by the engine; only these bounded, typed fields drive behavior.
export function validateWorldSnapshot(input: unknown): asserts input is WorldSnapshot {
  const s = input as any; object(s);
  if(s.version!==ENGINE_VERSION)fail();
  num(s.seed,0,0xffffffff,true); num(s.week,0,1e6,true);
  num(s.randomState,0,0xffffffff,true); num(s.nextId,1,1e9,true); num(s.rain,0,4);
  const p=s.params;object(p);num(p.width,1,512,true);num(p.height,1,512,true);
  if(p.width*p.height>65536)fail();
  for(const k of ['rain','regrow','regrowBrowse'])num(p[k],0,k==='rain'?4:1);
  object(p.species);const keys=Object.keys(p.species);
  if(!keys.length||keys.some(k=>!species.includes(k)))fail();
  const known=(k: any)=>{if(typeof k!=='string'||!Object.hasOwn(p.species,k))fail();};
  for(const key of keys){
    const sp=p.species[key];object(sp);
    if(Array.isArray(sp.diet)){array(sp.diet,7);sp.diet.forEach(known);object(sp.prey);}
    else if(!['grass','browse'].includes(sp.diet))fail();
    for(const k of ['speed','vision','metabolism','matureAge','maxAge','breedEnergy','birthCost'])num(sp[k]);
    for(const k of ['matureAge','maxAge'])num(sp[k],0,1e6,true);
    num(sp.energyMax,.001);num(sp.energyStart,.001,sp.energyMax);num(sp.breedChance,0,1);
    pair(sp.breedWeeks,0,51,true);pair(sp.litter,0,32,true);
    for(const k of ['grazeAmount','grazeGain','territoryCap','carrying','forage','refuge'])if(sp[k]!==undefined)num(sp[k]);
    if(!Array.isArray(sp.diet)){num(sp.grazeAmount,0,1);num(sp.grazeGain);}
    if(sp.huntBelow!==undefined)num(sp.huntBelow,0,1);
    if(sp.startles!==undefined){array(sp.startles,7);sp.startles.forEach(known);}
    if(sp.prey!==undefined){object(sp.prey);for(const k of Object.keys(sp.prey)){known(k);object(sp.prey[k]);num(sp.prey[k].success,0,1);num(sp.prey[k].gain);}}
  }
  object(p.initial);
  for(const k of Object.keys(p.initial)){known(k);num(p.initial[k],0,20000,true);}
  if(p.immigration!==undefined){object(p.immigration);for(const k of Object.keys(p.immigration)){
    known(k);const r=p.immigration[k];object(r);num(r.below,0,20000,true);num(r.chance,0,1);pair(r.group,0,32,true);
  }}
  const cells=p.width*p.height;
  for(const k of ['grass','browse','open']){
    array(s[k],cells);if(s[k].length!==cells)fail();
    s[k].forEach((n: any)=>num(n,0,1,k==='open'));
  }
  if(!s.open.some(Boolean))fail();
  for(let i=0;i<cells;i++)if(!s.open[i]&&(s.grass[i]!==0||s.browse[i]!==0))fail();
  array(s.excluded,7);s.excluded.forEach(known);if(new Set(s.excluded).size!==s.excluded.length)fail();
  array(s.animals,20000);const ids=new Set();
  const id=(n: any)=>num(n,1,s.nextId-1,true);
  for(const a of s.animals){
    object(a);id(a.id);if(ids.has(a.id))fail();ids.add(a.id);known(a.species);
    num(a.x,0,p.width);num(a.y,0,p.height);if(a.x>=p.width||a.y>=p.height)fail();
    num(a.age,0,1e6,true);num(a.energy,-1e6,p.species[a.species].energyMax);
    num(a.distanceThisWeek);if(typeof a.alive!=='boolean'||!['f','m'].includes(a.sex))fail();
    if(a.alive&&a.energy<=0)fail();if(a.parent!==undefined)num(a.parent,0,a.id-1,true);
    if(a.name!==undefined)text(a.name,24);
  }
  array(s.interventions,1000);
  for(const iv of s.interventions){
    object(iv);num(iv.atWeek,0,1e6,true);
    if(iv.untilWeek!==undefined)num(iv.untilWeek,iv.atWeek,1e6,true);
    if(iv.kind==='drought'){if(iv.rain!==undefined)num(iv.rain,0,4);}
    else if(iv.kind==='remove')known(iv.species);else fail();
  }
  array(s.events,250000);
  for(const e of s.events){
    object(e);num(e.t,0,s.week,true);
    if(e.type==='intervention'){if(!['drought','remove'].includes(e.kind))fail();text(e.detail,120);continue;}
    id(e.id);
    if(['arrive','birth','death'].includes(e.type))known(e.species);
    if(e.type==='birth')id(e.parent);
    else if(e.type==='death'){if(!['starved','old age','eaten','removed'].includes(e.cause))fail();if(e.by!==undefined)id(e.by);}
    else if(e.type==='kill'){id(e.prey);known(e.preySpecies);}
    else if(e.type==='disturb')id(e.other);
    else if(e.type!=='arrive')fail();
  }
}
