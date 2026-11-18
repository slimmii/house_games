/** End-to-end G/HUD check with the production house and server-owned fixtures. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { matchMaker } from '@colyseus/core';
import { createGameServer, type HouseRoom } from '../src/server/index';
import { CLOSET_DOORS, CLOSET_DRAWER_BOXES, CLOSET_UNITS } from '@huis/house/shared/closet-interiors';
import { DOORS, doorWorldPoint, insideDrawer, overlapsDoor } from '@huis/house/shared/doors';
import { overlapsWorld } from '@huis/house/shared/collision';
import { DRONE_RADIUS, type Vec3 } from '../src/shared/protocol';

const server = await createGameServer({ port: 0, host: '127.0.0.1' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error('Inside cupboard action did not complete');
}
try {
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.locator('#createButton:enabled').waitFor({ timeout: 90000 });
  await page.locator('#playerName').fill('Inside cupboard test');
  await page.locator('#createButton').click();
  await page.waitForFunction(() => document.querySelector('#pilotCount')?.textContent?.includes('1 / 3'));
  const roomId = (await page.locator('#roomBadge').textContent())!.trim();
  const game = (matchMaker.getLocalRoomById(roomId) as HouseRoom).simulation;
  const pilot = [...game.players.values()][0].drone;
  const entry = CLOSET_DOORS.find(door => door.id === 'closet_108')!;
  const index = DOORS.findIndex(door => door.id === entry.id);
  const unit = CLOSET_UNITS.find(unit => unit.id === entry.unitId)!;
  let interior: Vec3 | undefined;
  for (const height of [.25, .35, .65, .8]) {
    const point = { x: (unit.interior.min[0] + unit.interior.max[0]) / 2,
      y: unit.interior.min[1] + height * (unit.interior.max[1] - unit.interior.min[1]),
      z: (entry.min[2] + entry.max[2]) / 2 };
    if (!overlapsWorld(point, DRONE_RADIUS) && !DOORS.some((_, i) => overlapsDoor(point, DRONE_RADIUS, i, game.doors[i].fraction))) {
      interior = point; break;
    }
  }
  assert.ok(interior, 'the fixture must be physically inside empty storage');
  pilot.position = interior;
  pilot.velocity = { x: 0, y: 0, z: 0 };
  pilot.yaw = -Math.PI / 2;
  await page.waitForFunction(() => document.querySelector('.door-prompt')?.textContent?.includes('Open')
    && document.querySelector('.door-prompt')?.textContent?.includes('from inside'));
  await page.keyboard.press('g');
  await until(() => game.doors[index].fraction === 1);
  await page.waitForFunction(() => document.querySelector('.door-prompt')?.textContent?.includes('Close'));
  await delay(300);
  await page.keyboard.press('g');
  await until(() => game.doors[index].fraction === 0);
  await page.waitForFunction(() => document.querySelector('.door-prompt')?.textContent?.includes('Open'));
  await delay(300);
  await page.keyboard.press('g');
  await until(() => game.doors[index].fraction === 1);
  await page.waitForFunction(() => document.querySelector('.door-prompt')?.textContent?.includes('Close'));

  const drawer = DOORS.findIndex(door => door.id === 'closet_017');
  const [bottom] = CLOSET_DRAWER_BOXES[DOORS[drawer].id];
  const start = { x: (bottom.min[0] + bottom.max[0]) / 2,
    y: (bottom.max[1] + DOORS[drawer].max[1]) / 2,
    z: (bottom.min[2] + bottom.max[2]) / 2 };
  assert.equal(insideDrawer(start, drawer, 0), true);
  assert.equal(overlapsWorld(start, DRONE_RADIUS), false);
  assert.equal(overlapsDoor(start, DRONE_RADIUS, drawer, 0), false);
  pilot.position = { ...start };
  pilot.velocity = { x: 0, y: 0, z: 0 };
  await page.waitForFunction(() => document.querySelector('.door-prompt')?.textContent?.includes('bench drawer front 1 from inside'));
  await page.keyboard.press('g');
  await until(() => game.doors[drawer].fraction === 1);
  const extended=doorWorldPoint(start,drawer,1);
  assert.ok(Math.hypot(pilot.position.x-extended.x,pilot.position.y-extended.y,pilot.position.z-extended.z)<.01,
    'server carries pilot out with the drawer');
  await page.waitForFunction(() => document.querySelector('.door-prompt')?.textContent?.includes('Close'));
  await page.waitForTimeout(300);
  await page.keyboard.press('g');
  await until(() => game.doors[drawer].fraction === 0);
  assert.ok(Math.hypot(pilot.position.x-start.x,pilot.position.y-start.y,pilot.position.z-start.z)<.01,
    'server carries pilot back with the drawer');
  await page.waitForFunction(() => document.querySelector('.door-prompt')?.textContent?.includes('Open'));
  await page.waitForTimeout(300);
  await page.keyboard.press('g');
  await until(() => game.doors[drawer].fraction === 1);
  await page.waitForFunction(() => document.querySelector('.door-prompt')?.textContent?.includes('Close'));
  await mkdir('test-results/closets', { recursive: true });
  await page.screenshot({ path: 'test-results/closets/inside-toggle.png' });
  assert.deepEqual(errors, []);
  console.log('Production-house browser check passed: inside Open/Close/Open and bidirectional drawer carry; zero browser errors.');
} finally {
  await browser.close();
  await server.close();
}
