import assert from 'node:assert/strict';
import {createForestController,createExperiment,experimentFromReplay} from '../dist/index.js';
const scene=createForestController({seed:7});
const experiment=createExperiment(scene.toSnapshot(),{kind:'rain',rain:.5,durationWeeks:52});
const first=experiment.seek(13);const restored=experimentFromReplay(JSON.parse(JSON.stringify(experiment.toReplay())));restored.seek(52);experiment.seek(52);assert.deepEqual(restored.getState().changed.world.toSnapshot(),experiment.getState().changed.world.toSnapshot());console.log({week:first.elapsed,usual:first.baseline.counts,lessRain:first.changed.counts,replayContinuation:'exact'});
