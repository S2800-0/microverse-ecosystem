import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, SCENE_PARAMS, seasonOf } from '../src/sim/engine.ts';

const params = () => structuredClone(SCENE_PARAMS);
function empty() {
  const p = params();
  p.initial = {};
  delete p.immigration;
  return p;
}

test('identical seeds and interventions reproduce events, agents and resources', () => {
  const changes = [{ atWeek: 26, untilWeek: 78, kind: 'drought', rain: 0.4 }];
  const a = new World(params(), 42, structuredClone(changes));
  const b = new World(params(), 42, structuredClone(changes));
  a.run(104); b.run(104);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.animals, b.animals);
  assert.deepEqual(a.grass, b.grass);
  assert.deepEqual(a.browse, b.browse);
});

test('an empty isolated world does not invent creatures', () => {
  const w = new World(empty(), 7);
  w.run(104);
  assert.equal(w.animals.length, 0);
  assert.deepEqual(w.events, []);
});

test('different seeds produce different initial worlds', () => {
  assert.notDeepEqual(new World(params(), 7).animals, new World(params(), 42).animals);
});

test('drought changes resources without needing animal population randomness', () => {
  const baseline = new World(empty(), 7);
  const drought = new World(empty(), 7, [{ atWeek: 0, untilWeek: 13, kind: 'drought', rain: 0.4 }]);
  baseline.run(13); drought.run(13);
  assert(drought.grassCover() < baseline.grassCover());
  assert(drought.browseCover() < baseline.browseCover());
  assert.equal(drought.events.filter(e => e.type === 'intervention').length, 1);
});

test('scheduled removal records deaths and prevents wolf immigration', () => {
  const w = new World(params(), 19, [{ atWeek: 3, kind: 'remove', species: 'wolf' }]);
  w.run(3);
  assert(w.count('wolf') > 0);
  w.step();
  assert.equal(w.count('wolf'), 0);
  assert(w.events.some(e => e.type === 'death' && e.species === 'wolf' && e.cause === 'removed'));
  w.run(100);
  assert.equal(w.count('wolf'), 0);
  assert(!w.events.some(e => e.type === 'arrive' && e.species === 'wolf' && e.t >= 3));
});

test('wolves without prey eventually starve in an isolated world', () => {
  const p = empty(); p.initial = { wolf: 2 };
  const w = new World(p, 7); w.run(30);
  assert.equal(w.count('wolf'), 0);
  assert(w.events.some(e => e.type === 'death' && e.cause === 'starved'));
});

test('birth rules do not create offspring when all animals are immature', () => {
  const p = empty(); p.initial = { rabbit: 4 };
  p.species.rabbit.matureAge = 1000;
  p.species.rabbit.breedWeeks = [0, 51];
  p.species.rabbit.breedChance = 1;
  const w = new World(p, 7);
  for (const animal of w.animals) animal.age = 0;
  w.run(52);
  assert(!w.events.some(e => e.type === 'birth'));
});

test('multiple seeds retain finite living agents and bounded resource biomass', () => {
  for (const seed of [7, 19, 42, 123, 987]) {
    const w = new World(params(), seed);
    for (let week = 0; week < 104; week++) {
      w.step();
      assert.deepEqual(w.checkInvariants(), [], `seed ${seed}, week ${week}`);
      for (const animal of w.animals.filter(a => a.alive)) {
        assert(Number.isFinite(animal.x) && Number.isFinite(animal.y));
        assert(animal.energy <= w.params.species[animal.species].energyMax);
      }
      for (const value of w.browse) assert(value >= 0 && value <= 1);
    }
  }
});

test('newborn offsets stay inside the map when parents breed at a corner', () => {
  const p = empty(); p.initial = { rabbit: 2 };
  Object.assign(p.species.rabbit, {
    matureAge: 1, breedWeeks: [0, 51], breedChance: 1,
    breedEnergy: 1, birthCost: 0.1, carrying: undefined,
    speed: 0, litter: [4, 4],
  });
  const w = new World(p, 7);
  w.animals.forEach((a, i) => Object.assign(a, { x: 0, y: 0, age: 2, sex: i ? 'm' : 'f' }));
  w.step();
  assert(w.events.some(e => e.type === 'birth'));
  for (const animal of w.animals) {
    assert(animal.x >= 0 && animal.x < p.width);
    assert(animal.y >= 0 && animal.y < p.height);
  }
});

test('life stories only contain events involving the selected animal', () => {
  const w = new World(params(), 7, [{ atWeek: 2, kind: 'remove', species: 'wolf' }]);
  const id = w.animals.find(a => a.species === 'wolf').id;
  w.run(10);
  const story = w.story(id);
  assert(story.length > 0);
  assert(story.every(e => e.id === id || e.parent === id || e.by === id || e.prey === id));
  assert.deepEqual(w.story(-1), []);
});

test('season boundaries follow a repeatable 52-week model year', () => {
  assert.deepEqual([0, 12, 13, 26, 39, 51, 52].map(seasonOf),
    ['spring', 'spring', 'summer', 'autumn', 'winter', 'winter', 'spring']);
});
