import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { overlapsWorld, rayWorld, sweepWorld } from '@huis/house/shared/collision';
import { FLOOR_Y, cellAt, decodeGrid, discFits, type GridFile } from '../src/sim/grid';
import { rasteriseGrid } from '../src/sim/gridBake';
import { BASE, GROUND_LANES, LANES, LANE_SPREAD, SURFACES, createMap, lanePoint, siteAt, type LanePoint } from '../src/sim/map';

const file = JSON.parse(readFileSync(new URL('../src/sim/grid.generated.json', import.meta.url), 'utf8')) as GridFile;
const grid = decodeGrid(file);
const map = createMap(grid);

test('the committed grid matches a fresh bake from the collision mesh', () => {
  const rows = rasteriseGrid({ ray: rayWorld, overlaps: overlapsWorld });
  assert.deepEqual(rows, file.rows);
});

test('ground lanes stay on walkable floor with room to spread', () => {
  const point = {} as LanePoint;
  for (const lane of GROUND_LANES) {
    assert.ok(lane.length > 20, `${lane.id} lane is long enough to defend`);
    for (let distance = 0; distance <= lane.length; distance += 0.1) {
      for (const lateral of [-LANE_SPREAD, 0, LANE_SPREAD]) {
        lanePoint(lane, distance, lateral, point);
        assert.ok(discFits(grid, point.x, point.z, 0.14, true),
          `${lane.id} lane leaves the floor at ${distance.toFixed(1)} (${point.x.toFixed(2)}, ${point.z.toFixed(2)}), lateral ${lateral}`);
      }
    }
  }
});

test('a vehicle-sized sphere can travel each ground lane through the real house', () => {
  const a = {} as LanePoint;
  const b = {} as LanePoint;
  for (const lane of GROUND_LANES) {
    for (let distance = 0; distance + 0.3 <= lane.length; distance += 0.3) {
      lanePoint(lane, distance, 0, a);
      lanePoint(lane, distance + 0.3, 0, b);
      // The swivel chair is removed in this game; skip its footprint.
      if (a.x > 17 && a.x < 19.25 && a.z > -9.5 && a.z < -7.2) continue;
      const hit = sweepWorld({ x: a.x, y: FLOOR_Y + 0.4, z: a.z }, { x: b.x, y: FLOOR_Y + 0.4, z: b.z }, 0.3);
      assert.equal(hit, null, `${lane.id} lane is blocked near (${a.x.toFixed(2)}, ${a.z.toFixed(2)})`);
    }
  }
});

test('lanes end at the fort door and the door is open floor', () => {
  for (const lane of [LANES.east, LANES.west, LANES.air]) {
    assert.ok(Math.hypot(lane.xs[lane.xs.length - 1] - BASE.door.x, lane.zs[lane.zs.length - 1] - BASE.door.z) < 0.15);
  }
  assert.equal(cellAt(grid, BASE.door.x, BASE.door.z), 1);
});

test('placement rules: lanes, furniture tops, walls and the fort', () => {
  assert.equal(siteAt(map, 12.2, -18, false).ok, false, 'on the east lane');
  assert.equal(siteAt(map, 11.2, -12.3, false).ok, true, 'open floor beside the lane');
  assert.equal(siteAt(map, 21.5, -10, false).ok, false, 'inside the outer wall');
  assert.equal(siteAt(map, BASE.x, BASE.z, false).ok, false, 'inside the fort');
  const table = siteAt(map, 14.3, -4.1, false);
  assert.ok(table.ok && table.surface?.id === 'coffee-table' && table.y > FLOOR_Y);
  assert.equal(siteAt(map, 14.3, -4.1, true).ok, false, 'heavy tower on the coffee table');
  assert.equal(siteAt(map, 13.1, -4.1, false).ok, false, 'hanging over the table edge');
  assert.equal(siteAt(map, 4, -17.5, false).ok, false, 'behind the WC door');
});

test('furniture tops are real: something solid lies just under each one', () => {
  for (const surface of SURFACES) {
    const x = (surface.minX + surface.maxX) / 2;
    const z = (surface.minZ + surface.maxZ) / 2;
    const hit = rayWorld({ x, y: surface.y + 0.6, z }, { x, y: surface.y - 0.4, z });
    assert.ok(hit && Math.abs(hit.position.y - surface.y) < 0.12, `${surface.id} top is at ${hit?.position.y.toFixed(2)}, expected ${surface.y}`);
  }
});
