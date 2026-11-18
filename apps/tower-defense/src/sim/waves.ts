import { ENEMIES, defaultLane, type EnemyKind, type Tier } from './enemies';
import type { LaneId } from './map';

/** A run of identical soldiers: `count` of them, `gap` seconds apart, starting `at` seconds into the wave. */
export type Squad = { kind: EnemyKind; tier: Tier; count: number; gap: number; at: number; lane: LaneId };
export type Wave = { squads: Squad[]; boss: boolean };

export const CAMPAIGN_WAVES = 30;
/** The stairs route opens with this wave. */
export const WEST_LANE_WAVE = 6;

type Entry = [kind: EnemyKind, count: number, gap: number, options?: { tier?: Tier; at?: number; lane?: LaneId }];

function wave(entries: Entry[], boss = false): Wave {
  let clock = 0;
  const squads: Squad[] = entries.map(([kind, count, gap, options]) => {
    const at = options?.at ?? clock;
    clock = at + count * gap + 1.5;
    return { kind, tier: options?.tier ?? 0, count, gap, at, lane: options?.lane ?? defaultLane(kind) };
  });
  return { squads, boss };
}

const W: LaneId = 'west';
const T: Tier = 1;
const G: Tier = 2;

/** The campaign. Squads start one after another unless `at` places them in time. */
export const WAVES: readonly Wave[] = [
  /* 1 */ wave([['rifleman', 8, 1.3]]),
  /* 2 */ wave([['rifleman', 12, 1.0]]),
  /* 3 */ wave([['rifleman', 8, 0.9], ['scout', 6, 0.6]]),
  /* 4 */ wave([['scout', 10, 0.5], ['rifleman', 12, 0.7]]),
  /* 5 */ wave([['shield', 4, 2.2], ['rifleman', 14, 0.6]]),
  /* 6 */ wave([['rifleman', 12, 0.8], ['rifleman', 10, 0.9, { lane: W, at: 2 }]]),
  /* 7 */ wave([['medic', 3, 3], ['rifleman', 16, 0.55, { at: 1 }], ['scout', 8, 0.5, { lane: W, at: 6 }]]),
  /* 8 */ wave([['helicopter', 4, 2.5], ['shield', 6, 1.6, { at: 0 }], ['rifleman', 10, 0.6, { lane: W, at: 4 }]]),
  /* 9 */ wave([['jeep', 3, 3.5], ['bugler', 2, 4, { at: 2 }], ['rifleman', 18, 0.5, { at: 3 }], ['scout', 10, 0.45, { lane: W, at: 8 }]]),
  /* 10 */ wave([['rifleman', 14, 0.6], ['colonel', 1, 1, { at: 6 }], ['shield', 6, 1.4, { at: 9 }], ['scout', 10, 0.5, { lane: W, at: 12 }]], true),
  /* 11 */ wave([['rifleman', 14, 0.6, { tier: T }], ['paratrooper', 8, 0.9, { at: 4 }]]),
  /* 12 */ wave([['tank', 1, 1], ['shield', 8, 1.2, { at: 2 }], ['rifleman', 14, 0.5, { lane: W, tier: T, at: 5 }]]),
  /* 13 */ wave([['helicopter', 8, 1.6], ['scout', 16, 0.35, { tier: T, at: 2 }], ['medic', 4, 2, { lane: W, at: 6 }], ['rifleman', 12, 0.5, { lane: W, at: 7 }]]),
  /* 14 */ wave([['jeep', 5, 2.2], ['bugler', 3, 3, { at: 1 }], ['rifleman', 22, 0.4, { tier: T, at: 3 }], ['jeep', 3, 2.5, { lane: W, at: 8 }]]),
  /* 15 */ wave([['tank', 2, 6], ['paratrooper', 12, 0.7, { tier: T, at: 3 }], ['shield', 10, 1.0, { lane: W, tier: T, at: 6 }]]),
  /* 16 */ wave([['rifleman', 24, 0.35, { tier: T }], ['medic', 5, 2, { tier: T, at: 2 }], ['helicopter', 8, 1.3, { tier: T, at: 6 }], ['scout', 18, 0.3, { lane: W, tier: T, at: 9 }]]),
  /* 17 */ wave([['shield', 12, 0.9, { tier: T }], ['tank', 2, 5, { at: 4 }], ['jeep', 6, 1.8, { lane: W, tier: T, at: 7 }]]),
  /* 18 */ wave([['paratrooper', 16, 0.55, { tier: T }], ['bugler', 4, 2.5, { tier: T, at: 2 }], ['rifleman', 26, 0.33, { tier: T, at: 4 }], ['tank', 1, 1, { lane: W, at: 10 }]]),
  /* 19 */ wave([['helicopter', 14, 0.9, { tier: T }], ['jeep', 6, 1.6, { tier: T, at: 3 }], ['shield', 10, 0.9, { lane: W, tier: T, at: 6 }], ['medic', 4, 2, { lane: W, tier: T, at: 7 }]]),
  /* 20 */ wave([['rifleman', 20, 0.4, { tier: T }], ['transport', 1, 1, { at: 5 }], ['tank', 2, 5, { at: 8 }], ['scout', 20, 0.3, { lane: W, tier: T, at: 12 }]], true),
  /* 21 */ wave([['rifleman', 22, 0.4, { tier: G }], ['scout', 14, 0.35, { lane: W, tier: G, at: 4 }]]),
  /* 22 */ wave([['tank', 3, 4, { tier: T }], ['shield', 12, 0.8, { tier: G, at: 3 }], ['paratrooper', 14, 0.5, { tier: G, at: 8 }]]),
  /* 23 */ wave([['helicopter', 16, 0.8, { tier: G }], ['jeep', 8, 1.4, { tier: G, at: 2 }], ['medic', 6, 1.6, { lane: W, tier: G, at: 5 }], ['rifleman', 22, 0.35, { lane: W, tier: G, at: 6 }]]),
  /* 24 */ wave([['bugler', 6, 1.8, { tier: G }], ['rifleman', 34, 0.28, { tier: G, at: 1 }], ['tank', 2, 5, { lane: W, tier: T, at: 6 }]]),
  /* 25 */ wave([['tank', 4, 3.5, { tier: T }], ['colonel', 1, 1, { tier: T, at: 6 }], ['shield', 14, 0.7, { lane: W, tier: G, at: 8 }], ['helicopter', 10, 1, { tier: G, at: 12 }]], true),
  /* 26 */ wave([['paratrooper', 24, 0.4, { tier: G }], ['jeep', 10, 1.2, { tier: G, at: 3 }], ['scout', 20, 0.3, { lane: W, tier: G, at: 6 }]]),
  /* 27 */ wave([['shield', 18, 0.6, { tier: G }], ['medic', 8, 1.3, { tier: G, at: 2 }], ['tank', 4, 3, { tier: G, at: 6 }], ['rifleman', 28, 0.3, { lane: W, tier: G, at: 8 }]]),
  /* 28 */ wave([['helicopter', 22, 0.6, { tier: G }], ['transport', 1, 1, { tier: T, at: 4 }], ['jeep', 7, 1.4, { lane: W, tier: G, at: 6 }], ['bugler', 6, 1.5, { lane: W, tier: G, at: 7 }]], true),
  /* 29 */ wave([['tank', 4, 3.2, { tier: G }], ['rifleman', 40, 0.24, { tier: G, at: 3 }], ['paratrooper', 20, 0.4, { tier: G, at: 8 }], ['tank', 2, 4, { lane: W, tier: T, at: 10 }]]),
  /* 30 */ wave([['rifleman', 30, 0.3, { tier: G }], ['general', 1, 1, { at: 6 }], ['tank', 4, 3.5, { tier: G, at: 10 }], ['helicopter', 16, 0.8, { tier: G, at: 14 }], ['shield', 16, 0.7, { lane: W, tier: G, at: 16 }], ['colonel', 1, 1, { lane: W, tier: G, at: 24 }]], true),
];

const ENDLESS_POOL: readonly EnemyKind[] = ['rifleman', 'scout', 'shield', 'medic', 'bugler', 'jeep', 'paratrooper', 'helicopter', 'tank'];

/**
 * Waves after the campaign: a budget that grows each wave is spent on random
 * elite squads, with a boss every fifth wave. `random` must be the game's
 * seeded generator.
 */
export function endlessWave(number: number, random: () => number): Wave {
  const extra = number - CAMPAIGN_WAVES;
  let budget = 5200 * 1.16 ** extra;
  const entries: Entry[] = [];
  let at = 0;
  const boss = extra % 5 === 0;
  if (boss) {
    const kind: EnemyKind = (['colonel', 'transport', 'general'] as const)[Math.floor(extra / 5) % 3];
    entries.push([kind, 1 + Math.floor(extra / 15), 6, { tier: G, at: 5 }]);
    budget *= 0.6;
  }
  while (budget > 0 && entries.length < 9) {
    const kind = ENDLESS_POOL[Math.floor(random() * ENDLESS_POOL.length)];
    const def = ENEMIES[kind];
    const worth = def.health * 5 * (1 + def.armor) * (def.flying ? 1.3 : 1);
    const count = Math.max(2, Math.min(40, Math.round((budget * (0.2 + random() * 0.25)) / worth)));
    const lane: LaneId = def.flying || def.drop ? defaultLane(kind) : random() < 0.4 ? 'west' : 'east';
    entries.push([kind, count, Math.max(0.2, 1.6 / Math.sqrt(count)) * (kind === 'tank' ? 4 : 1), { tier: G, at, lane }]);
    budget -= count * worth;
    at += 2 + random() * 3;
  }
  return wave(entries, boss);
}

/** Health multiplier for endless waves, on top of the elite tier. */
export function endlessHealth(number: number): number {
  return number <= CAMPAIGN_WAVES ? 1 : 1.12 ** (number - CAMPAIGN_WAVES);
}
