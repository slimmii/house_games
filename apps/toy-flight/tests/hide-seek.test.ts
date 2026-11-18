import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSimulation } from '../src/server/simulation.js';
import { HIDE_TIME_LIMIT, HideSeekRules, canRespawn, isFrozen, remainingHiders, roleOf } from '../src/shared/hideSeek.js';
import { sweepWorld } from '@huis/house/shared/collision';
import { HOUSE_BOUNDS } from '@huis/house/shared/world';
import { NEUTRAL_CONTROLS, applySnapshotUpdate, type Vec3 } from '../src/shared/protocol.js';

const dt = 1 / 60;
function advance(game: GameSimulation, seconds: number) { for (let i = 0; i < Math.ceil(seconds / dt); i++) game.update(dt); }

function clearShot(): Vec3 {
  for (let x = HOUSE_BOUNDS.min.x + 2; x < HOUSE_BOUNDS.max.x - 2; x++) for (let z = HOUSE_BOUNDS.min.z + 2; z < HOUSE_BOUNDS.max.z - 3; z++) {
    const point = { x, y: 3, z }; if (!sweepWorld(point, { x, y: 3, z: z + 2 }, .3) && sweepWorld(point, { ...point, z: HOUSE_BOUNDS.max.z + 2 }, .22)) return point;
  }
  throw new Error('No clear flight corridor');
}

test('a round needs two loaded pilots and picks one seeker', () => {
  const rules = new HideSeekRules('hideSeek', () => .99);
  rules.markLoaded('a', ['a']);
  assert.equal(rules.start(['a'], 0), false, 'one pilot cannot play');
  assert.equal(rules.start(['a', 'b'], 0), false, 'b is still loading');
  rules.markLoaded('b', ['a', 'b']);
  assert.equal(rules.start(['a', 'b'], 0), true);
  assert.equal(rules.status.phase, 'hiding');
  assert.equal(rules.status.seekerId, 'b');
  assert.deepEqual(rules.status.hiders, ['a']);
  assert.equal(roleOf(rules.status, 'b'), 'seeker');
  assert.equal(roleOf(rules.status, 'a'), 'hider');
  assert.equal(isFrozen(rules.status, 'b'), true);
  assert.equal(isFrozen(rules.status, 'a'), false);
});

test('free play rooms never start rounds', () => {
  const rules = new HideSeekRules('free');
  rules.markLoaded('a', ['a', 'b']); rules.markLoaded('b', ['a', 'b']);
  assert.equal(rules.start(['a', 'b'], 0), false);
  assert.equal(roleOf(rules.status, 'a'), 'free');
});

test('seeking begins when every hider is hidden, or when hiding time runs out', () => {
  const players = ['s', 'a', 'b'];
  const rules = new HideSeekRules('hideSeek', () => 0);
  for (const id of players) rules.markLoaded(id, players);
  rules.start(players, 10);
  rules.setHidden('a', true, 11);
  assert.equal(rules.status.phase, 'hiding');
  assert.equal(rules.setHidden('s', true, 11), false, 'the seeker cannot hide');
  rules.setHidden('a', false, 12);
  rules.setHidden('b', true, 12);
  rules.setHidden('a', true, 13);
  assert.equal(rules.status.phase, 'seeking');
  assert.equal(isFrozen(rules.status, 's'), false);

  const timed = new HideSeekRules('hideSeek', () => 0);
  for (const id of players) timed.markLoaded(id, players);
  timed.start(players, 0);
  timed.update(HIDE_TIME_LIMIT - 1);
  assert.equal(timed.status.phase, 'hiding');
  timed.update(HIDE_TIME_LIMIT);
  assert.equal(timed.status.phase, 'seeking');
});

test('only the seeker tags, found pilots leave the radar, and the last tag ends the round', () => {
  const players = ['s', 'a', 'b'];
  const rules = new HideSeekRules('hideSeek', () => 0);
  for (const id of players) rules.markLoaded(id, players);
  rules.start(players, 0);
  assert.equal(rules.tag('s', 'a', 1), false, 'no tagging while hiding');
  rules.setHidden('a', true, 1); rules.setHidden('b', true, 1);
  assert.equal(rules.tag('a', 'b', 2), false, 'hiders cannot tag');
  assert.equal(rules.tag('s', 'a', 2), true);
  assert.equal(rules.tag('s', 'a', 2), false, 'already found');
  assert.equal(roleOf(rules.status, 'a'), 'found');
  assert.deepEqual(remainingHiders(rules.status), ['b']);
  assert.equal(canRespawn(rules.status, 'b'), false, 'hiders cannot teleport away');
  assert.equal(canRespawn(rules.status, 'a'), true);
  rules.tag('s', 'b', 3);
  assert.equal(rules.status.phase, 'ended');
  assert.equal(rules.status.outcome, 'allFound');
  assert.equal(rules.start(players, 4), true, 'play again');
  assert.equal(rules.status.round, 2);
  assert.deepEqual(rules.status.found, []);
});

test('leaving pilots end or advance the round cleanly', () => {
  const players = ['s', 'a', 'b'];
  const rules = new HideSeekRules('hideSeek', () => 0);
  for (const id of players) rules.markLoaded(id, players);
  rules.start(players, 0);
  rules.setHidden('a', true, 1);
  rules.removePlayer('b', 2);
  assert.equal(rules.status.phase, 'seeking', 'the only unhidden hider left');
  rules.removePlayer('s', 3);
  assert.equal(rules.status.phase, 'ended');
  assert.equal(rules.status.outcome, 'aborted');
  assert.equal(rules.status.loaded.includes('s'), false);
});

test('the simulation freezes the seeker and turns a paint hit into a find', () => {
  const game = new GameSimulation(() => 0, 'hideSeek');
  const seeker = game.addPlayer('s', 'Seeker');
  const hider = game.addPlayer('h', 'Hider');
  game.markLoaded('s'); game.markLoaded('h');
  assert.equal(game.startRound(), true);
  assert.equal(game.rules.status.seekerId, 's');

  seeker.position = clearShot(); seeker.yaw = 0;
  hider.position = { ...seeker.position, z: seeker.position.z + 1.5 };
  seeker.invulnerableUntil = hider.invulnerableUntil = 0;
  const frozenAt = { ...seeker.position };
  let seq = 0;
  for (let i = 0; i < 30; i++) { game.setInput('s', { ...NEUTRAL_CONTROLS, seq: ++seq, forward: 1, fire: true }); game.update(dt); }
  assert.deepEqual(seeker.position, frozenAt, 'blindfolded seeker cannot move');
  assert.equal(seeker.shots, 0, 'or shoot');

  assert.equal(game.setHidden('h', true), true);
  assert.equal(game.rules.status.phase, 'seeking');
  for (let i = 0; i < 12; i++) { game.setInput('s', { ...NEUTRAL_CONTROLS, seq: ++seq, fire: true }); game.update(dt); }
  assert.deepEqual(game.rules.status.found, ['h']);
  assert.equal(game.rules.status.phase, 'ended');
  assert.equal(hider.respawnAt, 0, 'found pilots keep flying');

  const snapshot = game.snapshot();
  assert.equal(snapshot.game?.phase, 'ended');
  snapshot.game!.found.push('mutated');
  assert.deepEqual(game.rules.status.found, ['h'], 'snapshots are copies');
  const update = applySnapshotUpdate(snapshot, { ...game.snapshot(false), game: undefined });
  assert.equal(update.game?.phase, 'ended', 'missing game keeps the previous status');
  advance(game, .1);
});
