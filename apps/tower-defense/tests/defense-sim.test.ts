import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES } from '../src/sim/enemies';
import { FLOOR_Y } from '../src/sim/grid';
import { LANES } from '../src/sim/map';
import {
  DIFFICULTIES, STEP, callWave, checkPlacement, continueEndless, createGame, earlyBonus, placeTower, sellTower, sellValue,
  stateHash, stepGame, towerRange, upgradeTower, useAbility, waveNumbered, type GameState,
} from '../src/sim/sim';
import { TOWERS, TOWER_KINDS, investedIn } from '../src/sim/towers';
import { CAMPAIGN_WAVES, WAVES, WEST_LANE_WAVE } from '../src/sim/waves';
import { LAZY_BOT, SMART_BOT, loadMap, playCampaign } from './defense-bot';

const map = loadMap();
/** Open floor beside the east lane where it crosses the room. */
const SPOT = { x: 14.6, z: -14 };

function advance(state: GameState, seconds: number): void {
  for (let step = 0; step < Math.round(seconds / STEP); step += 1) stepGame(state, STEP);
}

test('a game replays identically from the same seed and commands', () => {
  const run = () => {
    const state = createGame('normal', 42);
    placeTower(state, map, 'popgun', SPOT.x, SPOT.z);
    callWave(state);
    advance(state, 45);
    return stateHash(state);
  };
  assert.equal(run(), run());
});

test('nothing happens until the first wave is called, then soldiers march and leak', () => {
  const state = createGame('normal', 1);
  advance(state, 30);
  assert.equal(state.wave, 0);
  assert.equal(state.enemies.length, 0);
  assert.equal(callWave(state), true);
  advance(state, 5);
  assert.ok(state.enemies.length > 0);
  assert.ok(state.enemies.every(enemy => enemy.lane === 'east'));
  // Undefended, the whole first wave walks in (the second is launched but still on its way).
  advance(state, 52);
  assert.equal(state.lives, DIFFICULTIES.normal.lives - WAVES[0].squads[0].count);
});

test('towers cost buttons, obey placement rules, upgrade and sell', () => {
  const state = createGame('normal', 1);
  const before = state.money;
  const tower = placeTower(state, map, 'popgun', SPOT.x, SPOT.z);
  assert.ok(tower);
  assert.equal(state.money, before - TOWERS.popgun.levels[0].cost);
  assert.equal(checkPlacement(state, map, 'dart', SPOT.x + 0.4, SPOT.z).ok, false, 'overlapping another toy');
  assert.equal(placeTower(state, map, 'robot', SPOT.x + 2, SPOT.z), null, 'cannot afford a robot yet');
  state.money = 5000;
  assert.equal(upgradeTower(state, tower.id), true);
  assert.equal(upgradeTower(state, tower.id), true);
  assert.equal(upgradeTower(state, tower.id), false, 'already at the top level');
  assert.equal(tower.invested, investedIn('popgun', 3));
  const refund = sellValue(tower);
  const money = state.money;
  assert.equal(sellTower(state, tower.id), true);
  assert.equal(state.money, money + refund);
  assert.equal(state.towers.length, 0);
});

test('furniture gives range, and heavy toys stay on the floor', () => {
  const state = createGame('easy', 1);
  state.money = 5000;
  const floor = placeTower(state, map, 'popgun', SPOT.x, SPOT.z)!;
  const table = placeTower(state, map, 'popgun', 14.3, -4.1)!;
  assert.ok(table.high && table.y > FLOOR_Y);
  assert.ok(towerRange(table) > towerRange(floor));
  assert.equal(placeTower(state, map, 'mortar', 14.3, -3.0), null);
});

test('every tower kind can beat the soldiers it is meant for', () => {
  for (const kind of TOWER_KINDS) {
    if (kind === 'glue') continue;
    const state = createGame('normal', 3);
    state.money = 5000;
    assert.ok(placeTower(state, map, kind, SPOT.x, SPOT.z), kind);
    assert.ok(placeTower(state, map, kind, SPOT.x + 1.2, SPOT.z), kind);
    callWave(state);
    advance(state, 70);
    assert.ok(state.stats.kills > 0, `${kind} beat nobody`);
  }
});

test('glue slows walkers but not aircraft, and marbles cannot hit aircraft', () => {
  const state = createGame('normal', 3);
  state.money = 5000;
  placeTower(state, map, 'glue', SPOT.x, SPOT.z);
  callWave(state);
  let slowed = false;
  for (let step = 0; step < 60 * 60 && !slowed; step += 1) {
    stepGame(state, STEP);
    slowed = state.enemies.some(enemy => enemy.slowFactor < 1);
  }
  assert.ok(slowed);

  const air = createGame('normal', 3);
  air.money = 5000;
  // Along the air lane, far from both ground lanes' starts.
  assert.ok(placeTower(air, map, 'mortar', 14.6, -14.2));
  air.wave = 7;
  callWave(air); // wave 8: helicopters and shield bearers
  advance(air, 40);
  assert.equal(air.events.filter(event => event.type === 'die' && event.kind === 'helicopter').length, 0);
});

test('calling a wave early pays a bonus and the west route opens later', () => {
  const state = createGame('normal', 5);
  callWave(state);
  advance(state, 1);
  assert.ok(earlyBonus(state) > 0);
  const money = state.money;
  const bonus = earlyBonus(state);
  callWave(state);
  assert.equal(state.money, money + bonus);
  assert.equal(state.wave, 2);
  for (let number = 1; number < WEST_LANE_WAVE; number += 1) {
    assert.ok(WAVES[number - 1].squads.every(squad => squad.lane !== 'west'), `wave ${number} uses the stairs too early`);
  }
  assert.ok(WAVES[WEST_LANE_WAVE - 1].squads.some(squad => squad.lane === 'west'));
});

test('abilities: footsteps freezes soldiers, marbles need a route and both cool down', () => {
  const state = createGame('normal', 9);
  callWave(state);
  advance(state, 8);
  const positions = state.enemies.map(enemy => enemy.distance);
  assert.equal(useAbility(state, 'footsteps'), true);
  advance(state, 2);
  assert.deepEqual(state.enemies.slice(0, positions.length).map(enemy => enemy.distance), positions);
  assert.equal(useAbility(state, 'footsteps'), false, 'cooling down');
  assert.equal(useAbility(state, 'marbles', 3, -27), false, 'no route near the kitchen');
  const target = state.enemies[0];
  const health = target.health;
  assert.equal(useAbility(state, 'marbles', target.x, target.z), true);
  advance(state, 6);
  assert.ok(!state.enemies.includes(target) || target.health < health);
});

test('paratroopers land on the veranda route and jeeps release their riflemen', () => {
  const state = createGame('normal', 11);
  state.wave = 10;
  callWave(state); // wave 11: tan riflemen and paratroopers
  advance(state, 9);
  const airborne = state.enemies.filter(enemy => enemy.kind === 'paratrooper' && enemy.drop);
  assert.ok(airborne.length > 0 && airborne.every(enemy => enemy.flying && enemy.altitude > 0));
  advance(state, 12);
  const landed = state.enemies.filter(enemy => enemy.kind === 'paratrooper' && !enemy.drop);
  assert.ok(landed.length > 0 && landed.every(enemy => !enemy.flying && enemy.altitude === 0 && enemy.distance > LANES.east.length * 0.4));

  const jeeps = createGame('normal', 11);
  jeeps.money = 9000;
  for (const x of [13.6, 14.8, 16]) placeTower(jeeps, map, 'ballista', x, SPOT.z);
  for (const tower of jeeps.towers) tower.level = 3;
  jeeps.wave = 8;
  callWave(jeeps); // wave 9 opens with jeeps
  let released = 0;
  for (let step = 0; step < 60 * 60; step += 1) {
    stepGame(jeeps, STEP);
    if (jeeps.events.some(event => event.type === 'die' && event.kind === 'jeep')) released = jeeps.enemies.filter(enemy => enemy.frozen > 0).length;
    if (released) break;
    jeeps.events.length = 0;
  }
  assert.equal(released, ENEMIES.jeep.cargo!.count);
});

test('the campaign table is complete and endless waves keep growing', () => {
  assert.equal(WAVES.length, CAMPAIGN_WAVES);
  assert.ok(WAVES[9].boss && WAVES[19].boss && WAVES[29].boss);
  const state = createGame('normal', 2);
  const strength = (number: number) => waveNumbered(state, number).squads.reduce((total, squad) => total + squad.count * ENEMIES[squad.kind].health, 0);
  assert.deepEqual(waveNumbered(state, 33), waveNumbered(state, 33), 'previews match launches');
  assert.ok(strength(40) > strength(32));
});

test('balance: a sensible player wins, a careless one does not', { timeout: 120_000 }, () => {
  const easy = playCampaign(map, 'easy', SMART_BOT).result;
  assert.equal(easy.phase, 'won', `easy: ${JSON.stringify(easy)}`);
  assert.ok(easy.lives >= DIFFICULTIES.easy.lives * 0.6, 'easy should be forgiving');
  const normal = playCampaign(map, 'normal', SMART_BOT).result;
  assert.equal(normal.phase, 'won', `normal: ${JSON.stringify({ ...normal, log: undefined })}`);
  const hard = playCampaign(map, 'hard', SMART_BOT).result;
  // The bot plays one fixed plan; it should at least get past the first boss on the hardest level.
  assert.ok(hard.wave >= 11, `hard should not be a wall, got wave ${hard.wave}`);
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const lazy = playCampaign(map, difficulty, LAZY_BOT).result;
    assert.equal(lazy.phase, 'lost', `${difficulty}: starter towers alone should not win`);
    assert.ok(lazy.wave >= 6, `${difficulty}: the opening waves should be gentle, lost at ${lazy.wave}`);
  }
});

test('after a win the player can continue into endless waves', () => {
  const { state } = playCampaign(map, 'easy', SMART_BOT);
  assert.equal(state.phase, 'won');
  continueEndless(state);
  assert.equal(state.phase, 'playing');
  advance(state, 12);
  assert.equal(state.wave, CAMPAIGN_WAVES + 1);
  assert.ok(state.pending.length + state.enemies.length > 0);
});
