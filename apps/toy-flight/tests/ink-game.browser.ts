/** Real-time, full-production held-ink check against the authoritative room. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { matchMaker } from '@colyseus/core';
import { Client, type Room } from '@colyseus/sdk';
import { createGameServer, type HouseRoom } from '../src/server/index';
import { overlapsWorld } from '@huis/house/shared/collision';
import { DRONE_RADIUS, type DroneState } from '../src/shared/protocol';

const FIRE_MILLISECONDS = 10_000;
const controlledPose = { position: { x: 4, y: 21, z: -6 }, yaw: -Math.PI / 2, pitch: 0 };

const server = await createGameServer({ port: 0, host: '127.0.0.1' });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors: string[] = [];
let holder: Room | undefined;
page.on('pageerror', error => errors.push(error.message));

async function syncControlledPose(drone: DroneState): Promise<void> {
  // Force one authoritative respawn-state transition so the client adopts the
  // fixture's yaw and pitch instead of retaining its locally predicted look.
  drone.respawnAt = game.time + 10;
  drone.yaw = controlledPose.yaw;
  drone.pitch = controlledPose.pitch;
  await page.waitForFunction(() => !document.querySelector('#notice')?.hasAttribute('hidden'));
  drone.position = { ...controlledPose.position };
  drone.velocity = { x: 0, y: 0, z: 0 };
  drone.yaw = controlledPose.yaw;
  drone.pitch = controlledPose.pitch;
  drone.respawnAt = 0;
  drone.invulnerableUntil = 0;
  await page.waitForFunction(() => document.querySelector('#notice')?.hasAttribute('hidden'));
  await delay(200);
}

let game: HouseRoom['simulation'];
try {
  assert.equal(overlapsWorld(controlledPose.position, DRONE_RADIUS), false, 'wall fixture starts in clear air');
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.locator('#createButton:enabled').waitFor({ timeout: 90_000 });
  await page.locator('#playerName').fill('Real-time ink test');
  await page.locator('#createButton').click();
  await page.waitForFunction(() => document.querySelector('#pilotCount')?.textContent?.includes('1 / 3'));
  const roomId = (await page.locator('#roomBadge').textContent())!.trim();
  const liveRoom = matchMaker.getLocalRoomById(roomId) as HouseRoom;
  game = liveRoom.simulation;
  const pilot = [...game.players.values()][0].drone;
  await syncControlledPose(pilot);

  assert.equal(await page.locator('.ink-hud').count(), 0, 'the ink supply box is gone');

  const shotsBefore = pilot.shots;
  const marksBefore = game.paints.length;
  const marksBySecond: number[] = [];
  let firePulseSamples = 0;
  let hitPulseSamples = 0;
  const startedAt = performance.now();
  let nextSampleAt = 1_000;
  await page.keyboard.down('f');
  while (performance.now() - startedAt < FIRE_MILLISECONDS) {
    await delay(30);
    const elapsed = performance.now() - startedAt;
    const classes = await page.locator('.crosshair').getAttribute('class') ?? '';
    if (classes.includes('ink-firing')) firePulseSamples++;
    if (classes.includes('ink-hit')) hitPulseSamples++;
    if (elapsed >= nextSampleAt) {
      marksBySecond.push(game.paints.length - marksBefore);
      nextSampleAt += 1_000;
    }
  }
  const realElapsed = performance.now() - startedAt;
  await mkdir('test-results/ink-game', { recursive: true });
  await page.screenshot({ path: 'test-results/ink-game/held-fire-10s.png' });
  await page.keyboard.up('f');
  const shotsAtRelease = pilot.shots;

  // Allow the final input and in-flight blob to settle, then prove release is
  // stable rather than merely observing a single quiet animation frame.
  await delay(350);
  const shotsAfterSettle = pilot.shots;
  const marksAfterSettle = game.paints.length;
  await delay(500);
  assert.equal(pilot.shots, shotsAfterSettle, 'releasing F stops authoritative fire');
  assert.equal(game.projectiles.length, 0, 'nearby wall consumes every projectile');

  const heldShots = shotsAtRelease - shotsBefore;
  const shots = shotsAfterSettle - shotsBefore;
  const marks = marksAfterSettle - marksBefore;
  assert.ok(realElapsed >= FIRE_MILLISECONDS, `held fire lasted only ${realElapsed.toFixed(0)}ms`);
  assert.ok(realElapsed < FIRE_MILLISECONDS + 500, `browser sampling overran to ${realElapsed.toFixed(0)}ms`);
  assert.ok(heldShots >= 78 && heldShots <= 82, `10s at 8Hz produced ${heldShots} held-fire server shots`);
  assert.ok(shotsAfterSettle - shotsAtRelease <= 2,
    `release allowed ${shotsAfterSettle - shotsAtRelease} additional shots before its next input frame`);
  assert.equal(marks, shots, 'every controlled-wall shot becomes an authoritative mark');
  assert.ok(marksBySecond.length >= 9);
  assert.ok(marksBySecond.every((value, index) => index === 0 || value > marksBySecond[index - 1]),
    `marks did not grow throughout held fire: ${marksBySecond.join(', ')}`);
  assert.ok(firePulseSamples > 20, `observed only ${firePulseSamples} firing-pulse samples`);
  assert.ok(hitPulseSamples > 20, `observed only ${hitPulseSamples} hit-pulse samples`);

  // Keep the private room alive while the production page takes its real
  // leave/rejoin path, then verify its late-join snapshot retains the ink.
  holder = await new Client(`http://127.0.0.1:${server.port}`).joinById(roomId, { name: 'Room holder' });
  holder.onMessage('snapshot', () => undefined);
  holder.send('ready');
  await page.waitForFunction(() => document.querySelector('#pilotCount')?.textContent?.includes('2 / 3'));
  await page.locator('#leaveButton').click();
  await page.locator('#createButton:enabled').waitFor({ timeout: 10_000 });
  await page.locator('#roomName').fill(roomId);
  await page.locator('#joinButton').click();
  await page.waitForFunction(() => document.querySelector('#pilotCount')?.textContent?.includes('2 / 3'));
  assert.equal(game.paints.length, marksAfterSettle, 'leave/rejoin preserves room paint history');
  await page.waitForTimeout(500);
  assert.deepEqual(errors, [], 'production ink flow and rejoin produce no browser errors');

  console.log(JSON.stringify({
    result: 'passed', roomId, realElapsed: Math.round(realElapsed), heldShots, shots, marks,
    marksBySecond, firePulseSamples, hitPulseSamples,
    screenshot: 'test-results/ink-game/held-fire-10s.png', rejoined: true, errors,
  }, null, 2));
} finally {
  await holder?.leave().catch(() => undefined);
  await browser.close();
  await server.close();
}
