import type { LaneId } from './map';

export type EnemyKind =
  | 'rifleman' | 'scout' | 'shield' | 'medic' | 'bugler' | 'jeep' | 'paratrooper' | 'helicopter' | 'tank'
  | 'colonel' | 'transport' | 'general';

/** Plastic colour of a soldier: green recruits, tan veterans, grey elites. */
export type Tier = 0 | 1 | 2;
export const TIER_NAMES = ['Green', 'Tan', 'Grey'] as const;
export const TIER_HEALTH = [1, 2.3, 5] as const;
export const TIER_BOUNTY = [1, 1.5, 2.2] as const;
export const TIER_SPEED = [1, 1.05, 1.1] as const;

export type EnemyDef = {
  kind: EnemyKind;
  name: string;
  blurb: string;
  health: number;
  /** Units per second along the lane. */
  speed: number;
  /** Share of damage shrugged off (before a tower's armour piercing). */
  armor: number;
  /** Buttons paid when beaten. */
  bounty: number;
  /** Cushions lost when it reaches the fort. */
  lives: number;
  /** Hit and shadow radius. */
  radius: number;
  flying: boolean;
  boss: boolean;
  /** Heals others nearby, in health share per second. */
  heal?: { radius: number; perSecond: number };
  /** Speeds up others nearby. */
  haste?: { radius: number; factor: number };
  /** Released at its position when beaten. */
  cargo?: { kind: EnemyKind; count: number };
  /** Released at intervals while alive (bosses). */
  deploys?: { kind: EnemyKind; tier: Tier; count: number; every: number };
  /** Starts in the air and lands on its ground lane this far along (share of the lane). */
  drop?: { from: number; to: number; airSpeed: number };
  /** Stuns towers in a radius at intervals. */
  stomp?: { radius: number; every: number; duration: number };
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  rifleman: { kind: 'rifleman', name: 'Rifleman', blurb: 'Plain foot soldier.', health: 30, speed: 0.95, armor: 0, bounty: 5, lives: 1, radius: 0.15, flying: false, boss: false },
  scout: { kind: 'scout', name: 'Scout', blurb: 'Fast and fragile.', health: 17, speed: 1.75, armor: 0, bounty: 5, lives: 1, radius: 0.13, flying: false, boss: false },
  shield: { kind: 'shield', name: 'Shield bearer', blurb: 'Armoured. Darts bounce off; marbles do not.', health: 85, speed: 0.66, armor: 0.55, bounty: 12, lives: 1, radius: 0.18, flying: false, boss: false },
  medic: { kind: 'medic', name: 'Medic', blurb: 'Patches up soldiers nearby.', health: 46, speed: 0.92, armor: 0, bounty: 12, lives: 1, radius: 0.15, flying: false, boss: false, heal: { radius: 1.6, perSecond: 0.05 } },
  bugler: { kind: 'bugler', name: 'Bugler', blurb: 'Soldiers nearby march faster.', health: 40, speed: 0.95, armor: 0, bounty: 12, lives: 1, radius: 0.15, flying: false, boss: false, haste: { radius: 2, factor: 1.35 } },
  jeep: { kind: 'jeep', name: 'Jeep', blurb: 'Quick. Three riflemen jump out when it is wrecked.', health: 115, speed: 1.55, armor: 0.2, bounty: 16, lives: 2, radius: 0.34, flying: false, boss: false, cargo: { kind: 'rifleman', count: 3 } },
  paratrooper: { kind: 'paratrooper', name: 'Paratrooper', blurb: 'Drops in halfway along the veranda route.', health: 34, speed: 0.95, armor: 0, bounty: 8, lives: 1, radius: 0.15, flying: false, boss: false, drop: { from: 0.42, to: 0.6, airSpeed: 2.3 } },
  helicopter: { kind: 'helicopter', name: 'Helicopter', blurb: 'Flies straight for the fort. Marbles and glue cannot reach it.', health: 75, speed: 1.4, armor: 0, bounty: 16, lives: 2, radius: 0.4, flying: true, boss: false },
  tank: { kind: 'tank', name: 'Tank', blurb: 'Slow, with very thick armour.', health: 430, speed: 0.45, armor: 0.65, bounty: 45, lives: 4, radius: 0.46, flying: false, boss: false },
  colonel: { kind: 'colonel', name: 'Colonel Bucket', blurb: 'Boss. His stomp jams nearby towers.', health: 1900, speed: 0.42, armor: 0.2, bounty: 250, lives: 8, radius: 0.5, flying: false, boss: true, stomp: { radius: 2.6, every: 7, duration: 2.2 } },
  transport: { kind: 'transport', name: 'Sky Mule', blurb: 'Boss. A flying transport that drops veterans.', health: 4400, speed: 0.5, armor: 0.1, bounty: 400, lives: 10, radius: 0.9, flying: true, boss: true, deploys: { kind: 'rifleman', tier: 1, count: 3, every: 5.5 } },
  general: { kind: 'general', name: 'The General', blurb: 'Final boss, on an armoured train engine.', health: 12000, speed: 0.4, armor: 0.45, bounty: 800, lives: 99, radius: 0.85, flying: false, boss: true, deploys: { kind: 'scout', tier: 2, count: 2, every: 4.5 } },
};

/** The lane a kind uses when a wave does not say otherwise. */
export function defaultLane(kind: EnemyKind): LaneId {
  return ENEMIES[kind].flying ? 'air' : 'east';
}
