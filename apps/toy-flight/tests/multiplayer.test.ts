import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { Client, type Room } from '@colyseus/sdk';
import { MAX_PILOTS, applySnapshotUpdate, type Snapshot, type SnapshotUpdate } from '../src/shared/protocol.js';

let server: ChildProcess;
let endpoint = '';
let output = '';
const joined: Room[] = [];

before(async () => {
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  endpoint = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', chunk => { output += String(chunk); });
  server.stderr?.on('data', chunk => { output += String(chunk); });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try { if ((await fetch(`${endpoint}/health`)).ok) return; } catch { /* booting */ }
    await delay(100);
  }
  throw new Error(`Server failed to start: ${output}`);
});

after(async () => {
  await Promise.all(joined.map(room => room.leave().catch(() => undefined)));
  server?.kill('SIGTERM');
});

function observe(room: Room) {
  const history = new Map<number, Snapshot>();
  let latest: Snapshot | undefined;
  room.onMessage('snapshot', (update: SnapshotUpdate) => {
    const snapshot = applySnapshotUpdate(latest, update);
    latest = snapshot;
    history.set(snapshot.tick, snapshot);
    if (history.size > 100) history.delete(history.keys().next().value!);
  });
  room.send('ready');
  return {
    history,
    latest: () => latest,
    async until(predicate: (s: Snapshot) => boolean, timeout = 5000): Promise<Snapshot> {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (latest && predicate(latest)) return latest;
        await delay(20);
      }
      throw new Error(`Snapshot condition timed out. Last: ${JSON.stringify(latest)}`);
    },
  };
}

test('three real clients share state, reject a full room, synchronize paint, and remove departures', { timeout: 20000 }, async () => {
  const first = await new Client(endpoint).create('house', { name: 'Coral' });
  joined.push(first);
  const a = observe(first);
  const second = await new Client(endpoint).joinById(first.roomId, { name: 'Mint' });
  joined.push(second);
  const b = observe(second);
  await a.until(s => s.players.length === 2);
  await b.until(s => s.players.length === 2);

  const command = (seq: number) => neutral(seq);
  first.send('inputs', Array.from({ length: 17 }, (_, index) => command(index + 1)));
  await delay(100);
  assert.equal(a.latest()!.players.find(p => p.id === first.sessionId)!.lastSeq, 0, 'oversized input batches are rejected');
  first.send('inputs', Array.from({ length: 4 }, (_, index) => command(index + 1)));
  await a.until(s => s.players.find(p => p.id === first.sessionId)?.lastSeq === 4);

  // Hold fire without moving: projectiles eventually paint a surface.
  let sequence = 4;
  const firing = setInterval(() => first.send('input', { ...neutral(++sequence), fire: true }), 40);
  try { await a.until(s => s.paints?.length > 0, 6000); } finally { clearInterval(firing); }
  first.send('input', neutral(++sequence));

  const third = await new Client(endpoint).joinById(first.roomId, { name: 'Lilac' });
  joined.push(third);
  const c = observe(third);
  const lateJoin = await c.until(s => s.players.length === 3 && s.paints?.length > 0);
  assert.equal(new Set(lateJoin.players.map(p => p.color)).size, 3);
  const fillers = [];
  for (let index = 3; index < MAX_PILOTS; index++) fillers.push(await new Client(endpoint).joinById(first.roomId, { name: `Filler ${index}` }));
  await assert.rejects(() => new Client(endpoint).joinById(first.roomId, { name: 'One too many' }));
  for (const filler of fillers) await filler.leave();
  await a.until(s => s.players.length === 3);

  const beforeFlight = a.latest()!.players.find(p => p.id === first.sessionId)!.position;
  const flying = setInterval(() => first.send('input', { ...neutral(++sequence), forward: 1, lift: .4, fire: true }), 40);
  await delay(600);
  clearInterval(flying);
  first.send('input', neutral(++sequence));
  await delay(200);
  const afterFlight = a.latest()!.players.find(p => p.id === first.sessionId)!.position;
  assert.ok(Math.hypot(afterFlight.x - beforeFlight.x, afterFlight.y - beforeFlight.y, afterFlight.z - beforeFlight.z) > 0.2, 'authoritative drone moves while clients stay synchronized');
  const commonTick = [...a.history.keys()].reverse().find(tick => b.history.has(tick) && c.history.has(tick));
  assert.ok(commonTick !== undefined, 'clients must receive a common authoritative tick');
  assert.deepEqual(a.history.get(commonTick), b.history.get(commonTick));
  assert.deepEqual(a.history.get(commonTick), c.history.get(commonTick));

  await third.leave();
  joined.splice(joined.indexOf(third), 1);
  const remaining = await a.until(s => s.players.length === 2);
  assert.ok(!remaining.players.some(p => p.id === third.sessionId));

  // An independent private room must not inherit the first room's players or paint.
  const separate = await new Client(endpoint).create('house', { name: 'Elsewhere' });
  joined.push(separate);
  const isolated = await observe(separate).until(s => s.players.length === 1);
  assert.equal(isolated.paints.length, 0);
  assert.notEqual(separate.roomId, first.roomId);
});

function neutral(seq: number) {
  return { seq, yaw: 0, pitch: 0, forward: 0, strafe: 0, lift: 0, precision: false, fire: false, reset: false };
}

test('rooms can be created under a chosen name, which must be unique', async () => {
  const client = new Client(endpoint);
  const first = await client.create('house', { name: 'Ann', mode: 'free', roomName: 'Family Friday!' });
  joined.push(first);
  assert.equal(first.roomId, 'family-friday');
  const second = await new Client(endpoint).joinById('family-friday', { name: 'Bob' });
  joined.push(second);
  assert.equal(second.roomId, 'family-friday');
  await assert.rejects(new Client(endpoint).create('house', { name: 'Cy', roomName: 'family-friday' }), /already taken/);
  await assert.rejects(new Client(endpoint).create('house', { name: 'Cy', roomName: 'ab' }), /at least/);
});
