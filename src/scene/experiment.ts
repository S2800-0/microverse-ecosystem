import { createForestController } from './controller.ts';
import { validateSceneSnapshot } from './snapshot.ts';
import type { SceneSnapshot } from './snapshot.ts';
import {normalizeChange} from '../investigation/changes.js';

export type Scenario='drought'|'remove-wolves'|{kind:'rain';rain:number;durationWeeks:number}|{kind:'remove';species:string};
export interface Replay {
  format:'microverse-experiment'; version:1|2; initial:SceneSnapshot; scenario:Scenario;
  elapsed:number; prediction:string; reflection:string;question?:string;activity?:{before:string;after:string;teacherNotes:string;connection?:string};
}
export function validateReplay(input:unknown):asserts input is Replay {
  const r=input as Replay;
  if(!r||r.format!=='microverse-experiment'||![1,2].includes(r.version))throw new Error('Unsupported replay format.');
  if(r.version===1&&r.scenario!=='drought'&&r.scenario!=='remove-wolves')throw new Error('Unsupported legacy experiment.');
  normalizeChange(r.scenario);validateSceneSnapshot(r.initial);
  if(!Number.isSafeInteger(r.elapsed)||r.elapsed<0||r.elapsed>156||
    typeof r.prediction!=='string'||r.prediction.length>1000||typeof r.reflection!=='string'||r.reflection.length>1000)
    throw new Error('Invalid experiment notes or duration.');
  if(r.question!==undefined&&(typeof r.question!=='string'||r.question.length>800))throw new Error('Invalid saved question.');
  if(r.activity!==undefined&&(!r.activity||Object.keys(r.activity).some(k=>!['before','after','teacherNotes','connection'].includes(k))||!['before','after','teacherNotes'].every(k=>typeof r.activity[k]==='string'&&r.activity[k].length<=1000)||(r.activity.connection!==undefined&&(typeof r.activity.connection!=='string'||r.activity.connection.length>1000))))throw new Error('Invalid classroom notes.');
}
export function createExperiment(initial:SceneSnapshot,scenario:Scenario,prediction='',question='') {
  const change=normalizeChange(scenario);validateSceneSnapshot(initial);
  if(typeof prediction!=='string'||prediction.length>1000)throw new Error('Keep the prediction under 1000 characters.');
  if(typeof question!=='string'||question.length>800)throw new Error('Keep the question under 800 characters.');
  const start=structuredClone(initial);
  const baseline=createForestController({populated:false}),changed=createForestController({populated:false});
  let elapsed=0;
  function restart(){baseline.restore(start);changed.restore(start);changed.schedule(change);elapsed=0;}
  function seek(week:number){
    if(!Number.isSafeInteger(week)||week<0||week>156)throw new Error('Choose an experiment week from 0 to 156.');
    if(week<elapsed)restart();
    const delta=week-elapsed;
    if(delta){baseline.step(delta);changed.step(delta);elapsed=week;}
    return getState();
  }
  function getState(){return {elapsed,eventStartIndex:start.world.events.length,scenario:change,startWeek:start.world.week,seed:start.world.seed,baseline:baseline.getState(),changed:changed.getState()};}
  restart();
  return {getState,seek,
    toReplay(reflection=''):Replay {
      const replay:Replay={format:'microverse-experiment',version:2,initial:structuredClone(start),scenario:change,elapsed,prediction,reflection,question};
      validateReplay(replay);return replay;
    },
  };
}
export function experimentFromReplay(input:unknown){
  validateReplay(input);const experiment=createExperiment(input.initial,input.scenario,input.prediction,input.question||'');
  experiment.seek(input.elapsed);return experiment;
}

// Replicates hold the complete observed model state fixed and vary only future
// random draws. They are sensitivity checks, not real-world confidence intervals.
export function runContinuation(initial:SceneSnapshot,scenario:Scenario,randomState:number,elapsed=156){
  if(!Number.isSafeInteger(randomState)||randomState<0||randomState>0xffffffff)throw new Error('Invalid continuation random state.');
  const start=structuredClone(initial);start.world.randomState=randomState;
  const experiment=createExperiment(start,scenario);const s=experiment.seek(elapsed);
  return {randomState,elapsed,baseline:{grass:s.baseline.grass,browse:s.baseline.browse,counts:s.baseline.counts},
    changed:{grass:s.changed.grass,browse:s.changed.browse,counts:s.changed.counts}};
}
