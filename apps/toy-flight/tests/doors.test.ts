import { targetedDoor } from '../src/shared/interaction';
import { chaseCameraPose } from '../src/shared/aim';
import { doorWorldPoint, intersectBox } from '@huis/house/shared/doors';
import type { DroneState, Vec3 } from '../src/shared/protocol';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DOORS, ROOM_DOOR_COUNT, createDoorStates, sweepDoors, overlapsDoor, advanceDoors } from '@huis/house/shared/doors';
import { GameSimulation } from '../src/server/simulation';
import { houseModelPath } from '@huis/house/node/paths';
const index = DOORS.findIndex(d => d.label === 'Ground bedroom');
const d = DOORS[index];
const center = { x: (d.min[0] + d.max[0]) / 2, y: (d.min[1] + d.max[1]) / 2, z: (d.min[2] + d.max[2]) / 2 };
function aimAt(player: DroneState, point: Vec3, states: ReturnType<typeof createDoorStates>): void {
    player.yaw = Math.atan2(point.x-player.position.x, point.z-player.position.z);
    let lo = -1.13, hi = 1.13;
    for (let n = 0; n < 40; n++) {
        player.pitch = (lo+hi)/2;
        const {position: c, target: t} = chaseCameraPose(player, states);
        const desired = Math.atan2(point.y-c.y, Math.hypot(point.x-c.x, point.z-c.z));
        const actual = Math.atan2(t.y-c.y, Math.hypot(t.x-c.x, t.z-c.z));
        if (actual < desired) lo = player.pitch; else hi = player.pitch;
    }
}

test('closed leaf blocks crossing; open leaf clears its original doorway', () => {
    const states = createDoorStates();
    const start = { ...center, x: center.x - .5 }, end = { ...center, x: center.x + .5 };
    assert.ok(sweepDoors(start, end, .16, states));
    assert.ok(overlapsDoor(center, .16, index, 0));
    states[index].fraction = 1;
    assert.equal(sweepDoors(start, end, .16, states), null);
    assert.equal(overlapsDoor(center, .16, index, 1), false);
});
test('door animation pauses for an occupant and resumes once clear', () => {
    const states = createDoorStates();
    states[index].opening = true;
    advanceDoors(states, .05, [center], .16);
    assert.equal(states[index].fraction, 0);
    for (let n = 0; n < 24; n++)
        advanceDoors(states, .05, [], .16);
    assert.equal(states[index].fraction, 1);
});
test('interaction rejects a distant player and door state is per room', () => {
    const first = new GameSimulation(() => 0), second = new GameSimulation(() => 0);
    const player = first.addPlayer('pilot', 'Pilot');
    player.position = { x: 100, y: 100, z: 100 };
    assert.equal(targetedDoor(player, first.doors), -1);
    assert.equal(first.toggleDoor('pilot'), false);
    first.doors[index].opening = true;
    assert.equal(second.doors[index].opening, false);
    assert.equal(first.snapshot().doors?.[index].opening, true);
});
test('an aimed pilot can open the door once, with repeat requests ignored', () => {
    const game = new GameSimulation(() => 0);
    const player = game.addPlayer('pilot', 'Pilot');
    player.position = { ...center, x: center.x - .6 };
    aimAt(player, center, game.doors);
    assert.equal(targetedDoor(player, game.doors), index);
    assert.equal(game.toggleDoor('pilot'), true);
    assert.equal(game.toggleDoor('pilot'), false);
    assert.equal(game.doors[index].opening, true);
});

test('a second deliberate interaction closes the door and restores collision', () => {
 const game = new GameSimulation(() => 0);
 const player = game.addPlayer('pilot', 'Pilot');
 player.position = {...center, x: center.x - .6};
 aimAt(player, center, game.doors);
 assert.equal(game.toggleDoor('pilot'), true);
 advanceDoors(game.doors, 1.1, [], .16);
 game.time += .3;
 aimAt(player, doorWorldPoint(center, index, 1), game.doors);
 assert.equal(game.toggleDoor('pilot'), true);
 assert.equal(game.doors[index].opening, false);
 advanceDoors(game.doors, 1.1, [], .16);
 assert.equal(game.doors[index].fraction, 0);
 assert.ok(overlapsDoor(center, .16, index, 0));
});
test('closing pauses before an occupied doorway, then finishes when clear', () => {
 const states = createDoorStates();
 states[index].fraction = .03;
 advanceDoors(states, .05, [center], .16);
 assert.equal(states[index].fraction, .03);
 advanceDoors(states, .05, [], .16);
 assert.equal(states[index].fraction, 0);
});

test('hardware removed from the static house belongs to a moving door assembly', async () => {
    const { readFile } = await import('node:fs/promises');
    const { default: patterns } = await import('@huis/house/scripts/door-details.json');
    type Node = { name?: string; children?: number[] };
    async function nodes(file: string): Promise<Node[]> {
        const bytes = await readFile(houseModelPath(file));
        return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()).nodes;
    }
    const house = await nodes('house.glb'), doors = await nodes('doors.glb');
    const canonical = (name: string) => name.replace(/\.\d+$/, '');
    const movingNames = new Map<string, number>();
    function visit(index: number): void {
        const node = doors[index];
        const name = canonical(node.name ?? '');
        movingNames.set(name, (movingNames.get(name) ?? 0) + 1);
        node.children?.forEach(visit);
    }
    for (const door of DOORS.slice(0, ROOM_DOOR_COUNT)) {
        const root = doors.findIndex(node => node.name === door.id);
        assert.ok(root >= 0, `Missing assembly ${door.label}`);
        visit(root);
    }
    const removedNames = new Map<string, number>();
    for (const node of house) {
        const name = node.name ?? '';
        if (!patterns.some(pattern => new RegExp(pattern, 'i').test(name))) continue;
        const key = canonical(name);
        removedNames.set(key, (removedNames.get(key) ?? 0) + 1);
    }
    // A full export already leaves door hardware out of the static house; the
    // moving assemblies must still carry every piece the patterns describe.
    const patternedMoving = [...movingNames.keys()].filter(name => patterns.some(pattern => new RegExp(pattern, 'i').test(name)));
    assert.ok(patternedMoving.length > 0, 'Door assemblies carry no hardware matching the removal patterns');
    for (const [name, count] of removedNames) {
        assert.ok((movingNames.get(name) ?? 0) >= count, `Missing moving hardware: ${name}`);
    }
});


test('proximity alone cannot open a door and aim input must be finite', () => {
    const game = new GameSimulation(() => 0);
    const player = game.addPlayer('pilot', 'Pilot');
    player.position = { ...center, x: center.x-.6 };
    player.yaw = -Math.PI/2;
    player.pitch = 0;
    assert.equal(targetedDoor(player, game.doors), -1);
    assert.equal(game.toggleDoor('pilot'), false);
    game.time += .3;
    assert.equal(game.toggleDoor('pilot', {yaw: NaN, pitch: 0}), false);
    game.time += .3;
    aimAt(player, center, game.doors);
    const aim = { yaw: player.yaw, pitch: player.pitch };
    player.yaw = -Math.PI/2;
    assert.equal(game.toggleDoor('pilot', aim), true, 'immediate G uses validated current mouse aim');
});

test('thin component contact blocks inward travel and allows backing away', () => {
    const box = { min:[0,0,0], max:[.03,2,2] };
    assert.equal(intersectBox({x:-.15,y:1,z:1},{x:4,y:1,z:1},box,.16)?.t, 0);
    assert.equal(intersectBox({x:-.15,y:1,z:1},{x:-1,y:1,z:1},box,.16), null);
    assert.ok(intersectBox({x:-8,y:1,z:1},{x:8,y:1,z:1},box,.16));
});

test('a sweep beginning outside a rounded corner still catches later side contact', () => {
    const box = { min:[0,0,0], max:[1,1,1] };
    const hit=intersectBox({x:-.15,y:.5,z:-.15},{x:-.15,y:.5,z:1.3},box,.16);
    assert.ok(hit && hit.t > 0 && hit.t < .1);
    assert.ok(hit.normal.x<0 && hit.normal.z<0);
    assert.equal(intersectBox({x:-.16,y:.5,z:.3},{x:-.16,y:.5,z:.8},box,.16),null,'tangent sliding remains possible');
});
