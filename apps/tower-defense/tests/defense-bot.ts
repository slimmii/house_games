// A simple scripted player for balance tests: it builds at the spots that cover the
// most route, upgrades as it can afford to, and calls the next wave when the floor is clear.
import { readFileSync } from 'node:fs';
import { decodeGrid, type GridFile } from '../src/sim/grid';
import { GROUND_LANES, LANES, createMap, siteAt, type GameMap } from '../src/sim/map';
import {
  STEP, callWave, checkPlacement, createGame, placeTower, stepGame, upgradeCost, upgradeTower, useAbility,
  type Difficulty, type GameState,
} from '../src/sim/sim';
import { TOWERS, type TowerKind } from '../src/sim/towers';

export function loadMap(): GameMap {
  const file = JSON.parse(readFileSync(new URL('../src/sim/grid.generated.json', import.meta.url), 'utf8')) as GridFile;
  return createMap(decodeGrid(file));
}

type Spot = { x: number; z: number; score: number; heavy: boolean };

/** Buildable points ranked by how much route lies within `reach`, later stretches counting more. */
function rankSpots(map: GameMap, reach: number, heavy: boolean): Spot[] {
  const spots: Spot[] = [];
  for (let x = 1; x < 21; x += 0.45) {
    for (let z = -32; z < -0.5; z += 0.45) {
      if (!siteAt(map, x, z, heavy).ok) continue;
      let score = 0;
      for (const lane of GROUND_LANES) {
        for (let index = 0; index < lane.xs.length; index += 3) {
          // The stairs route is short, so cover of it is worth more.
          if (Math.hypot(lane.xs[index] - x, lane.zs[index] - z) <= reach) score += (0.6 + index / lane.xs.length) * (lane.id === 'west' ? 1.5 : 1);
        }
      }
      // Light toys can shoot aircraft, so their spots also count the flight path.
      if (!heavy) {
        for (let index = 0; index < LANES.air.xs.length; index += 3) {
          if (Math.hypot(LANES.air.xs[index] - x, LANES.air.zs[index] - z) <= reach) score += 0.5;
        }
      }
      if (score > 0) spots.push({ x, z, score, heavy });
    }
  }
  return spots.sort((a, b) => b.score - a.score);
}

export type BotStyle = {
  /** Kinds to build, in a repeating order. */
  build: readonly TowerKind[];
  /** Upgrade existing towers before building beyond this many. */
  towersBeforeUpgrades: number;
  maxTowers: number;
  abilities: boolean;
};

export const SMART_BOT: BotStyle = {
  build: ['popgun', 'popgun', 'dart', 'glue', 'mortar', 'popgun', 'ballista', 'dart', 'mortar', 'robot', 'glue', 'ballista', 'robot'],
  towersBeforeUpgrades: 5, maxTowers: 34, abilities: true,
};
/** Builds only the starter tower and never upgrades: should not get far. */
export const LAZY_BOT: BotStyle = { build: ['popgun'], towersBeforeUpgrades: 99, maxTowers: 12, abilities: false };

export type BotResult = { phase: GameState['phase']; wave: number; lives: number; towers: number; time: number; hash?: string; log: string[] };

export function playCampaign(map: GameMap, difficulty: Difficulty, style: BotStyle, seed = 7, maxWave = 30): { state: GameState; result: BotResult } {
  const state = createGame(difficulty, seed);
  const light = rankSpots(map, 3.1, false);
  const heavy = rankSpots(map, 4.6, true);
  let buildIndex = 0;
  let nextThink = 0;
  const log: string[] = [];
  let lastWave = 0;
  const maxTime = 60 * 80;
  while (state.phase === 'playing' && state.time < maxTime) {
    if (state.time >= nextThink) {
      nextThink = state.time + 0.5;
      const quiet = state.pending.length === 0 && state.enemies.length === 0;
      if (state.wave < maxWave && (state.wave === 0 || quiet)) callWave(state);
      if (state.wave !== lastWave) {
        lastWave = state.wave;
        log.push(`wave ${state.wave}: lives ${state.lives}, money ${state.money}, towers ${state.towers.length}`);
      }
      if (style.abilities) {
        if (state.enemies.length > 14 && state.cooldowns.footsteps <= 0) useAbility(state, 'footsteps');
        const front = state.enemies.find(enemy => !enemy.flying && enemy.remaining < 14 && enemy.remaining > 2);
        if (front && state.cooldowns.marbles <= 0) useAbility(state, 'marbles', front.x, front.z);
      }
      // Spend: one action per think, so money builds up for dearer toys.
      const wantsUpgrade = state.towers.length >= style.towersBeforeUpgrades;
      const upgradable = state.towers.filter(tower => upgradeCost(tower) !== null).sort((a, b) => upgradeCost(a)! - upgradeCost(b)!)[0];
      const kind = style.build[buildIndex % style.build.length];
      const buildCost = TOWERS[kind].levels[0].cost;
      const canBuild = state.towers.length < style.maxTowers;
      const upgradePrice = wantsUpgrade && upgradable ? upgradeCost(upgradable)! : Infinity;
      const buildPrice = canBuild ? buildCost : Infinity;
      // Take whichever is affordable, preferring the cheaper; never sit on buttons waiting for a dear upgrade.
      if (upgradePrice <= state.money && (upgradePrice <= buildPrice || buildPrice > state.money)) {
        upgradeTower(state, upgradable!.id);
      } else if (buildPrice <= state.money) {
        const spots = TOWERS[kind].heavy ? heavy : light;
        const spot = spots.find(candidate => checkPlacement(state, map, kind, candidate.x, candidate.z).ok);
        if (spot && placeTower(state, map, kind, spot.x, spot.z)) buildIndex += 1;
      }
    }
    stepGame(state, STEP);
    state.events.length = 0;
    if (state.wave >= maxWave && state.pending.length === 0 && state.enemies.length === 0) break;
  }
  return { state, result: { phase: state.phase, wave: state.wave, lives: state.lives, towers: state.towers.length, time: Math.round(state.time), log } };
}

// `node --import tsx tests/defense-bot.ts [difficulty]` prints a campaign log for tuning.
if (import.meta.url === `file://${process.argv[1]}`) {
  const map = loadMap();
  for (const difficulty of (process.argv[2] ? [process.argv[2]] : ['easy', 'normal', 'hard']) as Difficulty[]) {
    for (const [name, style] of [['smart', SMART_BOT], ['lazy', LAZY_BOT]] as const) {
      const started = performance.now();
      const { result } = playCampaign(map, difficulty, style);
      console.log(`${difficulty} ${name}: ${result.phase} at wave ${result.wave}, lives ${result.lives}, towers ${result.towers}, ${result.time}s game time, ${(performance.now() - started).toFixed(0)} ms`);
      if (process.argv.includes('--log')) console.log(result.log.join('\n'));
    }
  }
}
