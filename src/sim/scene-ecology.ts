import { SCENE_PARAMS } from './engine.ts';
import type { Params, SpeciesId, SpeciesParams } from './engine.ts';

// Design assumptions for a cared-for companion scene, not wild ecology.
export const VISITOR_ROLES = {
  dog: { label: 'Fed companion · startles rabbits and deer', speed: 7, startles: ['rabbit', 'deer'] },
  cat: { label: 'Fed companion · startles rabbits', speed: 6, startles: ['rabbit'] },
  penguin: { label: 'Cared-for visitor · fish supplied off-map', speed: 3, startles: [] },
} as const;

export function sceneParams({ populated = false }: { populated?: boolean } = {}): Params {
  // Each world owns its nested parameters; editing one cannot alter another.
  const params = structuredClone(SCENE_PARAMS);
  for (const [id, role] of Object.entries(VISITOR_ROLES)) {
    params.species[id as SpeciesId] = {
      diet: [], prey: {}, speed: role.speed, vision: 8,
      energyMax: 20, energyStart: 18, metabolism: 1, forage: 1,
      startles: [...role.startles], matureAge: 52, maxAge: 1040,
      breedWeeks: [0, 0], breedChance: 0, breedEnergy: 20,
      litter: [1, 1], birthCost: 0,
    } satisfies SpeciesParams;
  }
  params.initial = Object.fromEntries(Object.keys(params.species).map(id => [
    id, populated ? (SCENE_PARAMS.initial[id as SpeciesId] ?? 0) : 0,
  ]));
  if (!populated) delete params.immigration;
  return params;
}
