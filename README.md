# Microverse Ecosystem

[![Tests](https://github.com/S2800-0/microverse-ecosystem/actions/workflows/test.yml/badge.svg)](https://github.com/S2800-0/microverse-ecosystem/actions/workflows/test.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE) ![Node 24+](https://img.shields.io/badge/node-%3E%3D24-blue.svg) ![No runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-lightgrey.svg)

**A toy ecology engine with complete snapshots and exact replay, for running fair "what if" comparisons.**

Change one thing in a small simulated forest, and compare it against the same forest without the change. Both runs start from the same snapshot, so the change is the only difference. It needs no model key or browser.

## Features

- **Deterministic:** the same seed gives the same run.
- **Complete snapshots:** a snapshot includes the future random-generator state, so a run continues exactly after a JSON round trip.
- **Paired experiments:** compare a changed world against an unchanged one from the same start.
- **Readable rules:** a small curated forest with explicit diet, food, birth, mortality and immigration rules. One tick is one model week.

## Quick start

You need Node.js 24 or newer. There are no packages to install.

```bash
git clone https://github.com/S2800-0/microverse-ecosystem.git
cd microverse-ecosystem
npm test
npm run demo
```

The demo runs a half-rainfall comparison and checks that replay continues exactly:

```text
{
  week: 13,
  usual: { rabbit: 40, deer: 9, fox: 5, wolf: 3, dog: 0, cat: 0, penguin: 0 },
  lessRain: { rabbit: 37, deer: 9, fox: 5, wolf: 3, dog: 0, cat: 0, penguin: 0 },
  replayContinuation: 'exact'
}
```

## Usage

Run `npm run build` first, then import from `dist/index.js`:

```js
import {createForestController, createExperiment} from './dist/index.js';

const scene = createForestController({seed: 7});
const experiment = createExperiment(scene.toSnapshot(), {
  kind: 'rain', rain: 0.5, durationWeeks: 52
});

const result = experiment.seek(13);
console.log(result.baseline.counts, result.changed.counts);
```

You can also install from GitHub with a compatible Node version, since the prepare script builds the package.

## Limits

- Parameters are illustrative and not calibrated for any outdoor site.
- A comparison isn't an environmental forecast or proof of causation in nature.
- Terrain is curated, not reconstructed from a photograph.
- Dogs and cats are cared-for companions, not modelled as ecological predators.
- Replays can contain names, images or notes that users supplied, so treat exported files as potentially private. The library itself ships no user data.

## Status

Version 0.1.0 is a reusable prototype. It isn't on npm, so use the source from this repository. It hasn't been adopted by outside projects yet.

## Part of Microverse

This library was extracted from [Microverse](https://github.com/S2800-0/microverse), which turns a photo of a real place into a living little world. It includes work from the disclosed pre-event prototype plus later refinements. The other libraries are:

- [**microverse-puppets**](https://github.com/S2800-0/microverse-puppets): Turns a transparent cutout of a four-legged animal into a walking puppet, in the browser
- [**microverse-commands**](https://github.com/S2800-0/microverse-commands): Turns ecology questions and model replies into strictly checked experiment proposals

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). See [NOTICE.md](NOTICE.md) and [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json) for where the code came from. No generated art, photos, model weights, credentials or provider adapters are included.
