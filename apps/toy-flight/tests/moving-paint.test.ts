import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { matchMaker } from '@colyseus/core';
import { Client, type Room } from '@colyseus/sdk';
import { GameSimulation } from '../src/server/simulation';
import { createGameServer, type HouseRoom } from '../src/server/index';
import { CLOSET_STATIC_BOXES } from '@huis/house/shared/closet-interiors';
import { DOORS, createDoorStates, doorComponentBoxes, doorWorldPoint } from '@huis/house/shared/doors';
import {
  createPaintAttachment,
  doorWorldVector,
  paintWorldPoint,
  resolvePaintPose,
} from '../src/shared/paint';
import { applySnapshotUpdate, MAX_PAINTS, type PaintMark, type Snapshot, type SnapshotUpdate, type Vec3 } from '../src/shared/protocol';

const close = (actual: Vec3, expected: Vec3, epsilon = 1e-9) => {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y, actual.z - expected.z) < epsilon,
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
};

function shootBox(game: GameSimulation, doorId: string, boxIndex: number, axis: 0 | 1 | 2, sign: -1 | 1): PaintMark {
  const index = DOORS.findIndex(door => door.id === doorId);
  const box = DOORS[index].collisionBoxes[boxIndex];
  const values = box.min.map((value, component) => (value + box.max[component]) / 2);
  const start = [...values], end = [...values];
  start[axis] = box[sign < 0 ? 'min' : 'max'][axis] + sign * .2;
  end[axis] = box[sign < 0 ? 'min' : 'max'][axis] - sign * .2;
  const dt = .01;
  game.projectiles.push({
    id: game.projectiles.length + 1,
    owner: 'fixture',
    color: '#f27654',
    position: { x: start[0], y: start[1], z: start[2] },
    velocity: { x: (end[0] - start[0]) / dt, y: (end[1] - start[1]) / dt, z: (end[2] - start[2]) / dt },
    bornAt: game.time,
  });
  game.update(dt);
  assert.equal(game.projectiles.length, 0);
  return game.paints.at(-1)!;
}

test('closed-pose attachments rigidly follow every door motion kind', () => {
  for (const id of ['door_0', 'door_5', 'closet_000', 'closet_017', 'closet_123']) {
    const index = DOORS.findIndex(door => door.id === id), impactFraction = .37, displayFraction = .82;
    const closedPosition = { x: DOORS[index].pivot[0] + .41, y: DOORS[index].pivot[1] + .63, z: DOORS[index].pivot[2] - .27 };
    const closedNormal = { x: 0, y: 1, z: 0 };
    const impactPosition = doorWorldPoint(closedPosition, index, impactFraction);
    const impactNormal = doorWorldVector(closedNormal, index, impactFraction);
    const attachment = createPaintAttachment(index, impactFraction, impactPosition, impactNormal);
    close(attachment.position, closedPosition);
    close(attachment.normal, closedNormal);
    const mark: PaintMark = { id: 1, position: impactPosition, normal: impactNormal, color: '#fff', size: .15, attachment };
    const states = createDoorStates(); states[index].fraction = displayFraction;
    const resolved = resolvePaintPose(mark, states);
    close(resolved.position, doorWorldPoint(closedPosition, index, displayFraction));
    close(resolved.normal, doorWorldVector(closedNormal, index, displayFraction));
    const closedVertex = { ...closedPosition, x: closedPosition.x + .08, z: closedPosition.z + .03 };
    close(paintWorldPoint(mark, closedVertex, states), doorWorldPoint(closedVertex, index, displayFraction));
  }
});

test('the server attaches paint to the closest moving front and compound drawer tray, while static shells stay static', () => {
  for (const [doorId, boxIndex, axis, sign] of [
    ['door_0', 0, 2, -1],
    ['closet_000', 0, 0, -1],
    ['closet_123', 0, 2, -1],
    // The upper edge of a generated drawer side is a Y-normal surface. Its
    // vertices must still translate with the tray even though its normal does not.
    ['closet_017', 3, 1, 1],
  ] as const) {
    const game = new GameSimulation(() => 0);
    const mark = shootBox(game, doorId, boxIndex, axis, sign);
    assert.equal(mark.attachment?.doorId, doorId);
  }

  const game = new GameSimulation(() => 0), box = CLOSET_STATIC_BOXES[0];
  const y = (box.min[1] + box.max[1]) / 2, z = (box.min[2] + box.max[2]) / 2, dt = .01;
  game.projectiles.push({
    id: 1, owner: 'fixture', color: '#58bdb0', bornAt: 0,
    position: { x: box.min[0] - .15, y, z }, velocity: { x: .3 / dt, y: 0, z: 0 },
  });
  game.update(dt);
  assert.equal(game.paints.length, 1);
  assert.equal(game.paints[0].attachment, undefined);
});

test('a real projectile impact on a partly open cupboard roundtrips through its closed pose', () => {
  const game = new GameSimulation(() => 0), index = DOORS.findIndex(door => door.id === 'closet_000');
  const box = DOORS[index].collisionBoxes[0], dt = .01, initialFraction = .37;
  const impactFraction = initialFraction + dt / 1.1;
  game.doors[index] = { fraction: initialFraction, opening: true };
  const center = box.min.map((value, axis) => (value + box.max[axis]) / 2);
  const closedImpact = { x: box.min[0], y: center[1], z: center[2] };
  const closedStart = { ...closedImpact, x: closedImpact.x - .2 };
  const closedEnd = { ...closedImpact, x: closedImpact.x + .2 };
  const start = doorWorldPoint(closedStart, index, impactFraction);
  const end = doorWorldPoint(closedEnd, index, impactFraction);
  game.projectiles.push({
    id: 1, owner: 'fixture', color: '#b096e7', position: start, bornAt: 0,
    velocity: { x: (end.x - start.x) / dt, y: (end.y - start.y) / dt, z: (end.z - start.z) / dt },
  });
  game.update(dt);

  assert.equal(game.doors[index].fraction, impactFraction);
  assert.equal(game.paints.length, 1);
  const mark = game.paints[0];
  assert.equal(mark.attachment?.doorId, DOORS[index].id);
  close(mark.position, doorWorldPoint(closedImpact, index, impactFraction));
  close(mark.attachment!.position, closedImpact);
  close(mark.attachment!.normal, { x: -1, y: 0, z: 0 });

  const originalImpact = { ...mark.position };
  game.doors[index].fraction = 0;
  close(resolvePaintPose(mark, game.doors).position, closedImpact);
  game.doors[index].fraction = 1;
  close(resolvePaintPose(mark, game.doors).position, doorWorldPoint(closedImpact, index, 1));
  assert.deepEqual(mark.position, originalImpact, 'the compatibility impact stays at the original hit');
});

test('a server hit on garage section 11 keeps that articulated component through snapshots and motion',()=>{
  const game=new GameSimulation(()=>0),index=DOORS.findIndex(door=>door.id==='door_5'),partIndex=11,dt=.01;
  const impactFraction=.5+dt/2.8,box=doorComponentBoxes(index,partIndex,'collision')[0];
  const closed={
    x:(box.min[0]+box.max[0])/2,
    y:(box.min[1]+box.max[1])/2,
    z:(box.min[2]+box.max[2])/2,
  };
  const center=doorWorldPoint(closed,index,impactFraction,partIndex);
  const normal=doorWorldVector({x:0,y:0,z:1},index,impactFraction,partIndex);
  const start={x:center.x+normal.x*.25,y:center.y+normal.y*.25,z:center.z+normal.z*.25};
  const end={x:center.x-normal.x*.25,y:center.y-normal.y*.25,z:center.z-normal.z*.25};
  game.doors[index]={fraction:.5,opening:true};
  game.projectiles.push({
    id:1,owner:'fixture',color:'#58bdb0',position:start,bornAt:0,
    velocity:{x:(end.x-start.x)/dt,y:(end.y-start.y)/dt,z:(end.z-start.z)/dt},
  });
  game.update(dt);
  assert.equal(game.paints.length,1);
  const mark=game.paints[0];
  assert.equal(mark.attachment?.doorId,'door_5');assert.equal(mark.attachment?.partIndex,partIndex);
  close(doorWorldPoint(mark.attachment!.position,index,impactFraction,partIndex),mark.position,1e-7);
  game.doors[index].fraction=.83;
  close(resolvePaintPose(mark,game.doors).position,doorWorldPoint(mark.attachment!.position,index,.83,partIndex),1e-7);
  assert.equal(game.snapshot().paints[0].attachment?.partIndex,partIndex);
});

test('attached paint obeys the cap and snapshots deeply copy its closed pose', () => {
  const game = new GameSimulation(() => 0);
  for (let count = 0; count < MAX_PAINTS + 2; count++) shootBox(game, 'door_0', 0, 2, -1);
  assert.equal(game.paints.length, MAX_PAINTS);
  assert.equal(game.paints[0].id, 3);
  const snapshot = game.snapshot(), stored = game.paints[0], copied = snapshot.paints[0];
  assert.notStrictEqual(copied.attachment, stored.attachment);
  assert.notStrictEqual(copied.attachment?.position, stored.attachment?.position);
  assert.notStrictEqual(copied.attachment?.normal, stored.attachment?.normal);
  const original = copied.attachment!.position.x;
  stored.attachment!.position.x += 5;
  assert.equal(copied.attachment!.position.x, original);
});

test('paint deltas and a late join preserve attachments after their door moves', { timeout: 15000 }, async () => {
  const server = await createGameServer({ port: 0, host: '127.0.0.1' });
  const rooms: Room[] = [], endpoint = `http://127.0.0.1:${server.port}`;
  function observe(room: Room) {
    let latest: Snapshot | undefined;
    room.onMessage('snapshot', (value: SnapshotUpdate) => { latest = applySnapshotUpdate(latest, value); });
    room.send('ready');
    return async (predicate: (snapshot: Snapshot) => boolean) => {
      const until = Date.now() + 4000;
      while (Date.now() < until) { if (latest && predicate(latest)) return latest; await delay(15); }
      throw new Error('paint snapshot not received');
    };
  }
  try {
    const first = await new Client(endpoint).create('house', { name: 'Painter' }); rooms.push(first);
    const existing = observe(first); await existing(snapshot => snapshot.paints.length === 0);
    const room = matchMaker.getLocalRoomById(first.roomId) as HouseRoom;
    const index = DOORS.findIndex(door => door.id === 'door_0');
    const closed = { x: 7, y: 19, z: -19.533 }, normal = { x: 0, y: 0, z: -1 };
    const attachment = createPaintAttachment(index, 0, closed, normal);
    room.simulation.paints.push({ id: 1, position: { ...closed }, normal: { ...normal }, color: '#f27654', size: .14, attachment });
    const delta = await existing(snapshot => snapshot.paints.length === 1);
    assert.deepEqual(delta.paints[0].attachment, attachment);

    room.simulation.doors[index] = { fraction: 1, opening: true };
    const late = await new Client(endpoint).joinById(first.roomId, { name: 'Late pilot' }); rooms.push(late);
    const lateJoin = observe(late);
    const joined = await lateJoin(snapshot => snapshot.paints.length === 1 && snapshot.doors?.[index].fraction === 1);
    assert.deepEqual(joined.paints[0].attachment, attachment);
    close(resolvePaintPose(joined.paints[0], joined.doors!).position, doorWorldPoint(closed, index, 1));
  } finally {
    await Promise.all(rooms.map(room => room.leave().catch(() => undefined)));
    await server.close();
  }
});
