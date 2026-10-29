import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, SCENE_PARAMS } from '../src/sim/engine.ts';
import { sceneParams } from '../src/sim/scene-ecology.ts';

test('an empty companion scene stays empty without immigration', () => {
  const w = new World(sceneParams(), 7); w.run(52);
  assert.equal(w.animals.length, 0);
});

test('companion profiles survive a model year without hunting or breeding', () => {
  const w = new World(sceneParams(), 7);
  for (const species of ['dog', 'cat', 'penguin']) {
    w.addCreature({ species, x: 50, y: 30, sex: 'f' });
    w.addCreature({ species, x: 51, y: 30, sex: 'm' });
  }
  w.run(52);
  for (const species of ['dog', 'cat', 'penguin']) assert.equal(w.count(species), 2);
  assert(!w.events.some(e => e.type === 'kill' || e.type === 'birth'));
  assert.deepEqual(w.checkInvariants(), []);
});

test('rapid additions have separate IDs, selected sexes and arrival events', () => {
  const w = new World(sceneParams(), 7);
  const a = w.addCreature({ species: 'rabbit', x: 50, y: 30, sex: 'f' });
  const b = w.addCreature({ species: 'rabbit', x: 51, y: 30, sex: 'm' });
  assert.notEqual(a.id, b.id);
  assert.deepEqual([a.sex, b.sex], ['f', 'm']);
  assert.deepEqual(w.events.map(e => e.id), [a.id, b.id]);
  assert(w.events.every(e => e.type === 'arrive' && e.t === 0));
  w.step(); assert.equal(w.count('rabbit'), 2);
});

test('invalid inputs are refused before adding an animal or event', () => {
  const w = new World(sceneParams(), 7, [], (x) => x < 60);
  const valid = { species: 'dog', x: 50, y: 30 };
  for (const change of [
    { species: 'dragon' }, { species: '__proto__' }, { sex: 'unknown' },
    { x: NaN }, { y: Infinity }, { x: -1 }, { x: 100 }, { y: 56 }, { x: 65 },
  ]) assert.throws(() => w.addCreature({ ...valid, ...change }));
  assert.equal(w.animals.length, 0); assert.equal(w.events.length, 0);
  assert.equal(w.addCreature(valid).id, 1);
});

test('the import cap counts living creatures and preserves state on rejection', () => {
  const w = new World(sceneParams(), 7);
  for (let i = 0; i < 80; i++) w.addCreature({ species: 'dog', x: 50, y: 30 });
  assert.throws(() => w.addCreature({ species: 'cat', x: 50, y: 30 }), /80-creature/);
  assert.equal(w.events.length, 80); assert.equal(w.animals.length, 80);
  w.animals[0].alive = false;
  assert.equal(w.addCreature({ species: 'cat', x: 50, y: 30 }).id, 81);
});

test('editing a scene profile cannot change the defaults or another scene', () => {
  const original = SCENE_PARAMS.species.rabbit.speed;
  const a = sceneParams({ populated: true }); const b = sceneParams({ populated: true });
  a.species.rabbit.speed = 999;
  a.immigration.rabbit.chance = 0;
  a.species.dog.startles.push('wolf');
  assert.equal(SCENE_PARAMS.species.rabbit.speed, original);
  assert.equal(b.species.rabbit.speed, original);
  assert.notEqual(b.immigration.rabbit.chance, 0);
  assert(!b.species.dog.startles.includes('wolf'));
});

test('a nearby dog startles a rabbit without predation', () => {
  const p = sceneParams(); p.species.dog.speed = 0;
  const baseline = new World(structuredClone(p), 19);
  const companion = new World(structuredClone(p), 19);
  for (const w of [baseline, companion]) w.addCreature({ species: 'rabbit', x: 50, y: 30 });
  companion.addCreature({ species: 'dog', x: 51, y: 30 });
  baseline.step(); companion.step();
  assert(companion.events.some(e => e.type === 'disturb'));
  assert(!companion.events.some(e => e.type === 'kill'));
  assert(companion.animals[0].x < 50);
  assert.notDeepEqual(companion.animals[0].x, baseline.animals[0].x);
});

test('populated mode retains the four-species baseline for the same seed', () => {
  const a = new World(structuredClone(SCENE_PARAMS), 42);
  const b = new World(sceneParams({ populated: true }), 42);
  a.run(104); b.run(104);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.animals, b.animals);
  for (const species of ['rabbit', 'deer', 'fox', 'wolf']) assert.equal(a.count(species), b.count(species));
});
