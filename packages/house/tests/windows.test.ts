import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import windows from '../src/shared/window-collision.json';
import { sweepWorld } from '../src/shared/collision';
import { DOORS, createDoorStates, sweepDoors } from '../src/shared/doors';

test('fixed window collision matches the house asset and excludes moving veranda panes', () => {
    const bytes = readFileSync(new URL('../public/models/house.glb', import.meta.url));
    assert.equal(windows.sourceSha256, createHash('sha256').update(bytes).digest('hex'));
    assert.ok(windows.panes.length >= 15);
    assert.ok(windows.panes.every(pane => !pane.name.includes('veranda two panel sliding doors')));
});
test('drones cannot cross front, bedroom, rear, or roof glazing', () => {
    for (const name of ['1 front 0 glass', 'Bedroom 1 / window glazing', 'Rear photo / laundry horizontal black window glass', 'Veranda glazed roof']) {
        const pane = windows.panes.find(pane => pane.name === name)!;
        assert.ok(pane, name);
        const offset = pane.firstTriangle * 9;
        const a = new Vector3().fromArray(windows.positions, offset);
        const b = new Vector3().fromArray(windows.positions, offset + 3);
        const c = new Vector3().fromArray(windows.positions, offset + 6);
        const center = a.clone().add(b).add(c).multiplyScalar(1/3);
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        const start = center.clone().addScaledVector(normal, .5);
        const end = center.clone().addScaledVector(normal, -.5);
        assert.ok(sweepWorld(start, end, .16), name);
        assert.ok(sweepWorld(end, start, .16), `${name}, reverse side`);
    }
});
test('veranda slider is impassable closed and opens a clear passage', () => {
    const index = DOORS.findIndex(door => door.label === 'Veranda slider');
    const door = DOORS[index];
    const center = {x:(door.min[0]+door.max[0])/2,y:(door.min[1]+door.max[1])/2,z:(door.min[2]+door.max[2])/2};
    const start = {...center,z:center.z+.5}, end={...center,z:center.z-.5};
    const states = createDoorStates();
    assert.ok(sweepDoors(start,end,.16,states));
    states[index].fraction=1;
    assert.equal(sweepDoors(start,end,.16,states),null);
    assert.equal(sweepWorld(start,end,.16),null);
});
