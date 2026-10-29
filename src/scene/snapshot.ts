import { validateWorldSnapshot } from '../sim/snapshot.ts';
import type { WorldSnapshot } from '../sim/snapshot.ts';
import { sceneParams } from '../sim/scene-ecology.ts';
import {validatePlaceRecord} from '../place/contract.js';

export const TERRAIN_VERSION='meadow-v2-1';
export interface AssetSource {provider:'Meta';imageModel:'muse-image-1.0';maskModel:'sam-3.1';promptVersion:string}
export interface Appearance { id:number; name:string; image?:string; rigConfig?:Record<string,unknown>;source?:AssetSource }
export interface SceneSnapshot {
  version:1; terrain:typeof TERRAIN_VERSION; populated:boolean; selectedId:number|null;
  world:WorldSnapshot; appearances:Appearance[];place?:Record<string,unknown>;
}
function invalid(): never { throw new Error('Invalid or unsupported forest snapshot.'); }
function canonical(value:any):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
// Only self-contained, bounded PNGs are accepted. No remote URLs, SVG or HTML.
export function validateCreatureImage(src:unknown) {
  if(typeof src!=='string'||src.length>2_800_000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(src))invalid();
  let header;try{header=Uint8Array.from(atob(src.slice(22,66)),c=>c.charCodeAt(0));}catch{invalid();}
  if(header.length<24||[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82].some((v,i)=>header[i]!==v))invalid();
  const view=new DataView(header.buffer);const w=view.getUint32(16),h=view.getUint32(20);
  if(w<1||h<1||w>640||h>640)invalid();
}
export function validateRig(config:any) {
  if(!config||typeof config!=='object'||Array.isArray(config))invalid();
  const keys=['knee','kneeHind','kneeFore','hindMaxX','minX','minArea','band','splitX','groundOnly','gait'];
  if(Object.keys(config).some(k=>!keys.includes(k)))invalid();
  for(const [k,v]of Object.entries(config)){
    if(k==='gait'){if(!['walk','trot','gallop'].includes(String(v)))invalid();}
    else if(k==='groundOnly'){if(typeof v!=='boolean')invalid();}
    else if(k==='splitX'){
      if(!Array.isArray(v)||v.length>8||v.some(x=>!Number.isFinite(x)||x<=0||x>=1))invalid();
    }else if(!Number.isFinite(v)||Number(v)<0||Number(v)>=1||(k==='band'&&Number(v)>.2))invalid();
  }
}
export function validateSceneSnapshot(input:unknown):asserts input is SceneSnapshot {
  const s=input as any;
  if(!s||s.version!==1||s.terrain!==TERRAIN_VERSION||typeof s.populated!=='boolean')invalid();
  validateWorldSnapshot(s.world);
  if(s.place!==undefined)validatePlaceRecord(s.place,s.world.week);
  if(s.world.params.width!==100||s.world.params.height!==56)invalid();
  // This UI exposes curated profiles plus interventions, not arbitrary executable
  // model parameters. Reject changed rules rather than presenting them as ours.
  if(canonical(s.world.params)!==canonical(sceneParams({populated:s.populated})))throw new Error('Replay ecological rules do not match this model version.');
  if(s.selectedId!==null&&(!Number.isSafeInteger(s.selectedId)||!s.world.animals.some((a:any)=>a.id===s.selectedId)))invalid();
  if(!Array.isArray(s.appearances)||s.appearances.length>80)invalid();
  let bytes=0;const ids=new Set();
  for(const a of s.appearances){
    if(!a||!Number.isSafeInteger(a.id)||a.id<1||a.id>=s.world.nextId||ids.has(a.id)||
      typeof a.name!=='string'||a.name.length>24)invalid();
    ids.add(a.id);
    if(a.image!==undefined){validateCreatureImage(a.image);bytes+=a.image.length;}
    if(a.rigConfig!==undefined){if(!a.image)invalid();validateRig(a.rigConfig);}
    if(a.source!==undefined){const m=a.source;if(!a.image||!m||m.provider!=='Meta'||m.imageModel!=='muse-image-1.0'||m.maskModel!=='sam-3.1'||m.promptVersion!=='watercolor-side-profile-1')invalid();}
  }
  if(bytes>12_000_000)throw new Error('Keep creature images in a replay under 12 MB.');
}
