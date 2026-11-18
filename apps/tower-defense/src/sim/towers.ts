export type TowerKind = 'popgun' | 'dart' | 'mortar' | 'glue' | 'ballista' | 'robot';
export const TOWER_KINDS: readonly TowerKind[] = ['popgun', 'dart', 'glue', 'mortar', 'ballista', 'robot'];
export type TargetMode = 'first' | 'last' | 'strong' | 'close';
export const TARGET_MODES: readonly TargetMode[] = ['first', 'last', 'strong', 'close'];
export const MAX_LEVEL = 3;

export type TowerLevel = {
  /** Buttons to build (level 1) or to upgrade to this level. */
  cost: number;
  range: number;
  /** Damage per shot, or per second at the start of a beam. */
  damage: number;
  /** Seconds between shots. */
  cooldown: number;
  /** Splash radius of a landing shot. */
  splash?: number;
  /** Soldiers a bolt passes through. */
  pierce?: number;
  /** Glue puddle: speed multiplier, radius and lifetime. */
  slow?: { factor: number; radius: number; duration: number };
  /** Beam: damage multiplier reached after `rampTime` seconds on one target. */
  ramp?: { factor: number; time: number };
};

export type TowerDef = {
  kind: TowerKind;
  name: string;
  blurb: string;
  /** How a shot travels. */
  attack: 'homing' | 'lob' | 'bolt' | 'beam' | 'puddle';
  hitsAir: boolean;
  /** Share of a target's armour this tower ignores. */
  armorPierce: number;
  /** Too heavy to stand on furniture. */
  heavy: boolean;
  minRange: number;
  /** Shot speed in units per second (homing, bolt) or flight time in seconds (lob, puddle). */
  shot: number;
  levels: [TowerLevel, TowerLevel, TowerLevel];
};

export const TOWERS: Record<TowerKind, TowerDef> = {
  popgun: {
    kind: 'popgun', name: 'Pop-gun tower', blurb: 'Cheap and steady. Corks hit one soldier at a time.',
    attack: 'homing', hitsAir: true, armorPierce: 0.25, heavy: false, minRange: 0, shot: 11,
    levels: [
      { cost: 100, range: 3.2, damage: 12, cooldown: 0.8 },
      { cost: 90, range: 3.5, damage: 20, cooldown: 0.7 },
      { cost: 180, range: 3.9, damage: 34, cooldown: 0.52 },
    ],
  },
  dart: {
    kind: 'dart', name: 'Dart blaster', blurb: 'Sprays foam darts. Great against crowds, weak against armour.',
    attack: 'homing', hitsAir: true, armorPierce: 0, heavy: false, minRange: 0, shot: 13,
    levels: [
      { cost: 150, range: 2.8, damage: 5, cooldown: 0.22 },
      { cost: 130, range: 3.0, damage: 7, cooldown: 0.17 },
      { cost: 250, range: 3.3, damage: 10, cooldown: 0.115 },
    ],
  },
  glue: {
    kind: 'glue', name: 'Glue bottle', blurb: 'Squirts sticky puddles that slow everything on foot or wheels.',
    attack: 'puddle', hitsAir: false, armorPierce: 0, heavy: false, minRange: 0, shot: 0.55,
    levels: [
      { cost: 120, range: 2.8, damage: 0, cooldown: 3.2, slow: { factor: 0.6, radius: 1.0, duration: 4 } },
      { cost: 100, range: 3.1, damage: 0, cooldown: 2.8, slow: { factor: 0.48, radius: 1.2, duration: 4.5 } },
      { cost: 200, range: 3.5, damage: 0, cooldown: 2.4, slow: { factor: 0.38, radius: 1.45, duration: 5.5 } },
    ],
  },
  mortar: {
    kind: 'mortar', name: 'Marble mortar', blurb: 'Lobs heavy marbles that burst on landing. Cracks armour; cannot hit aircraft.',
    attack: 'lob', hitsAir: false, armorPierce: 0.8, heavy: true, minRange: 1.3, shot: 0.95,
    levels: [
      { cost: 220, range: 4.6, damage: 38, cooldown: 2.4, splash: 1.0 },
      { cost: 190, range: 5.0, damage: 62, cooldown: 2.2, splash: 1.15 },
      { cost: 340, range: 5.6, damage: 100, cooldown: 1.85, splash: 1.35 },
    ],
  },
  ballista: {
    kind: 'ballista', name: 'Rubber-band ballista', blurb: 'Long range. Its bolt flies straight through a whole column.',
    attack: 'bolt', hitsAir: true, armorPierce: 0.5, heavy: false, minRange: 0, shot: 16,
    levels: [
      { cost: 260, range: 5.2, damage: 55, cooldown: 2.0, pierce: 3 },
      { cost: 210, range: 5.8, damage: 90, cooldown: 1.8, pierce: 4 },
      { cost: 400, range: 6.5, damage: 150, cooldown: 1.5, pierce: 6 },
    ],
  },
  robot: {
    kind: 'robot', name: 'Tin robot', blurb: 'Its eye beam ignores armour and grows stronger the longer it holds a target.',
    attack: 'beam', hitsAir: true, armorPierce: 1, heavy: true, minRange: 0, shot: 0,
    levels: [
      { cost: 480, range: 3.4, damage: 30, cooldown: 0, ramp: { factor: 3, time: 3 } },
      { cost: 400, range: 3.8, damage: 55, cooldown: 0, ramp: { factor: 3, time: 2.6 } },
      { cost: 700, range: 4.3, damage: 100, cooldown: 0, ramp: { factor: 3.2, time: 2.2 } },
    ],
  },
};

export const SELL_SHARE = 0.7;

/** Total buttons spent on a tower of this kind at this level (1-based). */
export function investedIn(kind: TowerKind, level: number): number {
  let total = 0;
  for (let index = 0; index < level; index += 1) total += TOWERS[kind].levels[index].cost;
  return total;
}
