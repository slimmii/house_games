import { ENEMIES, TIER_BOUNTY, TIER_HEALTH, TIER_SPEED, type EnemyDef, type EnemyKind, type Tier } from './enemies';
import { FLOOR_Y } from './grid';
import {
  GROUND_LANES, HIGH_GROUND_RANGE, LANES, LANE_SPREAD, TOWER_SPACING, lanePoint, nearestOnLane, siteAt,
  type GameMap, type Lane, type LaneId, type LanePoint,
} from './map';
import { nextRandom } from './rng';
import { MAX_LEVEL, SELL_SHARE, TOWERS, type TargetMode, type TowerKind, type TowerLevel } from './towers';
import { CAMPAIGN_WAVES, WAVES, endlessHealth, endlessWave, type Wave } from './waves';

/** Fixed simulation step. The game loop calls `stepGame` once per step, several times per frame at higher speeds. */
export const STEP = 1 / 60;

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Record<Difficulty, { name: string; blurb: string; lives: number; money: number; health: number; bounty: number; speed: number }> = {
  easy: { name: 'Playtime', blurb: 'Gentle soldiers and plenty of buttons.', lives: 25, money: 320, health: 0.8, bounty: 1.1, speed: 0.95 },
  normal: { name: 'Rainy Day', blurb: 'The proper campaign.', lives: 20, money: 260, health: 1, bounty: 1, speed: 1 },
  hard: { name: 'Past Bedtime', blurb: 'Lights low, soldiers tough, few cushions.', lives: 12, money: 230, health: 1.3, bounty: 0.9, speed: 1.06 },
};

export type AbilityKind = 'footsteps' | 'marbles';
export const ABILITIES: Record<AbilityKind, { name: string; blurb: string; cooldown: number }> = {
  footsteps: { name: 'Footsteps!', blurb: 'Someone is coming: every soldier freezes stiff for a moment.', cooldown: 75 },
  marbles: { name: 'Marble spill', blurb: 'Tip a bag of marbles down a stretch of the route.', cooldown: 45 },
};
const FREEZE_TIME = 4;
const BOSS_FREEZE_TIME = 1.5;
const MARBLE_RUN = { length: 10, speed: 7, reach: 0.5, pierce: 0.6, push: 0.8 };
/** Soldiers and aircraft cruise this far above the floor on the air lane. */
export const AIR_HEIGHT = LANES.air.height;

export type Enemy = {
  id: number;
  kind: EnemyKind;
  tier: Tier;
  wave: number;
  lane: LaneId;
  /** Distance travelled along the lane. */
  distance: number;
  lateral: number;
  health: number;
  maxHealth: number;
  speed: number;
  bounty: number;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  /** Height above the floor. */
  altitude: number;
  /** Out of reach of ground-only towers right now. */
  flying: boolean;
  /** Distance left to the fort, for "first" and "last" targeting. */
  remaining: number;
  slowFactor: number;
  slowTime: number;
  haste: number;
  frozen: number;
  /** Seconds a soldier that just jumped out of a wreck cannot be hurt (the shot that wrecked it is still flying). */
  grace: number;
  /** Parachute descent toward a point of the ground lane. */
  drop: { fromX: number; fromZ: number; fromAltitude: number; toX: number; toZ: number; landDistance: number; t: number; duration: number } | null;
  deployClock: number;
  stompClock: number;
  /** Seconds of hit flash left (rendering only). */
  flash: number;
};

export type Tower = {
  id: number;
  kind: TowerKind;
  /** 1 to 3. */
  level: number;
  x: number;
  y: number;
  z: number;
  /** Standing on furniture. */
  high: boolean;
  mode: TargetMode;
  cooldown: number;
  /** World yaw the turret points at. */
  aim: number;
  targetId: number;
  /** Seconds the beam has held its current target. */
  beamTime: number;
  /** Seconds of jam left after a stomp. */
  stunned: number;
  invested: number;
  kills: number;
  /** Seconds since the last shot (rendering: recoil). */
  sinceShot: number;
};

export type Shot =
  | { id: number; type: 'homing'; kind: TowerKind; x: number; y: number; z: number; targetId: number; tx: number; ty: number; tz: number; speed: number; damage: number; towerId: number }
  | { id: number; type: 'lob'; kind: TowerKind; x: number; y: number; z: number; fromX: number; fromY: number; fromZ: number; toX: number; toZ: number; t: number; duration: number; damage: number; splash: number; slow: TowerLevel['slow'] | null; towerId: number }
  | { id: number; type: 'bolt'; kind: TowerKind; x: number; y: number; z: number; dirX: number; dirZ: number; left: number; speed: number; damage: number; pierce: number; hit: number[]; towerId: number };

export type Puddle = { id: number; x: number; z: number; radius: number; factor: number; time: number; duration: number };
export type MarbleRun = { id: number; lane: LaneId; distance: number; left: number; damage: number; hit: number[] };

export type GameEvent =
  | { type: 'spawn'; kind: EnemyKind; boss: boolean }
  | { type: 'fire'; tower: TowerKind; x: number; y: number; z: number }
  | { type: 'hit'; tower: TowerKind; x: number; y: number; z: number }
  | { type: 'burst'; x: number; z: number; radius: number }
  | { type: 'puddle'; x: number; z: number; radius: number }
  | { type: 'die'; kind: EnemyKind; tier: Tier; x: number; z: number; altitude: number; bounty: number; boss: boolean }
  | { type: 'leak'; kind: EnemyKind; lives: number }
  | { type: 'land'; x: number; z: number }
  | { type: 'stomp'; x: number; z: number; radius: number }
  | { type: 'wave'; number: number; boss: boolean }
  | { type: 'waveClear'; number: number; bonus: number }
  | { type: 'build'; tower: TowerKind; x: number; y: number; z: number }
  | { type: 'upgrade'; tower: TowerKind; x: number; y: number; z: number }
  | { type: 'sell'; x: number; y: number; z: number; refund: number }
  | { type: 'ability'; kind: AbilityKind; x: number; z: number }
  | { type: 'won' }
  | { type: 'lost' };

type Pending = { time: number; kind: EnemyKind; tier: Tier; lane: LaneId; wave: number };

export type GameState = {
  difficulty: Difficulty;
  rng: { seed: number };
  time: number;
  phase: 'playing' | 'won' | 'lost';
  /** After the campaign is won the player may keep going. */
  endless: boolean;
  lives: number;
  maxLives: number;
  money: number;
  /** Waves launched so far. */
  wave: number;
  /** Seconds until the next wave launches by itself; negative while waiting for the player. */
  countdown: number;
  pending: Pending[];
  /** Soldiers of each wave not yet beaten or leaked (index = wave number). */
  waveLeft: number[];
  enemies: Enemy[];
  towers: Tower[];
  shots: Shot[];
  puddles: Puddle[];
  marbles: MarbleRun[];
  cooldowns: Record<AbilityKind, number>;
  nextId: number;
  /** Things that happened since the list was last cleared; the renderer and audio drain it. */
  events: GameEvent[];
  stats: { kills: number; leaked: number; earned: number; spent: number };
};

const point = {} as LanePoint;

export function createGame(difficulty: Difficulty, seed: number): GameState {
  const settings = DIFFICULTIES[difficulty];
  return {
    difficulty, rng: { seed: seed | 0 }, time: 0, phase: 'playing', endless: false,
    lives: settings.lives, maxLives: settings.lives, money: settings.money,
    wave: 0, countdown: -1, pending: [], waveLeft: [0],
    enemies: [], towers: [], shots: [], puddles: [], marbles: [],
    cooldowns: { footsteps: 0, marbles: 0 }, nextId: 1, events: [],
    stats: { kills: 0, leaked: 0, earned: 0, spent: 0 },
  };
}

/** The wave with this number (1-based): from the campaign table, or generated after it. */
export function waveNumbered(state: GameState, number: number): Wave {
  if (number <= CAMPAIGN_WAVES) return WAVES[number - 1];
  // A side generator keyed on the wave number keeps previews and launches identical.
  const side = { seed: (state.rng.seed ^ Math.imul(number, 0x9e3779b1)) | 0 };
  return endlessWave(number, () => nextRandom(side));
}

export const waveBonus = (number: number) => 40 + number * 6;
/** Buttons paid for calling the next wave before its countdown ends. */
export const earlyBonus = (state: GameState) => (state.countdown > 0 ? Math.floor(state.countdown) * 2 : 0);
export const canCallWave = (state: GameState) => state.phase === 'playing' && (state.endless || state.wave < CAMPAIGN_WAVES);

export function towerRange(tower: Tower): number {
  return TOWERS[tower.kind].levels[tower.level - 1].range * (tower.high ? HIGH_GROUND_RANGE : 1);
}

export type PlaceCheck = { ok: true; y: number; high: boolean; cost: number } | { ok: false; reason: string };

/** Whether a new tower of this kind may stand at (x, z), and at what height. */
export function checkPlacement(state: GameState, map: GameMap, kind: TowerKind, x: number, z: number): PlaceCheck {
  const def = TOWERS[kind];
  const site = siteAt(map, x, z, def.heavy);
  if (!site.ok) return site;
  for (const tower of state.towers) {
    if (Math.abs(tower.y - site.y) < 0.5 && Math.hypot(tower.x - x, tower.z - z) < TOWER_SPACING) return { ok: false, reason: 'Too close to another toy' };
  }
  const cost = def.levels[0].cost;
  if (state.money < cost) return { ok: false, reason: 'Not enough buttons' };
  return { ok: true, y: site.y, high: site.surface !== null, cost };
}

export function placeTower(state: GameState, map: GameMap, kind: TowerKind, x: number, z: number): Tower | null {
  if (state.phase !== 'playing') return null;
  const check = checkPlacement(state, map, kind, x, z);
  if (!check.ok) return null;
  state.money -= check.cost;
  state.stats.spent += check.cost;
  const tower: Tower = {
    id: state.nextId++, kind, level: 1, x, y: check.y, z, high: check.high, mode: 'first', cooldown: 0.3,
    aim: Math.atan2(LANES.east.xs[0] - x, LANES.east.zs[0] - z), targetId: 0, beamTime: 0, stunned: 0,
    invested: check.cost, kills: 0, sinceShot: 9,
  };
  state.towers.push(tower);
  state.events.push({ type: 'build', tower: kind, x, y: check.y, z });
  return tower;
}

export function upgradeCost(tower: Tower): number | null {
  return tower.level >= MAX_LEVEL ? null : TOWERS[tower.kind].levels[tower.level].cost;
}

export function upgradeTower(state: GameState, id: number): boolean {
  const tower = state.towers.find(candidate => candidate.id === id);
  if (!tower || state.phase !== 'playing') return false;
  const cost = upgradeCost(tower);
  if (cost === null || state.money < cost) return false;
  state.money -= cost;
  state.stats.spent += cost;
  tower.invested += cost;
  tower.level += 1;
  state.events.push({ type: 'upgrade', tower: tower.kind, x: tower.x, y: tower.y, z: tower.z });
  return true;
}

export const sellValue = (tower: Tower) => Math.floor(tower.invested * SELL_SHARE);

export function sellTower(state: GameState, id: number): boolean {
  const index = state.towers.findIndex(candidate => candidate.id === id);
  if (index < 0 || state.phase !== 'playing') return false;
  const [tower] = state.towers.splice(index, 1);
  const refund = sellValue(tower);
  state.money += refund;
  state.events.push({ type: 'sell', x: tower.x, y: tower.y, z: tower.z, refund });
  return true;
}

export function setTargetMode(state: GameState, id: number, mode: TargetMode): void {
  const tower = state.towers.find(candidate => candidate.id === id);
  if (tower) tower.mode = mode;
}

/** Launch the next wave now. Calling it before the countdown ends pays a bonus. */
export function callWave(state: GameState): boolean {
  if (!canCallWave(state)) return false;
  const bonus = earlyBonus(state);
  state.money += bonus;
  state.stats.earned += bonus;
  launchWave(state);
  return true;
}

/** Keep playing after the campaign is won. */
export function continueEndless(state: GameState): void {
  if (state.phase !== 'won') return;
  state.phase = 'playing';
  state.endless = true;
  state.countdown = 8;
}

/** Where a marble spill would start for a click at (x, z): the nearest ground lane within reach. */
export function marbleTarget(x: number, z: number): { lane: Lane; distance: number } | null {
  let best: { lane: Lane; distance: number; gap: number } | null = null;
  for (const lane of GROUND_LANES) {
    const nearest = nearestOnLane(lane, x, z);
    if (nearest.gap < 1.8 && (!best || nearest.gap < best.gap)) best = { lane, ...nearest };
  }
  return best;
}

export function useAbility(state: GameState, kind: AbilityKind, x = 0, z = 0): boolean {
  if (state.phase !== 'playing' || state.cooldowns[kind] > 0) return false;
  if (kind === 'footsteps') {
    for (const enemy of state.enemies) enemy.frozen = ENEMIES[enemy.kind].boss ? BOSS_FREEZE_TIME : FREEZE_TIME;
  } else {
    const target = marbleTarget(x, z);
    if (!target) return false;
    state.marbles.push({
      id: state.nextId++, lane: target.lane.id, distance: Math.min(target.lane.length, target.distance + 0.6),
      left: MARBLE_RUN.length, damage: 80 + state.wave * 14, hit: [],
    });
  }
  state.cooldowns[kind] = ABILITIES[kind].cooldown;
  state.events.push({ type: 'ability', kind, x, z });
  return true;
}

function launchWave(state: GameState): void {
  state.wave += 1;
  const wave = waveNumbered(state, state.wave);
  let last = 0;
  let count = 0;
  for (const squad of wave.squads) {
    for (let index = 0; index < squad.count; index += 1) {
      const time = state.time + 0.6 + squad.at + index * squad.gap;
      state.pending.push({ time, kind: squad.kind, tier: squad.tier, lane: squad.lane, wave: state.wave });
      last = Math.max(last, time - state.time);
      count += 1;
    }
  }
  state.pending.sort((a, b) => a.time - b.time);
  state.waveLeft[state.wave] = count;
  state.countdown = !state.endless && state.wave >= CAMPAIGN_WAVES ? -1 : last + 16;
  state.events.push({ type: 'wave', number: state.wave, boss: wave.boss });
}

function spawnEnemy(state: GameState, kind: EnemyKind, tier: Tier, laneId: LaneId, wave: number, distance = 0, child = false): Enemy {
  const def = ENEMIES[kind];
  const settings = DIFFICULTIES[state.difficulty];
  const lane = LANES[def.flying ? 'air' : laneId === 'air' ? 'east' : laneId];
  const maxHealth = Math.round(def.health * TIER_HEALTH[tier] * settings.health * endlessHealth(wave));
  const enemy: Enemy = {
    id: state.nextId++, kind, tier, wave, lane: lane.id, distance,
    lateral: def.radius < 0.2 ? (nextRandom(state.rng) * 2 - 1) * LANE_SPREAD : 0,
    health: maxHealth, maxHealth, speed: def.speed * TIER_SPEED[tier] * settings.speed,
    bounty: Math.max(1, Math.round(def.bounty * TIER_BOUNTY[tier] * settings.bounty * (child ? 0.4 : 1))),
    x: 0, z: 0, dirX: 0, dirZ: 1, altitude: def.flying ? AIR_HEIGHT : 0, flying: def.flying, remaining: lane.length - distance,
    slowFactor: 1, slowTime: 0, haste: 1, frozen: 0, grace: 0, drop: null,
    deployClock: def.deploys ? def.deploys.every * 0.6 : 0, stompClock: def.stomp ? def.stomp.every * 0.5 : 0, flash: 0,
  };
  if (def.drop && !child) {
    const share = def.drop.from + nextRandom(state.rng) * (def.drop.to - def.drop.from);
    startDrop(enemy, lane, LANES.air.xs[0], LANES.air.zs[0], AIR_HEIGHT, share * lane.length, def.drop.airSpeed);
  }
  place(enemy);
  state.enemies.push(enemy);
  if (!child) state.events.push({ type: 'spawn', kind, boss: def.boss });
  return enemy;
}

function startDrop(enemy: Enemy, lane: Lane, fromX: number, fromZ: number, fromAltitude: number, landDistance: number, airSpeed: number): void {
  lanePoint(lane, landDistance, enemy.lateral, point);
  const span = Math.hypot(point.x - fromX, point.z - fromZ, fromAltitude);
  enemy.drop = { fromX, fromZ, fromAltitude, toX: point.x, toZ: point.z, landDistance, t: 0, duration: Math.max(0.8, span / airSpeed) };
  enemy.flying = true;
  enemy.distance = landDistance;
}

/** Refresh an enemy's world position from its lane distance or its descent. */
function place(enemy: Enemy): void {
  const lane = LANES[enemy.lane];
  if (enemy.drop) {
    const drop = enemy.drop;
    const t = drop.t;
    enemy.x = drop.fromX + (drop.toX - drop.fromX) * t;
    enemy.z = drop.fromZ + (drop.toZ - drop.fromZ) * t;
    enemy.altitude = drop.fromAltitude * (1 - t);
    const length = Math.hypot(drop.toX - drop.fromX, drop.toZ - drop.fromZ) || 1;
    enemy.dirX = (drop.toX - drop.fromX) / length;
    enemy.dirZ = (drop.toZ - drop.fromZ) / length;
    enemy.remaining = lane.length - drop.landDistance + (1 - t) * length;
    return;
  }
  const remaining = lane.length - enemy.distance;
  // Columns close up as they reach the fort door.
  lanePoint(lane, enemy.distance, enemy.lateral * Math.min(1, remaining / 1.5), point);
  enemy.x = point.x;
  enemy.z = point.z;
  enemy.dirX = point.dirX;
  enemy.dirZ = point.dirZ;
  enemy.remaining = remaining;
}

function damage(state: GameState, enemy: Enemy, amount: number, armorPierce: number, towerId: number): void {
  if (enemy.health <= 0 || enemy.grace > 0) return;
  const def = ENEMIES[enemy.kind];
  enemy.health -= amount * (1 - def.armor * (1 - armorPierce));
  enemy.flash = 0.12;
  if (enemy.health > 0) return;
  state.money += enemy.bounty;
  state.stats.earned += enemy.bounty;
  state.stats.kills += 1;
  const tower = towerId ? state.towers.find(candidate => candidate.id === towerId) : undefined;
  if (tower) tower.kills += 1;
  state.events.push({ type: 'die', kind: enemy.kind, tier: enemy.tier, x: enemy.x, z: enemy.z, altitude: enemy.altitude, bounty: enemy.bounty, boss: def.boss });
  if (def.cargo && !enemy.drop) {
    for (let index = 0; index < def.cargo.count; index += 1) {
      const child = spawnEnemy(state, def.cargo.kind, enemy.tier, enemy.lane, enemy.wave, Math.max(0, enemy.distance - index * 0.28), true);
      child.frozen = 0.35;
      child.grace = 0.3;
      state.waveLeft[enemy.wave] += 1;
    }
  }
}

function inReach(tower: Tower, enemy: Enemy, range: number, minRange: number, hitsAir: boolean): number {
  if (enemy.health <= 0 || (enemy.flying && !hitsAir)) return -1;
  const gap = Math.hypot(enemy.x - tower.x, enemy.z - tower.z);
  return gap <= range + ENEMIES[enemy.kind].radius * 0.5 && gap >= minRange ? gap : -1;
}

function pickTarget(state: GameState, tower: Tower, range: number, minRange: number, hitsAir: boolean, skip?: (enemy: Enemy) => boolean): Enemy | null {
  let best: Enemy | null = null;
  let bestScore = Infinity;
  for (const enemy of state.enemies) {
    const gap = inReach(tower, enemy, range, minRange, hitsAir);
    if (gap < 0 || skip?.(enemy)) continue;
    const score = tower.mode === 'first' ? enemy.remaining
      : tower.mode === 'last' ? -enemy.remaining
      : tower.mode === 'strong' ? -enemy.health
      : gap;
    if (score < bestScore) {
      bestScore = score;
      best = enemy;
    }
  }
  return best;
}

/** Where a walking enemy will be after `seconds`, for lobbed shots. */
function lead(enemy: Enemy, seconds: number): { x: number; z: number } {
  if (enemy.drop || enemy.frozen > seconds) return { x: enemy.x, z: enemy.z };
  const lane = LANES[enemy.lane];
  lanePoint(lane, Math.min(lane.length, enemy.distance + enemy.speed * enemy.slowFactor * enemy.haste * seconds), enemy.lateral, point);
  return { x: point.x, z: point.z };
}

const MUZZLE_HEIGHT = 0.75;

function stepTower(state: GameState, tower: Tower, dt: number): void {
  const def = TOWERS[tower.kind];
  const level = def.levels[tower.level - 1];
  tower.sinceShot += dt;
  if (tower.stunned > 0) {
    tower.stunned -= dt;
    tower.targetId = 0;
    tower.beamTime = 0;
    return;
  }
  const range = towerRange(tower);
  tower.cooldown -= dt;

  if (def.attack === 'beam') {
    let target = tower.targetId ? state.enemies.find(enemy => enemy.id === tower.targetId) : undefined;
    if (!target || inReach(tower, target, range, 0, true) < 0) {
      target = pickTarget(state, tower, range, 0, true) ?? undefined;
      tower.beamTime = 0;
      if (target) state.events.push({ type: 'fire', tower: tower.kind, x: tower.x, y: tower.y + MUZZLE_HEIGHT, z: tower.z });
    }
    tower.targetId = target?.id ?? 0;
    if (!target) return;
    tower.aim = Math.atan2(target.x - tower.x, target.z - tower.z);
    tower.beamTime += dt;
    tower.sinceShot = 0;
    const ramp = level.ramp!;
    const power = 1 + (ramp.factor - 1) * Math.min(1, tower.beamTime / ramp.time);
    damage(state, target, level.damage * power * dt, def.armorPierce, tower.id);
    return;
  }

  if (tower.cooldown > 0) return;
  const inPuddle = (enemy: Enemy) => state.puddles.some(puddle => puddle.duration - puddle.time > 1.2 && Math.hypot(puddle.x - enemy.x, puddle.z - enemy.z) < puddle.radius * 0.7);
  const target = pickTarget(state, tower, range, def.minRange, def.hitsAir, def.attack === 'puddle' ? inPuddle : undefined);
  tower.targetId = target?.id ?? 0;
  if (!target) return;
  tower.cooldown = level.cooldown;
  tower.sinceShot = 0;
  tower.aim = Math.atan2(target.x - tower.x, target.z - tower.z);
  const y = tower.y + MUZZLE_HEIGHT;
  const id = state.nextId++;
  state.events.push({ type: 'fire', tower: tower.kind, x: tower.x, y, z: tower.z });
  if (def.attack === 'homing') {
    state.shots.push({
      id, type: 'homing', kind: tower.kind, x: tower.x, y, z: tower.z, targetId: target.id,
      tx: target.x, ty: FLOOR_Y + target.altitude + 0.25, tz: target.z, speed: def.shot, damage: level.damage, towerId: tower.id,
    });
  } else if (def.attack === 'lob' || def.attack === 'puddle') {
    const aim = lead(target, def.shot);
    tower.aim = Math.atan2(aim.x - tower.x, aim.z - tower.z);
    state.shots.push({
      id, type: 'lob', kind: tower.kind, x: tower.x, y, z: tower.z, fromX: tower.x, fromY: y, fromZ: tower.z,
      toX: aim.x, toZ: aim.z, t: 0, duration: def.shot, damage: level.damage, splash: level.splash ?? 0, slow: level.slow ?? null, towerId: tower.id,
    });
  } else {
    const gap = Math.hypot(target.x - tower.x, target.z - tower.z) || 1;
    const aim = lead(target, gap / def.shot);
    const length = Math.hypot(aim.x - tower.x, aim.z - tower.z) || 1;
    tower.aim = Math.atan2(aim.x - tower.x, aim.z - tower.z);
    state.shots.push({
      id, type: 'bolt', kind: tower.kind, x: tower.x, y, z: tower.z, dirX: (aim.x - tower.x) / length, dirZ: (aim.z - tower.z) / length,
      left: range * 1.15, speed: def.shot, damage: level.damage, pierce: level.pierce ?? 1, hit: [], towerId: tower.id,
    });
  }
}

/** Advance a shot; returns false when it is spent. */
function stepShot(state: GameState, shot: Shot, dt: number): boolean {
  const def = TOWERS[shot.kind];
  if (shot.type === 'homing') {
    const target = state.enemies.find(enemy => enemy.id === shot.targetId && enemy.health > 0);
    if (target) {
      shot.tx = target.x;
      shot.ty = FLOOR_Y + target.altitude + 0.25;
      shot.tz = target.z;
    }
    const dx = shot.tx - shot.x;
    const dy = shot.ty - shot.y;
    const dz = shot.tz - shot.z;
    const gap = Math.hypot(dx, dy, dz);
    const travel = shot.speed * dt;
    if (gap <= travel + 0.05) {
      if (target) {
        damage(state, target, shot.damage, def.armorPierce, shot.towerId);
        state.events.push({ type: 'hit', tower: shot.kind, x: shot.tx, y: shot.ty, z: shot.tz });
      }
      return false;
    }
    shot.x += (dx / gap) * travel;
    shot.y += (dy / gap) * travel;
    shot.z += (dz / gap) * travel;
    return true;
  }
  if (shot.type === 'lob') {
    shot.t += dt / shot.duration;
    const t = Math.min(1, shot.t);
    shot.x = shot.fromX + (shot.toX - shot.fromX) * t;
    shot.z = shot.fromZ + (shot.toZ - shot.fromZ) * t;
    const span = Math.hypot(shot.toX - shot.fromX, shot.toZ - shot.fromZ);
    shot.y = shot.fromY + (FLOOR_Y + 0.08 - shot.fromY) * t + Math.sin(t * Math.PI) * (1.2 + span * 0.28);
    if (t < 1) return true;
    if (shot.slow) {
      state.puddles.push({ id: state.nextId++, x: shot.toX, z: shot.toZ, radius: shot.slow.radius, factor: shot.slow.factor, time: 0, duration: shot.slow.duration });
      state.events.push({ type: 'puddle', x: shot.toX, z: shot.toZ, radius: shot.slow.radius });
    } else {
      for (const enemy of state.enemies) {
        if (enemy.flying) continue;
        const gap = Math.hypot(enemy.x - shot.toX, enemy.z - shot.toZ) - ENEMIES[enemy.kind].radius * 0.5;
        if (gap > shot.splash) continue;
        // Full damage in the inner half of the burst, fading to 40% at its edge.
        const share = gap <= shot.splash * 0.5 ? 1 : 1 - 0.6 * ((gap - shot.splash * 0.5) / (shot.splash * 0.5));
        damage(state, enemy, shot.damage * share, def.armorPierce, shot.towerId);
      }
      state.events.push({ type: 'burst', x: shot.toX, z: shot.toZ, radius: shot.splash });
    }
    return false;
  }
  const travel = Math.min(shot.left, shot.speed * dt);
  const fromX = shot.x;
  const fromZ = shot.z;
  shot.x += shot.dirX * travel;
  shot.z += shot.dirZ * travel;
  shot.left -= travel;
  for (const enemy of state.enemies) {
    if (enemy.health <= 0 || shot.hit.includes(enemy.id)) continue;
    // Distance from the enemy to the segment travelled this step.
    const along = Math.max(0, Math.min(travel, (enemy.x - fromX) * shot.dirX + (enemy.z - fromZ) * shot.dirZ));
    const gap = Math.hypot(enemy.x - (fromX + shot.dirX * along), enemy.z - (fromZ + shot.dirZ * along));
    if (gap > ENEMIES[enemy.kind].radius + 0.2) continue;
    damage(state, enemy, shot.damage * 0.88 ** shot.hit.length, def.armorPierce, shot.towerId);
    state.events.push({ type: 'hit', tower: shot.kind, x: enemy.x, y: FLOOR_Y + enemy.altitude + 0.25, z: enemy.z });
    shot.hit.push(enemy.id);
    if (shot.hit.length >= shot.pierce) return false;
  }
  return shot.left > 0;
}

function stepEnemy(state: GameState, enemy: Enemy, def: EnemyDef, dt: number): void {
  if (enemy.flash > 0) enemy.flash -= dt;
  if (enemy.grace > 0) enemy.grace -= dt;
  if (enemy.slowTime > 0) {
    enemy.slowTime -= dt;
    if (enemy.slowTime <= 0) enemy.slowFactor = 1;
  }
  if (enemy.frozen > 0) {
    enemy.frozen -= dt;
    return;
  }
  if (enemy.drop) {
    enemy.drop.t += dt / enemy.drop.duration;
    if (enemy.drop.t >= 1) {
      enemy.drop = null;
      enemy.flying = false;
      enemy.altitude = 0;
      state.events.push({ type: 'land', x: enemy.x, z: enemy.z });
    }
    place(enemy);
    return;
  }
  enemy.distance += enemy.speed * enemy.slowFactor * enemy.haste * dt;
  place(enemy);
  if (def.deploys) {
    enemy.deployClock -= dt;
    if (enemy.deployClock <= 0 && enemy.remaining > 3) {
      enemy.deployClock = def.deploys.every;
      for (let index = 0; index < def.deploys.count; index += 1) {
        const child = spawnEnemy(state, def.deploys.kind, def.deploys.tier, 'east', enemy.wave, 0, true);
        state.waveLeft[enemy.wave] += 1;
        if (def.flying) {
          // Dropped from the aircraft onto the nearest stretch of the veranda route.
          const landing = nearestOnLane(LANES.east, enemy.x, enemy.z);
          child.lane = 'east';
          startDrop(child, LANES.east, enemy.x, enemy.z, enemy.altitude, Math.max(0, landing.distance - index * 0.3), 3);
          child.drop!.duration = 1.1 + index * 0.15;
        } else {
          child.lane = enemy.lane;
          child.distance = Math.max(0, enemy.distance - 0.7 - index * 0.3);
        }
        place(child);
      }
    }
  }
  if (def.stomp) {
    enemy.stompClock -= dt;
    if (enemy.stompClock <= 0) {
      enemy.stompClock = def.stomp.every;
      let jammed = false;
      for (const tower of state.towers) {
        if (Math.hypot(tower.x - enemy.x, tower.z - enemy.z) > def.stomp.radius) continue;
        tower.stunned = def.stomp.duration;
        jammed = true;
      }
      if (jammed) state.events.push({ type: 'stomp', x: enemy.x, z: enemy.z, radius: def.stomp.radius });
    }
  }
}

/** Advance the game by one fixed step. */
export function stepGame(state: GameState, dt = STEP): void {
  if (state.phase !== 'playing') return;
  state.time += dt;
  for (const kind of ['footsteps', 'marbles'] as const) state.cooldowns[kind] = Math.max(0, state.cooldowns[kind] - dt);

  while (state.pending.length && state.pending[0].time <= state.time) {
    const next = state.pending.shift()!;
    spawnEnemy(state, next.kind, next.tier, next.lane, next.wave);
  }

  // Auras and glue are recomputed from scratch every step.
  for (const enemy of state.enemies) enemy.haste = 1;
  for (const source of state.enemies) {
    const def = ENEMIES[source.kind];
    if ((!def.heal && !def.haste) || source.drop) continue;
    for (const other of state.enemies) {
      if (other === source || other.health <= 0) continue;
      const gap = Math.hypot(other.x - source.x, other.z - source.z);
      if (def.haste && gap <= def.haste.radius && !ENEMIES[other.kind].boss) other.haste = Math.max(other.haste, def.haste.factor);
      if (def.heal && gap <= def.heal.radius && !ENEMIES[other.kind].boss && !ENEMIES[other.kind].heal) {
        other.health = Math.min(other.maxHealth, other.health + other.maxHealth * def.heal.perSecond * dt);
      }
    }
  }
  for (let index = state.puddles.length - 1; index >= 0; index -= 1) {
    const puddle = state.puddles[index];
    puddle.time += dt;
    if (puddle.time >= puddle.duration) {
      state.puddles.splice(index, 1);
      continue;
    }
    for (const enemy of state.enemies) {
      if (enemy.flying || Math.hypot(enemy.x - puddle.x, enemy.z - puddle.z) > puddle.radius) continue;
      const factor = ENEMIES[enemy.kind].boss ? 1 - (1 - puddle.factor) * 0.5 : puddle.factor;
      enemy.slowFactor = Math.min(enemy.slowFactor, factor);
      enemy.slowTime = 0.5;
    }
  }

  for (let index = state.marbles.length - 1; index >= 0; index -= 1) {
    const run = state.marbles[index];
    const travel = Math.min(run.left, MARBLE_RUN.speed * dt);
    run.distance -= travel;
    run.left -= travel;
    for (const enemy of state.enemies) {
      if (enemy.lane !== run.lane || enemy.flying || enemy.health <= 0 || run.hit.includes(enemy.id)) continue;
      if (Math.abs(enemy.distance - run.distance) > MARBLE_RUN.reach) continue;
      run.hit.push(enemy.id);
      if (!ENEMIES[enemy.kind].boss) enemy.distance = Math.max(0, enemy.distance - MARBLE_RUN.push);
      damage(state, enemy, run.damage, MARBLE_RUN.pierce, 0);
    }
    if (run.left <= 0 || run.distance <= 0) state.marbles.splice(index, 1);
  }

  // Index loop: enemies released during the step (cargo, deployments) are appended and stepped next time.
  const walking = state.enemies.length;
  for (let index = 0; index < walking; index += 1) {
    const enemy = state.enemies[index];
    if (enemy.health > 0) stepEnemy(state, enemy, ENEMIES[enemy.kind], dt);
  }
  for (const tower of state.towers) stepTower(state, tower, dt);
  for (let index = state.shots.length - 1; index >= 0; index -= 1) {
    if (!stepShot(state, state.shots[index], dt)) state.shots.splice(index, 1);
  }

  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = state.enemies[index];
    const leaked = enemy.health > 0 && !enemy.drop && enemy.remaining <= 0.05;
    if (enemy.health > 0 && !leaked) continue;
    state.enemies.splice(index, 1);
    if (leaked) {
      const lives = ENEMIES[enemy.kind].lives;
      state.lives = Math.max(0, state.lives - lives);
      state.stats.leaked += 1;
      state.events.push({ type: 'leak', kind: enemy.kind, lives });
    }
    state.waveLeft[enemy.wave] -= 1;
    if (state.waveLeft[enemy.wave] === 0 && !state.pending.some(pending => pending.wave === enemy.wave)) {
      const bonus = waveBonus(enemy.wave);
      state.money += bonus;
      state.stats.earned += bonus;
      state.events.push({ type: 'waveClear', number: enemy.wave, bonus });
    }
  }

  if (state.lives <= 0) {
    state.phase = 'lost';
    state.events.push({ type: 'lost' });
    return;
  }
  const quiet = state.pending.length === 0 && state.enemies.length === 0;
  if (state.wave > 0 && quiet && !state.endless && state.wave >= CAMPAIGN_WAVES) {
    state.phase = 'won';
    state.events.push({ type: 'won' });
    return;
  }
  if (state.countdown > 0) {
    // Nothing left on the floor: do not make the player wait out the full timer.
    if (quiet && state.countdown > 6) state.countdown = 6;
    state.countdown -= dt;
    if (state.countdown <= 0) launchWave(state);
  }
}

/** Stars for a finished campaign, by cushions kept. */
export function starsFor(state: GameState): number {
  if (state.phase === 'lost') return 0;
  const share = state.lives / state.maxLives;
  return share >= 0.9 ? 3 : share >= 0.5 ? 2 : 1;
}

/** A compact fingerprint of the state, for replay tests. */
export function stateHash(state: GameState): string {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash ^= Math.round(value * 1000) | 0;
    hash = Math.imul(hash, 16777619);
  };
  mix(state.time);
  mix(state.money);
  mix(state.lives);
  mix(state.wave);
  for (const enemy of state.enemies) {
    mix(enemy.id);
    mix(enemy.x);
    mix(enemy.z);
    mix(enemy.health);
  }
  for (const tower of state.towers) {
    mix(tower.id);
    mix(tower.cooldown);
    mix(tower.kills);
  }
  mix(state.shots.length);
  return (hash >>> 0).toString(16);
}
