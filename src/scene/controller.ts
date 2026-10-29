import { World, seasonOf } from '../sim/engine.ts';
import type { SpeciesId } from '../sim/engine.ts';
import { sceneParams } from '../sim/scene-ecology.ts';
import { buildTerrain, MEADOW_V2_TERRAIN } from './terrain.js';
import { TERRAIN_VERSION, validateSceneSnapshot } from './snapshot.ts';
import type { SceneSnapshot,AssetSource } from './snapshot.ts';
import { interventionFor } from '../investigation/changes.js';
import {validatePlaceRecord} from '../place/contract.js';

export function createForestController({ seed = 7, populated = true } = {}) {
  const terrain = buildTerrain(MEADOW_V2_TERRAIN);
  let world: World;
  let place:Record<string,unknown>|null=null;
  let selectedId: number | null = null;
  const appearances = new Map<number, { name: string; image?: string; rig?: unknown; rigConfig?:Record<string,unknown>;source?:AssetSource }>();
  function reset(fill = populated) {
    populated = fill; appearances.clear(); selectedId = null;place=null;
    const p = sceneParams({ populated });
    world = new World(p, seed, [], (x,y)=>terrain.walkable(x,y/p.height*100),
      (x0,y0,x1,y1)=>terrain.clear(x0,y0/p.height*100,x1,y1/p.height*100));
    return getState();
  }
  function getState() {
    return { world, terrain, appearances, selectedId, week: world.week, season: seasonOf(world.week),
      counts: world.counts(), grass: world.grassCover(), browse: world.browseCover(),
      animals: world.animals.filter(a=>a.alive),place:place?structuredClone(place):null };
  }
  function add({ species, name = '', image, rig, rigConfig,source }: { species: SpeciesId; name?: string; image?: string; rig?: unknown; rigConfig?:Record<string,unknown>;source?:AssetSource }) {
    if (!Object.hasOwn(world.params.species,species)) throw new Error('Unsupported ecological role.');
    const n = world.animals.length;
    let position: {x:number;y:number} | null = null;
    // Deterministic placement is independent of frame rate and UI animation.
    for (let i=0;i<500;i++) {
      const angle=(n+i)*2.399963, radius=2+i*.07;
      const x=52+Math.cos(angle)*radius, y=30+Math.sin(angle)*radius*.6;
      if (terrain.walkable(x,y/world.params.height*100)) { position={x,y};break; }
    }
    if (!position) throw new Error('No open ground available for this creature.');
    const animal=world.addCreature({species,...position});
    const cleanName=String(name).trim().slice(0,24)||`${species[0].toUpperCase()+species.slice(1)} ${animal.id}`;
    appearances.set(animal.id,{name:cleanName,image,rig,rigConfig,source});selectedId=animal.id;
    return animal;
  }
  function schedule(change:unknown) { world.interventions.push(interventionFor(change,world.week)); }
  function toSnapshot():SceneSnapshot {
    // Expired selected creatures can have left the retained animal array.
    return JSON.parse(JSON.stringify({version:1,terrain:TERRAIN_VERSION,populated,
      selectedId:world.animals.some(a=>a.id===selectedId)?selectedId:null,world:world.toSnapshot(),...(place?{place}:{}),
      appearances:[...appearances].map(([id,{name,image,rigConfig,source}])=>({id,name,image,rigConfig,source}))}));
  }
  function restore(input:unknown) {
    validateSceneSnapshot(input);const s:SceneSnapshot=structuredClone(input),p=s.world.params;
    const restored=World.fromSnapshot(s.world,(x,y)=>terrain.walkable(x,y/p.height*100),
      (x0,y0,x1,y1)=>terrain.clear(x0,y0/p.height*100,x1,y1/p.height*100));
    world=restored;seed=s.world.seed;populated=s.populated;selectedId=s.selectedId;place=s.place?structuredClone(s.place):null;
    appearances.clear();for(const {id,...appearance}of s.appearances)appearances.set(id,appearance);
    return getState();
  }
  reset();
  return { getState, reset, add, schedule, toSnapshot, restore,
    applyPlaceStart(input:unknown){
      const reviewed=validatePlaceRecord(input,world.week);if(reviewed.atWeek!==world.week)throw new Error('Review place inputs for the current forest week.');
      for(let i=0;i<world.open.length;i++){world.grass[i]=world.open[i]?reviewed.start.grass:0;world.browse[i]=world.open[i]?reviewed.start.browse:0;}place=reviewed;return getState();
    },
    select(id: number | null) { selectedId=id;return getState(); },
    step(weeks=1) {
      if (!Number.isSafeInteger(weeks)||weeks<1||weeks>520) throw new Error('Choose between 1 and 520 weeks.');
      world.run(weeks);return getState();
    },
  };
}
