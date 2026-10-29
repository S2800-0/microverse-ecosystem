// Microverse ecosystem engine (spike).
// Deterministic agent-based model: same seed + params => identical event log.
// One tick = one week. 52 ticks = one year.
import { ENGINE_VERSION, validateWorldSnapshot } from './snapshot.ts';
import type { WorldSnapshot } from './snapshot.ts';

export type SpeciesId = "rabbit" | "deer" | "fox" | "wolf" | "dog" | "cat" | "penguin";
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface SpeciesParams {
  diet: "grass" | "browse" | SpeciesId[]; // rabbits graze grass, deer browse shrubs (niche split)
  speed: number;          // cells moved per week
  vision: number;         // cells
  energyMax: number;
  energyStart: number;
  metabolism: number;     // energy burned per week
  grazeAmount?: number;   // grass biomass eaten per week (grazers)
  grazeGain?: number;     // energy per unit biomass
  prey?: Partial<Record<SpeciesId, { success: number; gain: number }>>;
  matureAge: number;      // weeks
  maxAge: number;         // weeks
  breedWeeks: [number, number]; // week-of-year window
  breedChance: number;    // per week, inside the window
  breedEnergy: number;    // minimum energy to breed
  litter: [number, number];
  birthCost: number;      // energy per offspring
  territoryCap?: number;  // predators: breeding falls to 0 at this population
  huntBelow?: number;     // predators only hunt below this fraction of energyMax (satiation)
  carrying?: number;      // grazers: breeding slows towards carrying × food cover (logistic density dependence)
  startles?: SpeciesId[]; // design assumption: nonlethal disturbance
  forage?: number;        // energy per week from food the model doesn't track (insects, berries, small rodents)
  refuge?: number;        // prey: when fewer than this remain, they get harder to find (burrows, cover)
}

export interface Params {
  width: number;
  height: number;
  rain: number;           // 1 = normal; drought < 1
  regrow: number;         // grass regrowth per week at full rain
  regrowBrowse: number;   // shrub regrowth per week at full rain
  species: Record<SpeciesId, SpeciesParams>;
  initial: Partial<Record<SpeciesId, number>>;
  // a small patch is connected to the wider forest: when a species is scarce, a few wander in from the edge
  immigration?: Partial<Record<SpeciesId, { below: number; chance: number; group: [number, number] }>>;
}

export interface Intervention {
  atWeek: number;
  untilWeek?: number;
  kind: "drought" | "remove";
  rain?: number;
  species?: SpeciesId;
}

export interface Animal {
  id: number;
  species: SpeciesId;
  name?: string;
  x: number; y: number;
  energy: number;
  age: number;
  alive: boolean;
  parent?: number;
  sex: "f" | "m";
  distanceThisWeek: number;
}

export type Event =
  | { t: number; type: "birth"; id: number; species: SpeciesId; parent: number }
  | { t: number; type: "death"; id: number; species: SpeciesId; cause: "starved" | "old age" | "eaten" | "removed"; by?: number }
  | { t: number; type: "kill"; id: number; prey: number; preySpecies: SpeciesId }
  | { t: number; type: "intervention"; kind: string; detail: string }
  | { t: number; type: "disturb"; id: number; other: number }
  | { t: number; type: "arrive"; id: number; species: SpeciesId };

// ---------- seeded RNG (mulberry32) ----------
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.getState = () => a;
  next.setState = (state: number) => { a = state >>> 0; };
  return next;
}

export function seasonOf(week: number): Season {
  const w = week % 52;
  return w < 13 ? "spring" : w < 26 ? "summer" : w < 39 ? "autumn" : "winter";
}
const SEASON_GROWTH: Record<Season, number> = { spring: 1.3, summer: 1.0, autumn: 0.45, winter: 0.05 };

// ---------- default, hand-tuned parameters (each value is an assumption to cite) ----------
export const DEFAULT_PARAMS = {
  width: 100,
  height: 64,
  rain: 1,
  regrow: 0.12,
  regrowBrowse: 0.07,
  initial: { rabbit: 260, deer: 80, fox: 10, wolf: 10 },
  species: {
    rabbit: {
      diet: "grass", speed: 3, vision: 4, energyMax: 10, energyStart: 6, metabolism: 0.9,
      grazeAmount: 0.04, grazeGain: 26,
      matureAge: 20, maxAge: 156, breedWeeks: [8, 30], breedChance: 0.16, breedEnergy: 7,
      litter: [2, 4], birthCost: 1.2, refuge: 150, carrying: 2400,
    },
    deer: {
      diet: "browse", speed: 5, vision: 6, energyMax: 30, energyStart: 22, metabolism: 1.6,
      grazeAmount: 0.25, grazeGain: 14,
      matureAge: 52, maxAge: 624, breedWeeks: [18, 26], breedChance: 0.24, breedEnergy: 16,
      litter: [1, 2], birthCost: 5, refuge: 40, carrying: 500,
    },
    fox: {
      diet: ["rabbit"], speed: 8, vision: 10, energyMax: 16, energyStart: 10, metabolism: 1.3,
      prey: { rabbit: { success: 0.45, gain: 4.5 } },
      matureAge: 40, maxAge: 312, breedWeeks: [10, 16], breedChance: 0.25, breedEnergy: 9,
      litter: [2, 5], birthCost: 1.5, territoryCap: 26, huntBelow: 0.55, forage: 0.9,
    },
    wolf: {
      diet: ["deer", "rabbit"], speed: 12, vision: 18, energyMax: 40, energyStart: 34, metabolism: 2.2,
      prey: { deer: { success: 0.3, gain: 26 }, rabbit: { success: 0.35, gain: 3 } },
      matureAge: 96, maxAge: 520, breedWeeks: [10, 16], breedChance: 0.3, breedEnergy: 22,
      litter: [3, 6], birthCost: 4, territoryCap: 14, huntBelow: 0.5,
    },
  },
} as Params;

// a forest the size of the game scene: tens of animals, not thousands.
// Same rules as DEFAULT_PARAMS; populations, caps and refuges scaled down.
export const SCENE_PARAMS: Params = {
  ...DEFAULT_PARAMS,
  width: 100,
  height: 56,
  initial: { rabbit: 34, deer: 12, fox: 5, wolf: 3 },
  immigration: {
    rabbit: { below: 8, chance: 0.3, group: [2, 3] },
    deer: { below: 4, chance: 0.08, group: [1, 2] },
    fox: { below: 2, chance: 0.05, group: [1, 1] },
    wolf: { below: 2, chance: 0.03, group: [1, 2] },
  },
  species: {
    rabbit: { ...DEFAULT_PARAMS.species.rabbit, refuge: 14, carrying: 110 },
    deer: { ...DEFAULT_PARAMS.species.deer, refuge: 5, carrying: 34 },
    fox: { ...DEFAULT_PARAMS.species.fox, territoryCap: 9 },
    wolf: { ...DEFAULT_PARAMS.species.wolf, territoryCap: 5 },
  },
};


const NAMES = ["Fern", "Bramble", "Moss", "Sorrel", "Juniper", "Hazel", "Rowan", "Thistle", "Alder", "Briar", "Ash", "Wren"];

export class World {
  private ORDER: SpeciesId[];
  week = 0;
  grass: Float32Array;
  browse: Float32Array;
  animals: Animal[] = [];
  events: Event[] = [];
  private nextId = 1;
  private r: ReturnType<typeof rng>;
  private predatorsOf: Record<SpeciesId, SpeciesId[]>;
  private rain: number;
  private buckets = new Map<SpeciesId, Map<number, Animal[]>>();

  params: Params;
  seed: number;
  interventions: Intervention[];

  // optional terrain: where animals may stand (world units). Without it the whole grid is open meadow.
  walkable: (x: number, y: number) => boolean;
  private open: Uint8Array;
  private excluded = new Set<SpeciesId>(); // removed species don't wander back in
  private canTraverse: (x0: number, y0: number, x1: number, y1: number) => boolean;

  constructor(params: Params, seed: number, interventions: Intervention[] = [], walkable?: (x: number, y: number) => boolean, canTraverse?: (x0: number, y0: number, x1: number, y1: number) => boolean) {
    this.params = params;
    this.ORDER = Object.keys(params.species) as SpeciesId[];
    this.walkable = walkable ?? (() => true);
    this.canTraverse = canTraverse ?? (() => true);
    this.seed = seed;
    this.interventions = interventions;
    this.r = rng(seed);
    this.predatorsOf = Object.fromEntries(this.ORDER.map(s => [s, this.ORDER.filter(q => !!params.species[q].prey?.[s] || !!params.species[q].startles?.includes(s))])) as Record<SpeciesId, SpeciesId[]>;
    this.rain = params.rain;
    const { width, height } = params;
    this.open = new Uint8Array(width * height);
    for (let i = 0; i < this.open.length; i++) this.open[i] = this.walkable((i % width) + 0.5, Math.floor(i / width) + 0.5) ? 1 : 0;
    if (!this.open.some(Boolean)) throw new Error('The terrain has no open ground.');
    // food only grows on open ground (no grass in the creek or under the trees)
    this.grass = new Float32Array(width * height);
    for (let i = 0; i < this.grass.length; i++) this.grass[i] = this.open[i] ? 0.5 + this.r() * 0.5 : 0;
    this.browse = new Float32Array(width * height);
    for (let i = 0; i < this.browse.length; i++) this.browse[i] = this.open[i] ? 0.4 + this.r() * 0.6 : 0;
    let named = 0;
    for (const s of this.ORDER) {
      for (let i = 0; i < (params.initial[s] ?? 0); i++) {
        const sp = params.species[s];
        let x = this.r() * width, y = this.r() * height;
        for (let k = 0; k < 200 && !this.walkable(x, y); k++) { x = this.r() * width; y = this.r() * height; }
        const a = this.spawn(s, x, y, sp.energyStart, 0);
        a.age = Math.floor(this.r() * sp.maxAge * 0.6);
        if ((s === "fox" || s === "wolf") && named < NAMES.length) a.name = NAMES[named++];
      }
    }
  }

  toSnapshot(): WorldSnapshot {
    // JSON normalization removes optional undefined fields and detaches all data.
    return JSON.parse(JSON.stringify({version:ENGINE_VERSION,seed:this.seed,week:this.week,
      randomState:this.r.getState(),nextId:this.nextId,rain:this.rain,params:this.params,
      animals:this.animals,events:this.events,interventions:this.interventions,
      grass:Array.from(this.grass),browse:Array.from(this.browse),open:Array.from(this.open),excluded:[...this.excluded]}));
  }

  static fromSnapshot(input: unknown, walkable?: (x:number,y:number)=>boolean,
    canTraverse?: (x0:number,y0:number,x1:number,y1:number)=>boolean): World {
    validateWorldSnapshot(input);
    const s: WorldSnapshot = structuredClone(input);
    if(s.open.some(v=>!v)&&(!walkable||!canTraverse))throw new Error('Restoring terrain requires its movement callbacks.');
    const w=new World({...s.params,initial:{}},s.seed,[],walkable,canTraverse);
    if(w.open.some((v,i)=>v!==s.open[i])||s.animals.some(a=>!w.walkable(a.x,a.y)))throw new Error('Snapshot terrain does not match.');
    w.params=s.params;w.week=s.week;w.r.setState(s.randomState);w.nextId=s.nextId;w.rain=s.rain;
    w.animals=s.animals;w.events=s.events;w.interventions=s.interventions;
    w.grass=Float32Array.from(s.grass);w.browse=Float32Array.from(s.browse);w.excluded=new Set(s.excluded);
    return w;
  }

  private spawn(s: SpeciesId, x: number, y: number, energy: number, parent: number): Animal {
    // Birth/arrival offsets can cross the map edge before the next movement tick.
    x = Math.max(0, Math.min(this.params.width - 0.01, x));
    y = Math.max(0, Math.min(this.params.height - 0.01, y));
    if (!this.walkable(x, y)) {
      let nearest = -1, distance = Infinity;
      for (let i = 0; i < this.open.length; i++) if (this.open[i]) {
        const cx = i % this.params.width + .5, cy = Math.floor(i / this.params.width) + .5;
        const d = (cx-x)**2 + (cy-y)**2;
        if (d < distance) { nearest = i; distance = d; }
      }
      x = nearest % this.params.width + .5; y = Math.floor(nearest / this.params.width) + .5;
    }
    const a: Animal = { id: this.nextId++, species: s, x, y, energy, age: 0, alive: true, parent, distanceThisWeek: 0, sex: this.r() < 0.5 ? "f" : "m" };
    this.animals.push(a);
    return a;
  }

  private ri(lo: number, hi: number) { return lo + Math.floor(this.r() * (hi - lo + 1)); }
  private cell(x: number, y: number) {
    const { width, height } = this.params;
    const cx = Math.min(width - 1, Math.max(0, Math.floor(x)));
    const cy = Math.min(height - 1, Math.max(0, Math.floor(y)));
    return cy * width + cx;
  }
  private clampMove(a: Animal, dx: number, dy: number) {
    const { width, height } = this.params;
    // shorten the step until it lands on open ground; if nothing works, stay put
    for (let f = 1; f > 0.1; f /= 2) {
      const nx = Math.min(width - 0.01, Math.max(0, a.x + dx * f));
      const ny = Math.min(height - 0.01, Math.max(0, a.y + dy * f));
      if (!this.walkable(nx, ny) || !this.canTraverse(a.x, a.y, nx, ny)) continue;
      a.distanceThisWeek += Math.hypot(nx - a.x, ny - a.y);
      a.x = nx; a.y = ny;
      return;
    }
  }

  // spatial hash with 10-cell buckets for neighbour search
  private rebuildBuckets() {
    this.buckets.clear();
    for (const s of this.ORDER) this.buckets.set(s, new Map());
    for (const a of this.animals) {
      if (!a.alive) continue;
      const m = this.buckets.get(a.species)!;
      const k = Math.floor(a.x / 10) * 1000 + Math.floor(a.y / 10);
      let b = m.get(k);
      if (!b) m.set(k, (b = []));
      b.push(a);
    }
  }
  private nearest(a: Animal, radius: number, species: SpeciesId[]): Animal | undefined {
    let best: Animal | undefined, bestD = radius * radius;
    const bx = Math.floor(a.x / 10), by = Math.floor(a.y / 10), span = Math.ceil(radius / 10);
    for (let i = bx - span; i <= bx + span; i++)
      for (let j = by - span; j <= by + span; j++) {
        for (const s of species) {
        const b = this.buckets.get(s)!.get(i * 1000 + j);
        if (!b) continue;
        for (const o of b) {
          if (!o.alive || o === a) continue;
          const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2;
          if (d < bestD) { bestD = d; best = o; }
        }
        }
      }
    return best;
  }

  count(s: SpeciesId) { let n = 0; for (const a of this.animals) if (a.alive && a.species === s) n++; return n; }
  // Explicit user addition; internal births/immigration keep their own rules.
  addCreature({ species, x, y, sex }: { species: SpeciesId; x: number; y: number; sex?: "f" | "m" }): Animal {
    if (!Object.hasOwn(this.params.species, species)) throw new Error('Unsupported ecological role.');
    if (sex !== undefined && sex !== 'f' && sex !== 'm') throw new Error('Choose female or male.');
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 ||
        x >= this.params.width || y >= this.params.height || !this.walkable(x, y)) {
      throw new Error('Choose open ground inside the map.');
    }
    if (this.animals.filter(a => a.alive).length >= 80) throw new Error('The scene has reached its 80-creature import limit.');
    const sp = this.params.species[species];
    const animal = this.spawn(species, x, y, sp.energyStart, 0);
    animal.age = sp.matureAge + 10;
    if (sex) animal.sex = sex;
    this.events.push({ t: this.week, type: 'arrive', id: animal.id, species });
    return animal;
  }
  counts(): Record<SpeciesId, number> {
    const c = Object.fromEntries(this.ORDER.map(s => [s, 0])) as Record<SpeciesId, number>;
    for (const a of this.animals) if (a.alive) c[a.species]++;
    return c;
  }
  // cover is averaged over open ground only
  grassCover() { let s = 0, n = 0; for (let i = 0; i < this.grass.length; i++) if (this.open[i]) { s += this.grass[i]; n++; } return n ? s / n : 0; }
  browseCover() { let s = 0, n = 0; for (let i = 0; i < this.browse.length; i++) if (this.open[i]) { s += this.browse[i]; n++; } return n ? s / n : 0; }

  private kill(a: Animal, cause: "starved" | "old age" | "eaten" | "removed", by?: number) {
    a.alive = false;
    this.events.push({ t: this.week, type: "death", id: a.id, species: a.species, cause, ...(by ? { by } : {}) });
  }

  private applyInterventions() {
    this.rain = this.params.rain;
    for (const iv of this.interventions) {
      const active = this.week >= iv.atWeek && (iv.untilWeek === undefined || this.week < iv.untilWeek);
      if (iv.kind === "drought" && active) this.rain = iv.rain ?? 0.4;
      if (iv.kind === "remove" && iv.species && this.week >= iv.atWeek) this.excluded.add(iv.species);
      if (this.week === iv.atWeek) {
        this.events.push({ t: this.week, type: "intervention", kind: iv.kind, detail: iv.kind === "drought" ? `rain ${iv.rain}` : `remove ${iv.species}` });
        if (iv.kind === "remove" && iv.species)
          for (const a of this.animals) if (a.alive && a.species === iv.species) this.kill(a, "removed");
      }
    }
  }

  step() {
    const p = this.params;
    this.applyInterventions();
    const season = seasonOf(this.week);
    const wy = this.week % 52;

    // grass regrows towards 1, scaled by season and rain
    const g = p.regrow * SEASON_GROWTH[season] * this.rain;
    for (let i = 0; i < this.grass.length; i++) {
      if (!this.open[i]) continue;
      const b = this.grass[i];
      this.grass[i] = Math.min(1, b + g * (1 - b) * (0.15 + b));
      // drought also dries standing grass a little
      if (this.rain < 1) this.grass[i] *= 1 - (1 - this.rain) * 0.08;
      const v = this.browse[i];
      this.browse[i] = Math.min(1, v + p.regrowBrowse * SEASON_GROWTH[season] * this.rain * (1 - v) * (0.15 + v));
    }

    this.immigrate();
    this.rebuildBuckets();
    const pop = this.counts();
    const cover = { grass: this.grassCover(), browse: this.browseCover() };
    const males = Object.fromEntries(this.ORDER.map(s => [s, 0])) as Record<SpeciesId, number>;
    for (const x of this.animals) if (x.alive && x.sex === "m" && x.age >= p.species[x.species].matureAge) males[x.species]++;
    // shuffle order deterministically so no species always moves first
    const order = this.animals.filter(a => a.alive);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

    const born: Animal[] = [];
    for (const a of order) {
      if (!a.alive) continue;
      const sp = p.species[a.species];
      a.age++;
      a.distanceThisWeek = 0;
      a.energy -= sp.metabolism;
      if (sp.forage) a.energy = Math.min(sp.energyMax, a.energy + sp.forage);

      if (!Array.isArray(sp.diet)) {
        const food = sp.diet === "grass" ? this.grass : this.browse;
        const threat = this.nearest(a, sp.vision, this.predatorsOf[a.species]);
        if (threat) {
          if(p.species[threat.species].startles?.includes(a.species))this.events.push({t:this.week,type:"disturb",id:threat.id,other:a.id});
          const d = Math.hypot(a.x - threat.x, a.y - threat.y) || 1;
          this.clampMove(a, ((a.x - threat.x) / d) * sp.speed, ((a.y - threat.y) / d) * sp.speed);
        } else {
          // move to the best of a few sampled spots, then graze
          let bx = a.x, by = a.y, bg = food[this.cell(a.x, a.y)];
          for (let k = 0; k < 4; k++) {
            const ang = this.r() * Math.PI * 2, dist = this.r() * sp.speed;
            const tx = a.x + Math.cos(ang) * dist, ty = a.y + Math.sin(ang) * dist;
            const tg = food[this.cell(tx, ty)];
            if (tg > bg) { bg = tg; bx = tx; by = ty; }
          }
          this.clampMove(a, bx - a.x, by - a.y);
        }
        const c = this.cell(a.x, a.y);
        // roots below 0.1 can't be grazed, so the meadow can always regrow
        const eaten = Math.min(Math.max(0, food[c] - 0.1), sp.grazeAmount!);
        food[c] -= eaten;
        a.energy = Math.min(sp.energyMax, a.energy + eaten * sp.grazeGain!);
      } else {
        const hungry = a.energy < sp.energyMax * (sp.huntBelow ?? 0.6);
        // choose the prey with the best expected meal per distance, not just the nearest
        let target: Animal | undefined, bestScore = 0;
        if (hungry) for (const [ps, pr] of Object.entries(sp.prey!) as [SpeciesId, { success: number; gain: number }][]) {
          const o = this.nearest(a, sp.vision, [ps]);
          if (!o) continue;
          const score = (pr.success * pr.gain) / (1 + Math.hypot(o.x - a.x, o.y - a.y));
          if (score > bestScore) { bestScore = score; target = o; }
        }
        if (target) {
          const d = Math.hypot(target.x - a.x, target.y - a.y);
          const step = Math.min(d, sp.speed);
          this.clampMove(a, ((target.x - a.x) / (d || 1)) * step, ((target.y - a.y) / (d || 1)) * step);
          if (d <= sp.speed && Math.hypot(target.x-a.x, target.y-a.y) < .1 && this.canTraverse(a.x,a.y,target.x,target.y)) {
            const pr = sp.prey![target.species]!;
            const ref = p.species[target.species].refuge;
            const findable = ref ? Math.min(1, pop[target.species] / ref) : 1;
            if (this.r() < pr.success * findable) {
              this.events.push({ t: this.week, type: "kill", id: a.id, prey: target.id, preySpecies: target.species });
              this.kill(target, "eaten", a.id);
              a.energy = Math.min(sp.energyMax, a.energy + pr.gain);
            }
          }
        } else {
          const ang = this.r() * Math.PI * 2;
          this.clampMove(a, Math.cos(ang) * sp.speed, Math.sin(ang) * sp.speed);
        }
      }

      if (a.energy <= 0) { this.kill(a, "starved"); continue; }
      if (a.age >= sp.maxAge) { this.kill(a, "old age"); continue; }

      // breeding: mature females breed when a mature male of their species is around
      if (a.age >= sp.matureAge && wy >= sp.breedWeeks[0] && wy <= sp.breedWeeks[1] && a.energy >= sp.breedEnergy) {
        let chance = a.sex === "f" && males[a.species] > 0 ? sp.breedChance : 0;
        if (sp.territoryCap) chance *= Math.max(0, 1 - pop[a.species] / sp.territoryCap);
        if (sp.carrying) chance *= Math.max(0, 1 - pop[a.species] / (sp.carrying * (sp.diet === "grass" ? cover.grass : cover.browse)));
        if (this.r() < chance) {
          const n = this.ri(sp.litter[0], sp.litter[1]);
          for (let k = 0; k < n; k++) {
            if (a.energy - sp.birthCost <= 0) break;
            a.energy -= sp.birthCost;
            const kx = a.x + (this.r() - 0.5) * 2, ky = a.y + (this.r() - 0.5) * 2;
            const ok = this.walkable(kx, ky);
            const kid = this.spawn(a.species, ok ? kx : a.x, ok ? ky : a.y, sp.energyStart * 0.6, a.id);
            born.push(kid);
            this.events.push({ t: this.week, type: "birth", id: kid.id, species: a.species, parent: a.id });
          }
        }
      }
    }
    // drop the dead every year to keep arrays small (ids stay unique)
    if (this.week % 52 === 51) this.animals = this.animals.filter(a => a.alive);
    this.week++;
  }

  run(weeks: number, onYear?: (w: World) => void) {
    for (let i = 0; i < weeks; i++) {
      this.step();
      if (onYear && this.week % 52 === 0) onYear(this);
    }
  }

  private immigrate() {
    const im = this.params.immigration;
    if (!im) return;
    const c = this.counts();
    for (const s of this.ORDER) {
      const rule = im[s];
      if (!rule || this.excluded.has(s) || c[s] >= rule.below || this.r() >= rule.chance) continue;
      const { width, height } = this.params;
      // enter at a random open spot near an edge
      let x = 0, y = 0;
      for (let k = 0; k < 100; k++) {
        const side = Math.floor(this.r() * 4), t = this.r();
        [x, y] = side === 0 ? [1 + this.r() * 4, t * height] : side === 1 ? [width - 1 - this.r() * 4, t * height] : side === 2 ? [t * width, 1 + this.r() * 4] : [t * width, height - 1 - this.r() * 4];
        if (this.walkable(x, y)) break;
      }
      if (!this.walkable(x, y)) continue;
      const sp = this.params.species[s];
      for (let n = this.ri(rule.group[0], rule.group[1]); n > 0; n--) {
        const a = this.spawn(s, x + (this.r() - 0.5) * 2, y + (this.r() - 0.5) * 2, sp.energyStart, 0);
        if (!this.walkable(a.x, a.y)) { a.x = x; a.y = y; }
        a.age = sp.matureAge + Math.floor(this.r() * sp.matureAge);
        this.events.push({ t: this.week, type: "arrive", id: a.id, species: s });
      }
    }
  }

  // invariants used by the acceptance tests
  checkInvariants(): string[] {
    const errs: string[] = [];
    const { width, height } = this.params;
    for (const a of this.animals) {
      if (!a.alive) continue;
      if (a.energy <= 0) errs.push(`alive with energy ${a.energy} (${a.id})`);
      if (a.x < 0 || a.y < 0 || a.x > width || a.y > height) errs.push(`out of bounds (${a.id})`);
      if (!Number.isFinite(a.energy)) errs.push(`non-finite energy (${a.id})`);
    }
    for (const g of this.grass) if (!(g >= 0 && g <= 1)) { errs.push(`grass out of range ${g}`); break; }
    return errs;
  }

  // life story for one animal, filtered from the event log
  story(id: number) {
    return this.events.filter(e =>
      (e.type === "birth" && (e.id === id || e.parent === id)) ||
      (e.type === "death" && (e.id === id || e.by === id)) ||
      (e.type === "kill" && (e.id === id || e.prey === id)));
  }
}
