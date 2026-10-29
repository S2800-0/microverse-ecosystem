# Microverse Ecosystem

A deterministic toy ecology engine with complete snapshots, paired interventions and exact replay continuation. No model key or browser is needed.

## Run it

Use Node.js 24 or newer:

```sh
git clone https://github.com/S2800-0/microverse-ecosystem.git
cd microverse-ecosystem
npm test
npm run demo
```

`npm test` builds JavaScript exports and runs the extracted engine, companion and replay regressions. `npm run demo` runs a half-rainfall comparison and verifies exact continuation after a JSON round trip. No package dependencies need installation.

## Use the modules

```js
import {createForestController, createExperiment} from './dist/index.js';
const scene = createForestController({seed: 7});
const experiment = createExperiment(scene.toSnapshot(), {
  kind: 'rain', rain: 0.5, durationWeeks: 52
});
const result = experiment.seek(13);
console.log(result.baseline.counts, result.changed.counts);
```

Build with `npm run build` before importing `dist/index.js`. There is no npm registry release; the source and build are in this repository. The package prepare script also builds when installed from GitHub with a compatible Node version.

One tick is one model week. The small curated forest uses explicit diet, food, birth, mortality and immigration rules. Dogs/cats are cared-for companions, not inferred ecological predators. Terrain is curated, not reconstructed from a photograph. Model parameters are illustrative and not calibrated for an outdoor site. A model comparison is not an environmental forecast or proof of causation in nature.

Snapshots include future random-generator state. Replays may contain user-supplied names/images/notes; treat exported files as potentially private. The library ships no user data.

## Source and licence

MIT for this project code. See LICENSE, NOTICE.md and SOURCE_MANIFEST.json. Extracted from the Microverse project, including previously disclosed pre-event prototype work and later refinements. No generated art, photos, model weights, credentials or third-party provider adapters are included. This is a reusable prototype, not a claim of external adoption.

Use feature branches and pull requests for subsequent changes. Run npm test before proposing a change.
